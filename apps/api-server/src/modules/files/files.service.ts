import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, isNull, not, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';

import { DATABASE_CONNECTION, type FileEntity, files, NewFile } from '@/database';
import { StorageService } from '../storage/storage.abstract';
import { FileChunkService } from './file-chunk.service';
import { FileUploadStatusDto } from '@/modules/files/dto/upload.dto';
import { FoldersService, isFolderIdRoot } from '@/modules/folders/folders.service';
import { AppConfigService } from '@/config/config.service';
import {
  CreateFile,
  File,
  FileSchema,
  FileStatus,
  RestoreItem,
  UpdateFile,
} from '@agam-space/shared-types';
import { FileDto, isValidFolderAndNotRoot } from '@/modules/folders/dto/folder-content.dto';
import { QuotaService } from '@/modules/quota/quota.service';
import { DrizzleTransaction } from '@/database/database.providers';
import { Blake3Hasher } from '@napi-rs/blake-hash';
import { PublicShareService } from '@/modules/public-share/public-share.service';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: ReturnType<typeof drizzle>,
    private readonly storageService: StorageService,
    private readonly fileChunkService: FileChunkService,
    @Inject(forwardRef(() => FoldersService))
    private readonly foldersService: FoldersService,
    @Inject(forwardRef(() => PublicShareService))
    private readonly publicShareService: PublicShareService,
    private readonly appConfigService: AppConfigService,

    @Inject(forwardRef(() => QuotaService))
    private readonly quotaService: QuotaService
  ) {}

  async getFilesUnderParent(
    userId: string,
    parentFolderId?: string,
    includeTrashed: boolean = false
  ): Promise<FileEntity[]> {
    const baseConditions = [
      eq(files.userId, userId),
      parentFolderId ? eq(files.parentId, parentFolderId) : isNull(files.parentId),
    ];

    const excludeStatuses = [FileStatus.PENDING, FileStatus.DELETED, FileStatus.INACTIVE_PARENT];
    if (!includeTrashed) {
      excludeStatuses.push(FileStatus.TRASHED);
    }

    baseConditions.push(not(inArray(files.status, excludeStatuses)));

    return (await this.db
      .select()
      .from(files)
      .where(and(...baseConditions))) as FileEntity[];
  }

  async createFile(userId: string, data: CreateFile): Promise<FileDto> {
    const parentId = isFolderIdRoot(data.parentId) ? null : data.parentId;

    const chunkSize = this.appConfigService.getConfig().file.chunkSize;
    const maxFileSize = this.appConfigService.getConfig().file.maxFileSize;
    const estimatedSize = data.chunkCount * chunkSize;

    // Check estimated size against max file size + one chunk buffer to allow for rounding errors
    if (estimatedSize > maxFileSize + chunkSize) {
      throw new ConflictException(`File size exceeds maximum limit of ${maxFileSize} bytes`);
    }

    // Check for duplicate name at same level
    const hasExisting = await this.hasFileWithNameHash(userId, parentId, data.nameHash);
    if (hasExisting) {
      throw new ConflictException('A file with this name already exists at this level');
    }

    // Guard: cap concurrent pending uploads per user so a single user cannot
    // exhaust quota reservations without ever completing uploads.
    const [{ count: pendingCount }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(and(eq(files.userId, userId), eq(files.status, FileStatus.PENDING)));
    if (Number(pendingCount) >= 10) {
      throw new ConflictException(
        'Too many pending uploads. Complete or cancel existing uploads before starting new ones.'
      );
    }

    this.logger.log(`📄 Creating file for user: ${userId}`);

    try {
      return await this.db.transaction(async tx => {
        // Reserve estimated quota upfront so chunks written to disk always count against
        // the user's limit — even if the upload is abandoned. The reservation equals
        // chunkCount * chunkSize (worst case). cleanupFile() already decrements by
        // file.approxSize, so storing estimatedSize here means abandoned pending files
        // correctly release their reservation when the cleanup job runs.
        const reserved = await this.quotaService.incrementUsedStorage(userId, estimatedSize, tx);
        if (reserved === null) {
          throw new ConflictException('Insufficient storage quota to start this upload');
        }

        const newFile: NewFile = {
          userId,
          parentId,
          metadataEncrypted: data.metadataEncrypted,
          nameHash: data.nameHash,
          fkWrapped: data.fkWrapped,
          chunkCount: data.chunkCount,
          status: FileStatus.PENDING,
          approxSize: estimatedSize, // reserved quota; reconciled to actual size at completion
        };
        const [createdFile] = await tx.insert(files).values(newFile).returning();

        return FileSchema.parse(createdFile);
      });
    } catch (error) {
      this.logger.error(`Failed to create file for user ${userId}:`, error);
      throw error;
    }
  }

  async markFileAsComplete(
    userId: string,
    fileId: string,
    clientChecksum: string
  ): Promise<FileDto> {
    const file = await this.getFileEntity(userId, fileId);

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.status !== FileStatus.PENDING) {
      throw new ConflictException(`File is status ${file.status} cannot be completed`);
    }

    const chunks = await this.fileChunkService.getFileChunks(fileId);
    const approxSize = chunks.reduce((acc, chunk) => acc + chunk.approxSize, 0);

    if (chunks.length !== file.chunkCount) {
      throw new ConflictException(
        `Not all chunks have been uploaded, got ${chunks.length}/${file.chunkCount}`
      );
    }

    if (approxSize > this.appConfigService.getConfig().file.maxFileSize) {
      throw new ConflictException(
        `File size exceeds maximum limit of ${this.appConfigService.getConfig().file.maxFileSize} bytes`
      );
    }

    // Compute file-level checksum from chunk checksums
    const hasher = new Blake3Hasher();
    for (const chunk of chunks) {
      hasher.update(chunk.checksum);
    }
    const computedChecksum = hasher.digest('hex');

    // Verify client checksum (required)
    if (clientChecksum !== computedChecksum) {
      this.logger.error(
        `File integrity check failed for ${fileId}: client=${clientChecksum}, server=${computedChecksum}`
      );
      throw new ConflictException('File integrity check failed - checksum mismatch');
    }

    const updatedFileEntity = await this.db.transaction(async tx => {
      // Quota was already reserved at createFile as estimatedSize (chunkCount * chunkSize).
      // Reconcile to the actual size: increment if larger than estimated, decrement if smaller.
      const reservedSize = file.approxSize;
      const delta = approxSize - reservedSize;

      if (delta > 0) {
        // Actual is larger than estimated — request remaining quota
        const updated = await this.quotaService.incrementUsedStorage(userId, delta, tx);
        if (updated === null) {
          throw new ConflictException('User storage quota exceeded');
        }
      } else if (delta < 0) {
        // Actual is smaller than estimated — release the over-reservation
        await this.quotaService.decrementUsedStorage(userId, Math.abs(delta), tx);
      }

      const updatedFile = await this.updateFileProps(
        fileId,
        { status: FileStatus.ACTIVE, approxSize, checksum: computedChecksum },
        tx
      );

      if (!updatedFile) {
        throw new Error('Failed to update file status');
      }

      return updatedFile;
    });

    return FileSchema.parse(updatedFileEntity);
  }

  /**
   * Get file by ID
   */
  async getFile(userId: string, fileId: string): Promise<FileDto> {
    const file = await this.getFileEntity(userId, fileId);
    return FileSchema.parse(file);
  }

  async existsFile(userId: string, fileId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.userId, userId)))
      .limit(1);

    return result.length > 0;
  }

  async getFileEntity(
    userId: string,
    fileId: string,
    filters: {
      status?: FileStatus;
      statuses?: FileStatus[];
    } = {}
  ): Promise<FileEntity> {
    const conditions = [eq(files.id, fileId), eq(files.userId, userId)];

    if (filters.statuses && filters.statuses.length > 0) {
      conditions.push(inArray(files.status, filters.statuses));
    } else if (filters.status) {
      conditions.push(eq(files.status, filters.status));
    }

    const [file] = await this.db
      .select()
      .from(files)
      .where(and(...conditions))
      .limit(1);

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return file;
  }

  private async updateFileProps(
    fileId: string,
    props: Partial<FileEntity>,
    tx?: DrizzleTransaction
  ): Promise<FileEntity | null> {
    const [updatedFile] = await (tx ?? this.db)
      .update(files)
      .set(props)
      .where(eq(files.id, fileId))
      .returning();

    return updatedFile ?? null;
  }

  /**
   * Check if file exists with given name at same level
   */
  async hasFileWithNameHash(
    userId: string,
    parentFolderId: string | null,
    nameHash: string
  ): Promise<string | null> {
    const result = await this.db
      .select({ id: files.id })
      .from(files)
      .where(
        and(
          eq(files.userId, userId),
          isValidFolderAndNotRoot(parentFolderId)
            ? eq(files.parentId, parentFolderId)
            : isNull(files.parentId),
          eq(files.nameHash, nameHash),
          not(inArray(files.status, ['pending', 'deleted', 'trashed']))
        )
      )
      .limit(1);

    return result.length > 0 ? result[0].id : null;
  }

  /**
   * Batch check if files exist with given nameHashes
   * Reusable for conflict detection during restore
   */
  async batchCheckNameExists(
    userId: string,
    checks: Array<{ parentId: string | null; nameHash: string }>
  ): Promise<Array<{ nameHash: string; exists: boolean; existingId: string | null }>> {
    const results = await Promise.all(
      checks.map(async ({ parentId, nameHash }) => {
        const existingId = await this.hasFileWithNameHash(userId, parentId, nameHash);
        return {
          nameHash,
          exists: !!existingId,
          existingId,
        };
      })
    );

    return results;
  }

  async ensureFileDirectory(userId: string, fileId: string): Promise<string> {
    return this.storageService.ensureFileDirectory(userId, fileId);
  }

  async updateFile(userId: string, fileId: string, data: UpdateFile): Promise<File> {
    const file = await this.getFile(userId, fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    const updates: Partial<FileEntity> = {};

    if (data.parentId !== undefined) {
      //TODO validate wrapped key by decoding and checking structure
      if (!data.fkWrapped) {
        throw new ConflictException('Cannot move file without providing a wrapped file key');
      }

      // A null parentId means moving to the root, which has no folder record to validate.
      if (data.parentId) {
        const parentFolder = await this.foldersService.getFolder(userId, data.parentId);
        if (!parentFolder || parentFolder.status !== 'active') {
          throw new NotFoundException('Target folder not found');
        }
      }

      updates.parentId = data.parentId;
      updates.fkWrapped = data.fkWrapped;
    }

    // Check for duplicate name at the file's resulting location (its new parent if moving,
    // otherwise its current parent). Use `!== undefined` here, not `||` — a null parentId
    // is an explicit, valid "move to root" and must not fall back to the current parent.
    const targetParentId = data.parentId !== undefined ? data.parentId : file.parentId;
    const hasExisting = await this.hasFileWithNameHash(
      userId,
      targetParentId,
      data.nameHash || file.nameHash
    );
    if (hasExisting) {
      throw new ConflictException('A file with this name already exists at this level');
    }

    if (data.nameHash) {
      updates.nameHash = data.nameHash;

      if (!data.metadataEncrypted) {
        throw new ConflictException('Cannot update file name without providing encrypted metadata');
      }
    }

    if (data.metadataEncrypted) {
      updates.metadataEncrypted = data.metadataEncrypted;
    }

    const [updatedFile] = await this.db
      .update(files)
      .set(updates)
      .where(eq(files.id, fileId))
      .returning();

    if (!updatedFile) {
      throw new Error('Failed to update file');
    }

    this.logger.log(`File ${fileId} updated by user ${userId}`);

    return FileSchema.parse(updatedFile);
  }

  async trashFiles(userId: string, fileIds: string[]): Promise<string[] | null> {
    if (fileIds.length === 0) {
      return null;
    }

    const updatedIds = await this.db
      .update(files)
      .set({ status: 'trashed' })
      .where(
        and(
          eq(files.userId, userId),
          inArray(files.id, fileIds),
          not(inArray(files.status, ['trashed', 'deleted']))
        )
      )
      .returning({ id: files.id });

    // Delete public shares for trashed files
    const trashedFileIds = updatedIds.map(file => file.id);
    if (trashedFileIds.length > 0) {
      this.publicShareService.deleteSharesForItems(trashedFileIds).catch(err => {
        this.logger.error(`Failed to delete public shares for trashed files`, err);
      });
    }

    const updatedIdsSet = new Set(updatedIds.map(file => file.id));
    return fileIds
      .filter(id => !updatedIdsSet.has(id))
      .map(id => {
        this.logger.warn(`File ${id} could not be trashed by user ${userId}`);
        return id;
      });
  }

  async trashFile(userId: string, fileId: string) {
    const file = await this.getFileEntity(userId, fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.status === FileStatus.TRASHED) {
      return;
    }

    if (file.status === FileStatus.DELETED) {
      throw new ConflictException(`File is already deleted and cannot be trashed`);
    }

    const [updatedFile] = await this.db
      .update(files)
      .set({ status: 'trashed' })
      .where(eq(files.id, fileId))
      .returning();

    if (!updatedFile) {
      throw new Error('Failed to update file status to trashed');
    }

    this.publicShareService.deleteSharesForItems([fileId]).catch(err => {
      this.logger.error(`Failed to delete public shares for trashed file ${fileId}`, err);
    });

    this.logger.log(`File ${fileId} marked as trashed by user ${userId}`);
  }

  async restoreFile(userId: string, fileId: string, renameItem?: RestoreItem): Promise<FileEntity> {
    const file = await this.getFileEntity(userId, fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.status !== 'trashed') {
      throw new ConflictException(`File is status ${file.status} cannot be restored`);
    }

    const finalParentId = renameItem?.fkWrapped ? renameItem?.parentId || 'root' : file.parentId;

    // Check if parent folder exists and is active
    if (finalParentId && !isFolderIdRoot(finalParentId)) {
      this.logger.warn(`checking parent folder ${finalParentId} for file ${fileId}`);
      const parentFolder = await this.foldersService.getFolder(userId, file.parentId);
      if (!parentFolder) {
        throw new ConflictException('Cannot restore file: parent folder was permanently deleted');
      }
      if (parentFolder.status === 'trashed') {
        throw new ConflictException('Cannot restore file: parent folder is in trash');
      }
      if (parentFolder.status !== 'active') {
        throw new ConflictException(`Cannot restore file: parent folder is ${parentFolder.status}`);
      }
    }

    const nameHash = renameItem?.nameHash || file.nameHash;
    if (nameHash) {
      const existingWithNewName = await this.hasFileWithNameHash(userId, file.parentId, nameHash);
      if (existingWithNewName) {
        throw new ConflictException('A file with the name already exists');
      }
    }

    const updates: Partial<FileEntity> = { status: FileStatus.ACTIVE };

    if (renameItem?.nameHash) {
      updates.nameHash = renameItem.nameHash;

      if (!renameItem?.metadataEncrypted) {
        throw new ConflictException('Cannot update file name without providing encrypted metadata');
      }
      updates.metadataEncrypted = renameItem.metadataEncrypted;
    }

    if (renameItem?.fkWrapped) {
      updates.fkWrapped = renameItem.fkWrapped;
      updates.parentId = renameItem.parentId || null;
    }

    const [updatedFile] = await this.db
      .update(files)
      .set(updates)
      .where(eq(files.id, fileId))
      .returning();

    if (!updatedFile) {
      throw new Error('Failed to restore file');
    }

    this.logger.log(
      `File ${fileId} restored by user ${userId}${renameItem?.nameHash ? ' with rename' : ''}`
    );
    return updatedFile;
  }

  async deleteFile(userId: string, fileId: string, force: boolean = false): Promise<void> {
    const file = await this.getFileEntity(userId, fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.status !== 'trashed') {
      throw new ConflictException(`File is status ${file.status} cannot be deleted`);
    }

    await this.cleanupFile(userId, file);
  }

  async cleanupFile(userId: string, file: FileEntity): Promise<boolean> {
    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (!['deleted', 'pending'].includes(file.status)) {
      throw new ConflictException(`File is status ${file.status} cannot be cleaned up`);
    }

    return this.db.transaction(async tx => {
      await this.fileChunkService.deleteFileChunks(file.userId, file.id);

      await this.quotaService.decrementUsedStorage(file.userId, file.approxSize, tx);

      // delete file record
      const result = await (tx ?? this.db)
        .delete(files)
        .where(and(eq(files.id, file.id), eq(files.userId, file.userId)))
        .returning();

      if (result.length === 0) {
        return false;
      }

      this.logger.log(`File ${file.id} cleaned up by user ${userId}`);
      return true;
    });
  }

  async fileUploadStatus(userId: string, fileId: string): Promise<FileUploadStatusDto> {
    const file = await this.getFileEntity(userId, fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    const chunkIndexes = await this.fileChunkService.getFileChunkIndexes(fileId);

    return {
      status: file.status,
      uploadedChunks: chunkIndexes,
    };
  }

  async markAllTrashedFilesAsDeleted(userId: string): Promise<
    {
      id: string;
      parentId?: string;
    }[]
  > {
    this.logger.log(`Marking all trashed files as deleted for user ${userId}`);

    const result = await this.db
      .update(files)
      .set({ status: 'deleted' })
      .where(and(eq(files.userId, userId), eq(files.status, 'trashed')))
      .returning({ id: files.id, parentId: files.parentId });

    if (result.length === 0) {
      return [];
    }

    return result;
  }

  async cleanupDeletedAndTrashedFiles() {
    this.logger.log('Cleaning up deleted and trashed files');

    const filesToCleanup = await this.db
      .select()
      .from(files)
      .where(
        and(
          eq(files.status, 'deleted'),
          // trashed should have updatedAt older than 30 days
          or(eq(files.status, 'trashed'))
        )
      );

    if (filesToCleanup.length === 0) {
      this.logger.log('No files to clean up');
      return;
    }

    for (const file of filesToCleanup) {
      try {
        await this.cleanupFile(file.userId, file);
      } catch (error) {
        this.logger.error(`Failed to clean up file ${file.id}:`, error);
      }
    }

    this.logger.log('Cleanup completed');
  }

  async cleanupDeletedFiles(batchSize: number = 1000): Promise<number> {
    this.logger.log('Cleaning up deleted files');

    const filesToCleanup = await this.db
      .select()
      .from(files)
      .where(eq(files.status, 'deleted'))
      .limit(batchSize);

    if (filesToCleanup.length === 0) {
      this.logger.log('No files to clean up');
      return 0;
    }

    for (const file of filesToCleanup) {
      try {
        await this.cleanupFile(file.userId, file);
      } catch (error) {
        this.logger.error(`Failed to clean up file ${file.id}:`, error);
      }
    }

    this.logger.log('Cleanup completed');
    return filesToCleanup.length;
  }

  async cleanupFilesInStatus(
    status: string,
    batchSize: number = 1000,
    olderThanSecs?: number
  ): Promise<number> {
    this.logger.log(`Cleaning up files in ${status} status`);

    const conditions = [eq(files.status, status)];

    if (olderThanSecs && olderThanSecs > 0) {
      conditions.push(sql`${files.updatedAt} < now() - make_interval(secs => ${olderThanSecs})`);
    }

    const filesToCleanup = await this.db
      .select()
      .from(files)
      .where(and(...conditions))
      .limit(batchSize);

    if (filesToCleanup.length === 0) {
      this.logger.log('No files to clean up');
      return 0;
    }

    for (const file of filesToCleanup) {
      try {
        await this.cleanupFile(file.userId, file);
      } catch (error) {
        this.logger.error(`Failed to clean up file ${file.id}:`, error);
      }
    }

    this.logger.log('Cleanup completed');
    return filesToCleanup.length;
  }

  async markFilesAsDeleted(fileIds: string[]) {
    return this.markFilesAsStatus(fileIds, FileStatus.DELETED, undefined, [FileStatus.DELETED]);
  }

  async markFilesAsInactiveParent(fileIds: string[]) {
    return this.markFilesAsStatus(fileIds, FileStatus.INACTIVE_PARENT, [FileStatus.ACTIVE]);
  }

  async markFilesAsActive(fileIds: string[]) {
    return this.markFilesAsStatus(fileIds, FileStatus.ACTIVE, [
      FileStatus.INACTIVE_PARENT,
      FileStatus.TRASHED,
    ]);
  }

  async markFilesAsStatus(
    fileIds: string[],
    status: FileStatus,
    inStatuses?: FileStatus[],
    notInStatuses?: FileStatus[]
  ) {
    if (fileIds.length === 0) {
      return;
    }

    this.logger.log(`Marking ${fileIds.length} files as ${status}`);

    const conditions = [inArray(files.id, fileIds)];

    if (inStatuses && inStatuses.length > 0) {
      conditions.push(inArray(files.status, inStatuses));
    }

    if (notInStatuses && notInStatuses.length > 0) {
      conditions.push(not(inArray(files.status, notInStatuses)));
    }

    await this.db
      .update(files)
      .set({ status })
      .where(and(...conditions));
  }

  async getFilesInFolder(folderId: string, status?: string) {
    const conditions = [eq(files.parentId, folderId)];
    if (status) {
      conditions.push(eq(files.status, status));
    }

    const result = await this.db
      .select({ id: files.id })
      .from(files)
      .where(and(...conditions));

    return result.map(file => file.id);
  }

  checkFileNameHashExists(
    userId: string,
    parentId: string,
    nameHash: string
  ): Promise<string | null> {
    return this.hasFileWithNameHash(userId, parentId, nameHash);
  }

  async computeFolderSize(folderId: string): Promise<number> {
    const result = await this.db
      .select({ totalSize: sql`COALESCE(SUM(${files.approxSize}), 0)` })
      .from(files)
      .where(eq(files.parentId, folderId));

    return (result[0]?.totalSize as number) || 0;
  }
}
