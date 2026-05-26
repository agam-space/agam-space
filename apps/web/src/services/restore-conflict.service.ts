import {
  batchCheckFileExists,
  batchCheckFolderExists,
  ClientRegistry,
  encryptFileMetadata,
  encryptFolderMetadata,
  FileEntry,
  FolderEntry,
  folderManager,
  getDecryptedFileKeyById,
  getDecryptedFolderKey,
  hashFileName,
  hashFolderName,
} from '@agam-space/client';
import {
  FolderMetadata,
  FolderStatus,
  isFolderIdRoot,
  RestoreItem,
  UserFileMetadata,
} from '@agam-space/shared-types';
import { logger } from '@/lib/logger';

export class RestoreConflictService {
  /**
   * Generate a new name with suffix for conflict resolution
   */
  static generateNameWithSuffix(originalName: string, suffix: number): string {
    const lastDot = originalName.lastIndexOf('.');
    const hasExtension = lastDot !== -1 && lastDot !== 0;

    const baseName = hasExtension ? originalName.substring(0, lastDot) : originalName;
    const extension = hasExtension ? originalName.substring(lastDot) : '';

    const existingSuffixMatch = baseName.match(/^(.*)\s\((\d+)\)$/);

    if (existingSuffixMatch) {
      const nameWithoutSuffix = existingSuffixMatch[1];
      return `${nameWithoutSuffix} (${suffix})${extension}`;
    }

    return `${baseName} (${suffix})${extension}`;
  }

  /**
   * Check if a name conflicts with existing items at target location
   */
  static async checkNameConflict(
    nameHash: string,
    parentId: string | null,
    isFolder: boolean
  ): Promise<boolean> {
    const checkResult = isFolder
      ? await batchCheckFolderExists([{ parentId, nameHash }])
      : await batchCheckFileExists([{ parentId, nameHash }]);

    return checkResult.results[0].exists;
  }

  /**
   * Find an available name by trying suffixes until one doesn't conflict
   * Requires hashFileName function to compute hashes for candidate names
   */
  static async findAvailableName(
    baseName: string,
    parentId: string | null,
    isFolder: boolean
  ): Promise<{ name: string; suffix: number }> {
    let suffix = 1;
    const maxAttempts = 100;

    while (suffix <= maxAttempts) {
      const candidateName = this.generateNameWithSuffix(baseName, suffix);
      const nameHash = isFolder ? hashFolderName(candidateName) : hashFileName(candidateName);

      const checkResult = isFolder
        ? await batchCheckFolderExists([{ parentId, nameHash }])
        : await batchCheckFileExists([{ parentId, nameHash }]);

      if (!checkResult.results[0].exists) {
        return { name: candidateName, suffix };
      }

      suffix++;
    }

    throw new Error('Could not find available name after 100 attempts');
  }

  /**
   * Handle restore with parent status checking and name conflict resolution
   *
   * STEPS:
   * 1. Check parent status (active/trashed/deleted)
   * 2. Decide final parentId (keep original or move to root)
   * 3. Check name conflict at final location
   * 4. If conflict, generate new name and encrypt
   * 5. If moving to root, decrypt FEK and re-wrap with CMK
   */
  static async handleRestoreWithConflict(
    itemName: string,
    originalParentId: string | null,
    isFolder: boolean,
    itemId: string,
    existingItem: FileEntry | FolderEntry
  ): Promise<{
    finalName: string;
    finalParentId: string | null;
    restoreItem?: RestoreItem;
    hasConflict: boolean;
    movedToRoot: boolean;
  }> {
    let finalParentId = originalParentId;
    let movedToRoot = false;

    logger.debug(
      '[restore-conflict]',
      `Starting restore conflict check for item ID: ${itemId}, name: ${itemName}, original parent ID: ${originalParentId}, isFolder: ${isFolder}`
    );

    // STEP 1: Check parent folder status
    if (!isFolderIdRoot(originalParentId) && originalParentId) {
      const parentFolder =
        await ClientRegistry.getContentTreeManager().getFolderInfo(originalParentId);
      if (!parentFolder) {
        throw new Error('Cannot restore: Parent folder information not available.');
      }

      logger.debug(
        '[restore-conflict]',
        `Parent folder status: ${parentFolder.status} for folder ID: ${originalParentId}`
      );

      if (parentFolder.status === FolderStatus.TRASHED) {
        finalParentId = null;
        movedToRoot = true;
      } else if (parentFolder.status === FolderStatus.DELETED) {
        throw new Error(
          'Cannot restore: Parent folder was permanently deleted. Files cannot be recovered.'
        );
      }
    }

    // STEP 2: Check name conflict at final location
    const hasConflict = await this.checkNameConflict(
      existingItem.nameHash,
      finalParentId,
      isFolder
    );

    let finalName = itemName;
    let restoreItem: RestoreItem | undefined;

    if (hasConflict) {
      // STEP 3: Generate new name and prepare metadata
      const { name: newName } = await this.findAvailableName(itemName, finalParentId, isFolder);
      finalName = newName;
      const newNameHash = isFolder ? hashFolderName(newName) : hashFileName(newName);

      // Get encryption key for item to decrypt metadata
      let itemEncryptionKey: Uint8Array;
      try {
        if (isFolder) {
          itemEncryptionKey = await getDecryptedFolderKey(itemId);
        } else {
          itemEncryptionKey = await getDecryptedFileKeyById(itemId);
        }
      } catch (err) {
        console.error('Failed to get item encryption key:', err);
        throw new Error('Failed to prepare metadata for restore', { cause: err });
      }

      // Decrypt existing metadata, update name, re-encrypt
      let newMetadataEncrypted: string;
      try {
        if (isFolder) {
          const updatedMetadata: FolderMetadata = {
            ...(existingItem.metadata as FolderMetadata),
            name: newName,
          };
          newMetadataEncrypted = await encryptFolderMetadata(updatedMetadata, itemEncryptionKey);
        } else {
          const updatedMetadata: UserFileMetadata = {
            ...(existingItem.metadata as UserFileMetadata),
            name: newName,
          };
          newMetadataEncrypted = await encryptFileMetadata(updatedMetadata, itemEncryptionKey);
        }
      } catch (err) {
        console.error('Failed to encrypt new metadata:', err);
        throw new Error('Failed to prepare renamed file/folder for restore', { cause: err });
      }

      restoreItem = {
        nameHash: newNameHash,
        metadataEncrypted: newMetadataEncrypted,
      };
    }

    // STEP 4: If moving to root, FEK re-wrapping must be handled
    if (movedToRoot && !restoreItem) {
      let itemEncryptionKey: Uint8Array;
      try {
        if (isFolder) {
          itemEncryptionKey = await getDecryptedFolderKey(itemId);
        } else {
          itemEncryptionKey = await getDecryptedFileKeyById(itemId);
        }

        const parentKey = await getDecryptedFolderKey('root');
        const fkWrapped = await folderManager.encryptFolderKey(itemEncryptionKey, parentKey);

        if (!restoreItem) {
          restoreItem = {};
        }
        restoreItem.fkWrapped = fkWrapped;
        restoreItem.parentId = finalParentId;
      } catch (err) {
        console.error('Failed to get item encryption key:', err);
        throw new Error('Failed to prepare metadata for restore', { cause: err });
      }
    }

    return {
      finalName,
      finalParentId,
      restoreItem,
      hasConflict,
      movedToRoot,
    };
  }
}
