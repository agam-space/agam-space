import { Inject, Injectable, Logger } from '@nestjs/common';
import { FoldersService } from '@/modules/folders/folders.service';
import { FilesService } from '@/modules/files/files.service';
import { DATABASE_CONNECTION, files, folders } from '@/database';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, sql } from 'drizzle-orm';
import {
  File,
  FileSchema,
  FileStatus,
  Folder,
  FolderSchema,
  FolderStatus,
  TrashedItems,
} from '@agam-space/shared-types';
import { AppConfigService } from '@/config/config.service';

@Injectable()
export class TrashService {
  private readonly logger: Logger = new Logger(TrashService.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: ReturnType<typeof drizzle>,
    private readonly foldersService: FoldersService,
    private readonly filesService: FilesService,
    private readonly configService: AppConfigService
  ) {}

  async emptyTrash(userId: string) {
    const [folders, files] = await Promise.all([
      this.foldersService.markAllTrashedFoldersAsDeleted(userId),
      this.filesService.markAllTrashedFilesAsDeleted(userId),
    ]);

    // trigger async cleanup of deleted contents
    this.cleanupDeletedContents().then();

    return folders.length + files.length;
  }

  async expireOldTrashedItems(): Promise<void> {
    const trashCleanupIntervalDays = this.configService.getConfig().file.trashCleanupIntervalDays;

    this.logger.log(`Expiring trashed items older than ${trashCleanupIntervalDays} days`);

    // Mark old trashed files as deleted
    const expiredFiles = await this.db
      .update(files)
      .set({ status: FileStatus.DELETED })
      .where(
        and(
          eq(files.status, FileStatus.TRASHED),
          sql`${files.updatedAt} < NOW() - make_interval(days => ${trashCleanupIntervalDays})`
        )
      )
      .returning({ id: files.id });

    // Mark old trashed folders as deleted
    const expiredFolders = await this.db
      .update(folders)
      .set({ status: FolderStatus.DELETED })
      .where(
        and(
          eq(folders.status, FolderStatus.TRASHED),
          sql`${folders.updatedAt} < NOW() - make_interval(days => ${trashCleanupIntervalDays})`
        )
      )
      .returning({ id: folders.id });

    const totalExpired = expiredFiles.length + expiredFolders.length;

    if (totalExpired > 0) {
      this.logger.log(
        `Expired ${expiredFiles.length} files and ${expiredFolders.length} folders (total: ${totalExpired})`
      );
    } else {
      this.logger.debug('No trashed items to expire');
    }
  }

  async cleanupDeletedContents() {
    await this.markAllFolderContentsAsDeleted();

    await this.cleanupDeletedFiles();
  }

  async markAllFolderContentsAsDeleted(): Promise<void> {
    const deletedFolderRoots = await this.foldersService.getFolderRootsIdsWithStatus('deleted');

    for (const folderId of deletedFolderRoots) {
      this.logger.log(`marking contents of folder ${folderId} as deleted`);

      const { folderIds, fileIds } = await this.collectDescendantFoldersAndFiles(folderId);

      // Mark all descendant files as deleted
      await this.filesService.markFilesAsDeleted(fileIds);

      // Mark all descendant folders as deleted
      await this.foldersService.hardDeleteFolders(folderIds);
    }
  }

  async collectDescendantFoldersAndFiles(rootId: string): Promise<{
    folderIds: string[];
    fileIds: string[];
  }> {
    const folderQueue = [rootId];
    const folderIds: string[] = [];
    const fileIds: string[] = [];

    while (folderQueue.length > 0) {
      const folderId = folderQueue.shift()!;
      folderIds.push(folderId);

      const childrenIds = await this.foldersService.getFolderChildrenIds(folderId);
      folderQueue.push(...childrenIds);

      const filesInFolder = await this.filesService.getFilesInFolder(folderId);
      fileIds.push(...filesInFolder);
    }

    return { folderIds, fileIds };
  }

  private async cleanupDeletedFiles() {
    let totalDeleted = 0;
    const batchSize = 1000;

    while (true) {
      const deletedCount = await this.filesService.cleanupDeletedFiles(batchSize);
      totalDeleted += deletedCount;

      if (deletedCount === 0) break;
    }

    if (totalDeleted > 0) {
      this.logger.log(`Deleted ${totalDeleted} files marked as status='deleted'`);
    }
  }

  async getTrashedItems(userId: string): Promise<TrashedItems> {
    const [folders, files] = await Promise.all([
      this.getTopLevelTrashedFolders(userId),
      this.getTopLevelTrashedFiles(userId),
    ]);

    return {
      folders,
      files,
    };
  }

  private async getTopLevelTrashedFolders(userId: string): Promise<Folder[]> {
    const items = await this.db
      .select()
      .from(folders)
      .where(and(eq(folders.status, FolderStatus.TRASHED), eq(folders.userId, userId)));

    return items.map(folder => FolderSchema.parse(folder));
  }

  private async getTopLevelTrashedFiles(userId: string): Promise<File[]> {
    const result = await this.db
      .select()
      .from(files)
      .where(and(eq(files.status, FileStatus.TRASHED), eq(files.userId, userId)));

    return result.map(file => FileSchema.parse(file));
  }
}
