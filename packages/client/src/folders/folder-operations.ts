import { FolderEntry } from '../content-tree/entities';
import { FolderMetadata, UpdateFolder } from '@agam-space/shared-types';
import { getDecryptedFolderKey } from './folder-contents';
import { blake3HashWithEncoding } from '@agam-space/core';
import { encryptEnvelope, encryptJsonEnvelope } from '../crypto/encryption';
import { patchFolderApi } from '../api';
import { ClientRegistry } from '../registry/client.registry';
import { processBatch } from '../utils/batch';

export async function renameFolder(folder: FolderEntry, newName: string): Promise<FolderEntry> {
  const folderKey = await getDecryptedFolderKey(folder.id);

  const updatedMetadata: FolderMetadata = {
    ...folder.metadata!,
    name: newName.trim(),
  };

  const nameHash = hashFolderName(updatedMetadata.name);
  const metadataEncrypted = await encryptFolderMetadata(updatedMetadata, folderKey);

  const updateFolder: UpdateFolder = {
    nameHash,
    metadataEncrypted,
  };

  const updatedFolder = await patchFolderApi(folder.id, updateFolder);

  return {
    ...folder,
    name: newName,
    updatedAt: new Date(updatedFolder.updatedAt),
    metadata: updatedMetadata,
  };
}

export async function moveFolders(
  folders: FolderEntry[],
  currentFolderId: string | null,
  targetFolderId: string | null
): Promise<{
  updated: FolderEntry[];
  failed: { id: string; error: string }[];
}> {
  if (!folders || folders.length === 0)
    return {
      updated: [],
      failed: [],
    };

  const parentFolderKey = await getDecryptedFolderKey(targetFolderId);

  const { results, failed } = await processBatch(
    folders,
    folder => folder.id,
    async folder => {
      const folderKey = await getDecryptedFolderKey(folder.id);
      const fkWrapped = await encryptEnvelope(folderKey, parentFolderKey);

      const updateFolder: UpdateFolder = { parentId: targetFolderId, fkWrapped };
      const updatedFolder = await patchFolderApi(folder.id, updateFolder);
      ClientRegistry.getKeyManager().setFolderKey(folder.id, folderKey);

      ClientRegistry.getContentTreeManager().store.evictFolderData(folder.id);

      return updatedFolder;
    }
  );

  const updated: FolderEntry[] = results.map(({ item, result }) => ({
    ...item,
    parentId: targetFolderId || undefined,
    updatedAt: new Date(result.updatedAt),
  }));

  ClientRegistry.getContentTreeManager().store.evictFolderData(currentFolderId || 'root');
  ClientRegistry.getContentTreeManager().store.evictFolderData(targetFolderId || 'root');

  return {
    updated,
    failed,
  };
}

export async function encryptFolderMetadata(
  metadata: FolderMetadata,
  key: Uint8Array
): Promise<string> {
  return encryptJsonEnvelope(metadata, key);
}

/**
 * Folder names are treated case-insensitively for uniqueness, matching
 * the nameHash computed at folder creation time (see FolderManager.createFolder).
 */
export function hashFolderName(name: string): string {
  return blake3HashWithEncoding(name.trim().toLowerCase(), 'hex');
}
