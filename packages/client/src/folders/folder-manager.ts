import { CreatedFolder, Folder, FolderMetadata } from '@agam-space/shared-types';
import { randomBytes } from '@agam-space/core';
import { decryptEnvelope, encryptEnvelope, encryptJsonEnvelope } from '../crypto/encryption';
import { getDecryptedFolderKey } from './folder-contents';
import { hashFolderName } from './folder-operations';
import { ApiClientError, createFolderApi } from '../api';
import { AlreadyExistsError, AppError } from '../errors';
import { ClientRegistry } from '../registry/client.registry';

export class FolderManager {
  /**
   * Generate a random 256-bit folder key
   * Each folder gets its own unique encryption key
   */
  generateFolderKey(): Uint8Array {
    return randomBytes(32);
  }

  /**
   * Create a new folder with encrypted metadata
   *
   * @param name - Folder name
   * @param cmk - Content Master Key for root folders
   * @param fkEncryptionKey - Parent folder key for subfolders
   * @param parentId - Parent folder ID (undefined for root folders)
   * @returns Encrypted folder data ready for API
   */
  async createFolder(
    name: string,
    fkEncryptionKey: Uint8Array,
    parentId?: string
  ): Promise<CreatedFolder> {
    const nameHash = hashFolderName(name);

    const newFolderKey = this.generateFolderKey();

    // Create and encrypt metadata
    const metadata: FolderMetadata = {
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const [metadataEncrypted, fkWrapped] = await Promise.all([
      this.encryptMetadata(metadata, newFolderKey),
      this.encryptFolderKey(newFolderKey, fkEncryptionKey),
    ]);

    return {
      parentId,
      nameHash,
      metadataEncrypted,
      fkWrapped,
    };
  }

  async encryptFolderKey(folderKey: Uint8Array, fkEncryptionKey: Uint8Array): Promise<string> {
    return encryptEnvelope(folderKey, fkEncryptionKey);
  }

  async decryptFolderKey(fkWrapped: string, fkEncryptionKey: Uint8Array): Promise<Uint8Array> {
    return decryptEnvelope(fkWrapped, fkEncryptionKey);
  }

  async encryptMetadata(metadata: FolderMetadata, folderKey: Uint8Array): Promise<string> {
    return encryptJsonEnvelope(metadata, folderKey);
  }
}

export async function createNewFolder(name: string, parentId?: string): Promise<Folder> {
  const parentKey = await getDecryptedFolderKey(parentId);

  const folderManager = new FolderManager();
  const folderData = await folderManager.createFolder(name, parentKey, parentId);

  try {
    const folder = await createFolderApi(folderData);
    const folderKey = await folderManager.decryptFolderKey(folder.fkWrapped, parentKey);
    ClientRegistry.getKeyManager().setFolderKey(folder.id, folderKey);

    return folder;
  } catch (e) {
    if (e instanceof ApiClientError) {
      if (e.status === 409) {
        const message = `Folder with name "${name}" already exists in this location.`;
        throw new AlreadyExistsError(message, 'FOLDER_ALREADY_EXISTS');
      }
    }

    throw new AppError(`Failed to create folder: ${e}`, 'FOLDER_CREATION_FAILED');
  }
}

export const folderManager = new FolderManager();
