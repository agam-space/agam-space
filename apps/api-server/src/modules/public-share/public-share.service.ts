import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '@/database/database.providers';
import { NewPublicShareEntity, PublicShareEntity, publicShares } from '@/database/schema';
import {
  CreatePublicShareDto,
  PublicShareDetailsDto,
  PublicShareKeysDto,
} from '@/modules/public-share/dto/public-share.dto';
import { FilesService } from '@/modules/files/files.service';
import { FoldersService } from '@/modules/folders/folders.service';
import {
  FileStatus,
  FolderStatus,
  PublicShareContentResponse,
  PublicShareDetails,
  PublicShareDetailsSchema,
  PublicSharedFileSchema,
  PublicSharedFolderSchema,
  PublicShareKeysSchema,
} from '@agam-space/shared-types';
import { PasswordService } from '@/modules/auth/services/password.service';
import { randomBytes, randomString } from '@agam-space/core';
import { FileChunkService } from '@/modules/files/file-chunk.service';

@Injectable()
export class PublicShareService {
  private readonly logger = new Logger(PublicShareService.name);
  private readonly TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: ReturnType<typeof drizzle>,
    @Inject(forwardRef(() => FoldersService))
    private readonly foldersService: FoldersService,
    @Inject(forwardRef(() => FilesService))
    private readonly filesService: FilesService,
    @Inject(forwardRef(() => FileChunkService))
    private readonly fileChunkService: FileChunkService,
    private readonly passwordService: PasswordService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  async createShare(data: CreatePublicShareDto, userId: string): Promise<PublicShareEntity> {
    if (data.itemType === 'folder') {
      const folder = await this.foldersService.getFolder(userId, data.itemId);
      if (!folder || folder.status !== FolderStatus.ACTIVE) {
        throw new NotFoundException('Folder not found');
      }
    } else if (data.itemType === 'file') {
      const file = await this.filesService.getFileEntity(userId, data.itemId);
      if (!file || file.status !== FileStatus.ACTIVE) {
        throw new NotFoundException('File not found');
      }
    } else {
      throw new BadRequestException('Invalid item type');
    }

    const passwordHash = data.password
      ? await this.passwordService.hashPassword(data.password)
      : null;

    const newShare: NewPublicShareEntity = {
      ownerId: userId,
      itemId: data.itemId,
      itemType: data.itemType,
      serverShareKey: data.serverShareKey,
      wrappedItemKey: data.wrappedItemKey,
      salt: data.salt,
      passwordHash: passwordHash,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    };

    const [share] = await this.db
      .insert(publicShares)
      .values({
        ...newShare,
        id: this.generateShareId(),
      })
      .returning();
    return share;
  }

  async getShareEntityById(id: string): Promise<PublicShareEntity | null> {
    const [share] = await this.db
      .select()
      .from(publicShares)
      .where(eq(publicShares.id, id))
      .limit(1);

    if (!share) return null;

    if (share.expiresAt && share.expiresAt < new Date()) {
      this.deleteSharesForItems([share.itemId]).catch(err => {
        this.logger.error(`Failed to delete expired share ${share.id}: ${err.message}`);
      });
      return null;
    }

    return share;
  }

  async getShareById(id: string): Promise<PublicShareDetails | null> {
    const share = await this.getShareEntityById(id);
    return share ? this.toDto(share) : null;
  }

  async listShares(ownerId: string): Promise<PublicShareDetails[]> {
    const shares = await this.db
      .select()
      .from(publicShares)
      .where(eq(publicShares.ownerId, ownerId))
      .orderBy(desc(publicShares.createdAt));

    return shares
      .filter(share => !share.expiresAt || share.expiresAt >= new Date())
      .map(share =>
        PublicShareDetailsSchema.parse({ ...share, requiredPassword: !!share.passwordHash })
      );
  }

  async revokeShare(id: string, ownerId: string): Promise<void> {
    await this.db
      .delete(publicShares)
      .where(and(eq(publicShares.id, id), eq(publicShares.ownerId, ownerId)));
  }

  async cleanupExpiredShares(): Promise<void> {
    await this.db.delete(publicShares).where(lt(publicShares.expiresAt, sql`NOW()`));
  }

  async deleteSharesForItems(itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;

    const deletedShares = await this.db
      .delete(publicShares)
      .where(inArray(publicShares.itemId, itemIds))
      .returning({ id: publicShares.id });

    if (deletedShares.length > 0) {
      this.logger.log(
        `Deleted ${deletedShares.length} public share(s) for ${itemIds.length} trashed item(s)`
      );
    }
  }

  async getShareKeyDetails(id: string, password?: string): Promise<PublicShareKeysDto> {
    const share = await this.getShareEntityById(id);
    if (!share) {
      throw new NotFoundException('Share not found');
    }

    if (share.passwordHash) {
      if (!password) {
        throw new ForbiddenException('Password is required');
      }

      const isValid = await this.passwordService.verifyPassword(password, share.passwordHash);
      if (!isValid) {
        throw new ForbiddenException('Invalid password');
      }
    }

    const { accessToken, expiresAt } = await this.generateAccessToken(id);

    return PublicShareKeysSchema.parse({
      serverShareKey: share.serverShareKey,
      wrappedItemKey: share.wrappedItemKey,
      salt: share.salt,
      accessToken,
      expiresAt,
    });
  }

  private async generateAccessToken(shareId: string): Promise<{
    accessToken: string;
    expiresAt: Date;
  }> {
    const token = randomString(32);

    const cacheKey = `share-token:${token}`;
    await this.cacheManager.set(cacheKey, shareId, this.TOKEN_TTL_MS);
    this.logger.debug(
      `Generated access token for share ${shareId}, expires in ${this.TOKEN_TTL_MS}ms`
    );

    return {
      accessToken: token,
      expiresAt: new Date(Date.now() + this.TOKEN_TTL_MS),
    };
  }

  async validateAccessToken(token: string): Promise<string> {
    const cacheKey = `share-token:${token}`;
    const shareId = await this.cacheManager.get<string>(cacheKey);
    if (!shareId) {
      throw new ForbiddenException('Invalid or expired access token');
    }

    return shareId;
  }

  /**
   * Validate that an item (file or folder) belongs to a share
   * For file shares: the itemId must match exactly
   * For folder shares:
   *   - If itemId is a folder: must be the root or a descendant of the root
   *   - If itemId is a file: its parent folder must be the root or a descendant of the root
   */
  private async validateItemBelongsToShare(
    share: PublicShareEntity,
    itemId: string
  ): Promise<void> {
    if (share.itemType === 'file') {
      if (itemId !== share.itemId) {
        throw new NotFoundException('Item not found in this share');
      }
    } else {
      // For folder shares, validate that the item is within the shared folder
      if (itemId === share.itemId) {
        return; // Item is the root, so it belongs
      }

      // Check if itemId is a folder that is a descendant of the shared folder
      const isDescendantFolder = await this.foldersService.isDescendantOf(
        share.ownerId,
        itemId,
        share.itemId
      );

      if (isDescendantFolder) {
        return; // Folder is a descendant, so it belongs
      }

      // ItemId might be a file, check if its parent folder is within the share
      try {
        const file = await this.filesService.getFileEntity(share.ownerId, itemId);
        if (!file.parentId) {
          throw new NotFoundException('Item not found in this share');
        }

        const isParentDescendant = await this.foldersService.isDescendantOf(
          share.ownerId,
          file.parentId,
          share.itemId
        );

        if (!isParentDescendant) {
          throw new NotFoundException('Item not found in this share');
        }
      } catch (err) {
        if (err instanceof NotFoundException) {
          throw err;
        }
        throw new NotFoundException('Item not found in this share');
      }
    }
  }

  async getShareContent(
    shareId: string,
    requestedFolderId?: string
  ): Promise<PublicShareContentResponse> {
    const share = await this.getShareEntityById(shareId);
    if (!share) {
      throw new NotFoundException('Share not found');
    }

    if (share.itemType === 'file') {
      if (requestedFolderId) {
        throw new BadRequestException('This share is for a file, not a folder');
      }

      const file = await this.filesService.getFileEntity(share.ownerId, share.itemId, {
        status: FileStatus.ACTIVE,
      });

      if (!file) {
        throw new NotFoundException('File not found');
      }

      return {
        itemType: 'file' as const,
        file: PublicSharedFileSchema.parse(file),
      };
    }

    const targetFolderId = requestedFolderId || share.itemId;

    const folder = await this.foldersService.getFolder(share.ownerId, targetFolderId, {
      status: FolderStatus.ACTIVE,
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    // Validate folder belongs to share
    await this.validateItemBelongsToShare(share, targetFolderId);

    const [subFolders, subFiles] = await Promise.all([
      this.foldersService.getFoldersUnderParent(share.ownerId, targetFolderId),
      this.filesService.getFilesUnderParent(share.ownerId, targetFolderId),
    ]);

    const folders = subFolders
      .filter(f => f.status === FolderStatus.ACTIVE)
      .map(f => PublicSharedFolderSchema.parse(f));

    const files = subFiles
      .filter(f => f.status === FileStatus.ACTIVE)
      .map(f => PublicSharedFileSchema.parse(f));

    return {
      itemType: 'folder' as const,
      folder: PublicSharedFolderSchema.parse(folder),
      contents: {
        folders,
        files,
      },
    };
  }

  async getFileChunk(shareId: string, fileId: string, chunkIndex: number) {
    const share = await this.getShareEntityById(shareId);
    if (!share) {
      throw new NotFoundException('Share not found');
    }

    const file = await this.filesService.getFileEntity(share.ownerId, fileId, {
      status: FileStatus.ACTIVE,
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Validate file belongs to share
    await this.validateItemBelongsToShare(share, fileId);

    return await this.fileChunkService.readChunkStream(share.ownerId, fileId, chunkIndex);
  }

  async toDto(userKeys: PublicShareEntity): Promise<PublicShareDetailsDto> {
    return PublicShareDetailsSchema.parse({
      ...userKeys,
      requiredPassword: !!userKeys.passwordHash,
    });
  }

  private generateShareId(length: number = 12): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }
}
