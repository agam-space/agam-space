import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { aliasedTable, and, eq, inArray, isNull, not, notExists, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';

import { DATABASE_CONNECTION } from '../../database/database.providers';
import { FolderEntity, folders, NewFolderEntity } from '../../database/schema';

import { CreateFolderDto, FolderDto, UpdateFolderDto } from './dto/folder-content.dto';
import {
  FileStatus,
  Folder,
  FolderSchema,
  FolderStatus,
  RestoreItem,
} from '@agam-space/shared-types';
import { FilesService } from '@/modules/files/files.service';
import { PublicShareService } from '@/modules/public-share/public-share.service';

@Injectable()
export class FoldersService {
  private readonly logger = new Logger(FoldersService.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: ReturnType<typeof drizzle>,
    @Inject(forwardRef(() => FilesService))
    private readonly filesService: FilesService,
    @Inject(forwardRef(() => PublicShareService))
    private readonly publicShareService: PublicShareService
  ) {}

  async getFoldersUnderParent(
    userId: string,
    parentId?: string,
    includeTrashed: boolean = false
  ): Promise<FolderEntity[]> {
    const baseConditions = [
      eq(folders.userId, userId),
      parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId),
    ];

    const excludeStatuses = [FolderStatus.DELETED, FolderStatus.INACTIVE_PARENT];
    if (!includeTrashed) {
      excludeStatuses.push(FolderStatus.TRASHED);
    }

    baseConditions.push(not(inArray(folders.status, excludeStatuses)));

    const result: FolderEntity[] = (await this.db
      .select()
      .from(folders)
      .where(and(...baseConditions))) as FolderEntity[];

    return result;
  }

  async getFolder(
    userId: string,
    folderId: string,
    filters: {
      status?: FolderStatus;
    } = {}
  ): Promise<FolderDto> {
    const conditions = [eq(folders.id, folderId), eq(folders.userId, userId)];

    if (filters.status) {
      conditions.push(eq(folders.status, filters.status));
    }

    const [folder] = await this.db
      .select()
      .from(folders)
      .where(and(...conditions))
      .limit(1);

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    return FolderSchema.parse(folder);
  }

  async existsFolder(userId: string, folderId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .limit(1);

    return result.length > 0;
  }

  async createFolder(userId: string, data: CreateFolderDto, tx?: any): Promise<FolderDto> {
    const dbInstance = tx || this.db;

    data.parentId = isFolderIdRoot(data.parentId) ? null : data.parentId;

    // Check for duplicate name at same level
    const hasExisting = await this.hasFolderWithName(userId, data.nameHash, data.parentId);

    if (hasExisting) {
      throw new ConflictException('A folder with this name already exists at this level');
    }

    this.logger.log(`📁 Creating folder for user: ${userId}`);

    const newFolder: NewFolderEntity = {
      ...data,
      userId,
    };

    try {
      const [createdFolder] = await dbInstance.insert(folders).values(newFolder).returning();
      return FolderSchema.parse(createdFolder);
    } catch (error) {
      this.logger.error(`Failed to create folder for user ${userId}:`, error);
      throw error;
    }
  }

  async hasFolderWithName(
    userId: string,
    nameHash: string,
    parentId?: string,
    checkAll: boolean = false
  ): Promise<boolean> {
    const conditions = [
      eq(folders.userId, userId),
      parentId && !isFolderIdRoot(parentId)
        ? eq(folders.parentId, parentId)
        : isNull(folders.parentId),
      eq(folders.nameHash, nameHash),
    ];

    if (!checkAll) {
      conditions.push(not(inArray(folders.status, ['deleted', 'trashed'])));
    }

    const result = await this.db
      .select({ id: folders.id })
      .from(folders)
      .where(and(...conditions))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Batch check if folders exist with given nameHashes
   */
  async batchCheckNameExists(
    userId: string,
    checks: Array<{ parentId: string | null; nameHash: string }>
  ): Promise<Array<{ nameHash: string; exists: boolean }>> {
    const results = await Promise.all(
      checks.map(async ({ parentId, nameHash }) => {
        const exists = await this.hasFolderWithName(userId, nameHash, parentId ?? undefined, true);
        return {
          nameHash,
          exists,
        };
      })
    );

    return results;
  }

  async patchFolder(
    userId: string,
    folderId: string,
    updates: Partial<UpdateFolderDto>
  ): Promise<FolderDto> {
    this.logger.log(`📁 Patching folder ${folderId} for user ${userId}`, updates);

    const existingFolder = await this.getFolder(userId, folderId);
    if (!existingFolder || existingFolder.status !== 'active') {
      throw new NotFoundException('Folder not found');
    }

    const allowedUpdates: Partial<FolderEntity> = {};

    if (updates.parentId !== undefined) {
      if (!updates.fkWrapped) {
        throw new BadRequestException('fkWrapped is required when updating parentId');
      }

      // A null parentId means moving to the root, which has no folder record to validate.
      if (updates.parentId) {
        const parentFolder = await this.getFolder(userId, updates.parentId);
        if (!parentFolder) {
          throw new NotFoundException('Target parent folder not found');
        }
      }

      allowedUpdates.parentId = updates.parentId;
      allowedUpdates.fkWrapped = updates.fkWrapped;
    }

    // Check for duplicate name at the folder's resulting location (its new parent if moving,
    // otherwise its current parent). Use `!== undefined` here, not `||` — a null parentId
    // is an explicit, valid "move to root" and must not fall back to the current parent.
    const targetParentId =
      updates.parentId !== undefined ? updates.parentId : existingFolder.parentId;
    const folderWithName = await this.hasFolderWithName(
      userId,
      updates.nameHash || existingFolder.nameHash,
      targetParentId
    );
    if (folderWithName) {
      throw new ConflictException('A folder with this name already exists at this level');
    }

    if (updates.nameHash) {
      allowedUpdates.nameHash = updates.nameHash;
      if (!updates.metadataEncrypted) {
        throw new BadRequestException('metadataEncrypted is required when updating nameHash');
      }
    }

    if (updates.metadataEncrypted) {
      allowedUpdates.metadataEncrypted = updates.metadataEncrypted;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      throw new BadRequestException('No valid fields to update');
    }

    this.logger.log(
      `Updating folder ${folderId} for user ${userId} with data: ${JSON.stringify(allowedUpdates)}`
    );

    const [updatedFolder] = await this.db
      .update(folders)
      .set(allowedUpdates)
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .returning();

    if (!updatedFolder) {
      throw new Error('Error updating folder');
    }

    this.logger.log(`Folder ${folderId} updated successfully By user ${userId}`);
    return FolderSchema.parse(updatedFolder);
  }

  async trashFolders(userId: string, folderIds: string[]): Promise<string[] | null> {
    if (!Array.isArray(folderIds)) {
      throw new BadRequestException('Invalid folder IDs array');
    }

    if (folderIds.length === 0) {
      return null;
    }

    const updatedIds = await this.db
      .update(folders)
      .set({ status: FolderStatus.TRASHED })
      .where(
        and(
          eq(folders.userId, userId),
          inArray(folders.id, folderIds),
          not(inArray(folders.status, [FolderStatus.TRASHED, FolderStatus.DELETED]))
        )
      )
      .returning({ id: folders.id });

    // IMMEDIATELY mark all descendants as inactive_parent in background
    const trashedFolderIds = updatedIds.map(item => item.id);
    if (trashedFolderIds.length > 0) {
      this.asyncMarkAllFolderDescendantsAsInactiveParent(folderIds);

      this.publicShareService.deleteSharesForItems(trashedFolderIds).catch(err => {
        this.logger.error(`Failed to delete public shares for trashed folders`, err);
      });
    }

    // compare the result with the input folderIds for failed IDs
    const updatedIdsSet = new Set(updatedIds.map(item => item.id));
    return folderIds
      .filter(id => !updatedIdsSet.has(id))
      .map(id => {
        this.logger.warn(`Folder ${id} could not be trashed by user ${userId}`);
        return id;
      });
  }

  private asyncMarkAllFolderDescendantsAsInactiveParent(folderIds: string[]): void {
    (async () => {
      for (const folderId of folderIds) {
        try {
          await this.markDescendantsAsInactiveParent(folderId);
        } catch (err) {
          this.logger.error(`Failed to mark descendants of ${folderId} as inactive_parent`, err);
        }
      }
    })();
  }

  private async markDescendantsAsInactiveParent(folderId: string): Promise<void> {
    const { folderIds, fileIds } = await this.collectDescendantFoldersAndFiles(folderId);

    await Promise.all([
      this.filesService.markFilesAsInactiveParent(fileIds),
      this.markFoldersAsStatus(folderIds, FolderStatus.INACTIVE_PARENT, [FolderStatus.ACTIVE]),
      this.publicShareService.deleteSharesForItems([...folderIds, ...fileIds]).catch(err => {}),
    ]);
  }

  async deleteFolder(userId: string, folderId: string, force: boolean = false): Promise<void> {
    this.logger.log(`${force ? 'deleted' : 'trashed'} folder ${folderId} by user ${userId}`);

    const result = await this.db
      .update(folders)
      .set({ status: force ? 'deleted' : 'trashed' })
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .returning();

    if (result.length === 0) {
      throw new NotFoundException('Folder not found or already deleted');
    }

    if (!force) {
      // IMMEDIATELY mark all descendants as inactive_parent in background
      this.asyncMarkAllFolderDescendantsAsInactiveParent([folderId]);

      this.publicShareService.deleteSharesForItems([folderId]).catch(err => {
        this.logger.error(`Failed to delete public shares for trashed folder ${folderId}`, err);
      });
    }

    this.logger.log(
      `Folder ${folderId} ${force ? 'deleted' : 'trashed'} successfully for user ${userId}`
    );
  }

  async restoreFolder(userId: string, folderId: string, restoreItem?: RestoreItem) {
    this.logger.log(`📁 Restoring folder ${folderId} for user ${userId}`);

    const folder = await this.getFolder(userId, folderId);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    if (folder.status !== 'trashed') {
      throw new BadRequestException('Folder is not in trash');
    }

    // Check if parent folder exists and is active
    if (folder.parentId) {
      const parentFolder = await this.getFolder(userId, folder.parentId);
      if (!parentFolder) {
        throw new ConflictException('Cannot restore folder: parent folder was permanently deleted');
      }
      if (parentFolder.status === 'trashed') {
        throw new ConflictException('Cannot restore folder: parent folder is in trash');
      }
      if (parentFolder.status !== 'active') {
        throw new ConflictException(
          `Cannot restore folder: parent folder is ${parentFolder.status}`
        );
      }
    }

    const nameHash = restoreItem?.nameHash || folder.nameHash;
    if (nameHash) {
      const existsWithNewName = await this.hasFolderWithName(
        userId,
        nameHash,
        folder.parentId ?? undefined
      );
      if (existsWithNewName) {
        throw new ConflictException('A folder with the new name already exists');
      }
    }

    const updates: Partial<FolderEntity> = { status: 'active' };
    if (restoreItem?.nameHash) {
      updates.nameHash = restoreItem.nameHash;

      if (!restoreItem?.metadataEncrypted) {
        throw new ConflictException('metadataEncrypted is required when restoring with a new name');
      }

      updates.metadataEncrypted = restoreItem.metadataEncrypted;
    }

    if (restoreItem?.fkWrapped) {
      updates.fkWrapped = restoreItem.fkWrapped;
      updates.parentId = restoreItem.parentId || null;
    }

    const result = await this.db
      .update(folders)
      .set(updates)
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .returning();

    if (result.length === 0) {
      throw new NotFoundException('Error restoring folder');
    }

    //Restore all inactive_parent descendants back to active in background
    this.restoreInactiveParentDescendants(folderId);

    this.logger.log(
      `Folder ${folderId} restored${restoreItem?.nameHash ? ' with rename' : ''} for user ${userId}`
    );
  }

  private restoreInactiveParentDescendants(folderId: string) {
    (async () => {
      const { folderIds, fileIds } = await this.collectDescendantFoldersAndFiles(
        folderId,
        FolderStatus.INACTIVE_PARENT.toString()
      );

      await Promise.all([
        this.markFoldersAsStatus(folderIds, FolderStatus.ACTIVE, [FolderStatus.INACTIVE_PARENT]),
        this.filesService.markFilesAsStatus(fileIds, FileStatus.ACTIVE, [
          FileStatus.INACTIVE_PARENT,
        ]),
      ]);
    })();
  }

  async markAllTrashedFoldersAsDeleted(userId: string): Promise<
    {
      id: string;
      parentId?: string;
    }[]
  > {
    this.logger.log(`Marking all trashed folders as deleted for user ${userId}`);

    const result = await this.db
      .update(folders)
      .set({ status: 'deleted' })
      .where(and(eq(folders.userId, userId), eq(folders.status, 'trashed')))
      .returning({
        id: folders.id,
        parentId: folders.parentId,
      });

    if (result.length === 0) {
      this.logger.debug(`No trashed folders found for user ${userId}`);
    } else {
      this.logger.log(`Marked ${result.length} trashed folders as deleted for user ${userId}`);
    }

    return result;
  }

  async getFolderRootsIdsWithStatus(status: 'active' | 'trashed' | 'deleted'): Promise<string[]> {
    const parent = aliasedTable(folders, 'parent');

    const deletedRoots = await this.db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.status, status),
          or(
            isNull(folders.parentId),
            notExists(
              this.db
                .select()
                .from(parent)
                .where(and(eq(parent.id, folders.parentId), eq(parent.status, status)))
            )
          )
        )
      );

    return deletedRoots.map(folder => folder.id);
  }

  async getFolderChildrenIds(folderId: string, status?: string): Promise<string[]> {
    const conditions = [eq(folders.parentId, folderId)];
    if (status) {
      conditions.push(eq(folders.status, status));
    }

    const children = await this.db
      .select({ id: folders.id })
      .from(folders)
      .where(and(...conditions));

    return children.map(child => child.id);
  }

  async hardDeleteFolders(folderIds: string[]) {
    if (!folderIds || folderIds.length == 0) {
      return;
    }

    this.logger.log(`Hard deleting folders: ${folderIds.join(', ')}`);

    await this.db.delete(folders).where(inArray(folders.id, folderIds));
  }

  async getFolderAncestors(
    userId: string,
    folderId: string,
    depthCount: number
  ): Promise<Folder[]> {
    const result = await this.db.execute<FolderEntity>(sql`
      WITH RECURSIVE folder_path AS (
        SELECT *, 1 AS depth
        FROM folders
        WHERE id = ${folderId} AND ${folders.userId} = ${userId}
    
        UNION ALL
    
        SELECT f.*, fp.depth + 1
        FROM folders f
        JOIN folder_path fp ON f.id = fp.parent_id
      )
      SELECT *
      FROM folder_path
      ORDER BY depth ASC
      LIMIT ${depthCount ?? 10};
    `);

    return result.map(folder => {
      return FolderSchema.parse({
        id: folder[folders.id.name],
        nameHash: folder[folders.nameHash.name],
        parentId: folder[folders.parentId.name],
        metadataEncrypted: folder[folders.metadataEncrypted.name],
        fkWrapped: folder[folders.fkWrapped.name],
        userId: folder[folders.userId.name],
        status: folder[folders.status.name],
        createdAt: new Date(folder[folders.createdAt.name] as string | Date).toISOString(),
        updatedAt: new Date(folder[folders.updatedAt.name] as string | Date).toISOString(),
      });
    });
  }

  async computeFolderSize(userId: string, folderId: string) {
    await this.getFolder(userId, folderId);
    const size = await this.filesService.computeFolderSize(folderId);

    //saving
    await this.db
      .update(folders)
      .set({ size: size })
      .where(and(eq(folders.id, folderId)));

    return size;
  }

  async markFoldersAsStatus(
    folderIds: string[],
    status: FolderStatus,
    inStatuses?: FolderStatus[]
  ): Promise<void> {
    if (folderIds.length === 0) {
      return;
    }

    this.logger.log(`Marking ${folderIds.length} folders as ${status}`);

    const conditions = [inArray(folders.id, folderIds)];

    if (inStatuses && inStatuses.length > 0) {
      conditions.push(inArray(folders.status, inStatuses));
    }

    await this.db
      .update(folders)
      .set({ status: FolderStatus.INACTIVE_PARENT })
      .where(and(...conditions));
  }

  async collectDescendantFoldersAndFiles(
    rootId: string,
    status?: string
  ): Promise<{
    folderIds: string[];
    fileIds: string[];
  }> {
    const folderQueue = [rootId];
    const folderIds: string[] = [];
    const fileIds: string[] = [];

    while (folderQueue.length > 0) {
      const folderId = folderQueue.shift()!;

      if (folderId !== rootId) {
        folderIds.push(folderId);
      }

      const [folderIdsInFolder, fileIdsInFolder] = await Promise.all([
        this.getFolderChildrenIds(folderId, status),
        this.filesService.getFilesInFolder(folderId, status),
      ]);

      folderQueue.push(...folderIdsInFolder);
      fileIds.push(...fileIdsInFolder);
    }

    return { folderIds, fileIds };
  }

  /**
   * Check if childFolderId is a descendant of ancestorFolderId
   * Walks up the parent chain from child to see if it reaches ancestor
   */
  async isDescendantOf(
    userId: string,
    childFolderId: string,
    ancestorFolderId: string,
    maxDepth: number = 100
  ): Promise<boolean> {
    if (childFolderId === ancestorFolderId) {
      return true;
    }

    let currentId: string | null = childFolderId;
    let depth = 0;

    while (currentId && depth < maxDepth) {
      const [folder] = await this.db
        .select({ parentId: folders.parentId })
        .from(folders)
        .where(and(eq(folders.id, currentId), eq(folders.userId, userId)))
        .limit(1);

      if (!folder) {
        return false;
      }

      if (folder.parentId === ancestorFolderId) {
        return true;
      }

      if (!folder.parentId) {
        return false;
      }

      currentId = folder.parentId;
      depth++;
    }
    return false;
  }
}

export function isFolderIdRoot(folderId: string | null | undefined): boolean {
  return folderId && folderId.toLowerCase().trim() === 'root';
}
