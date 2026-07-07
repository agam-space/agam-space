import { UpdateFile, UserFileMetadata } from '@agam-space/shared-types';
import { FileEntry } from '../content-tree/entities';
import { blake3HashWithEncoding } from '@agam-space/core';
import { encryptEnvelope, encryptJsonEnvelope } from '../crypto/encryption';
import { getDecryptedFileKeyById } from './file-decrypt';
import { updateFileApi } from '../api';
import { getDecryptedFolderKey } from '../folders/folder-contents';
import { ClientRegistry } from '../registry/client.registry';
import { processBatch } from '../utils/batch';

export function hashFileName(name: string): string {
  return blake3HashWithEncoding(name.trim(), 'hex');
}

export async function encryptFileMetadata(
  metadata: UserFileMetadata,
  fileKey: Uint8Array
): Promise<string> {
  return encryptJsonEnvelope(metadata, fileKey);
}

export async function renameFile(file: FileEntry, newName: string): Promise<FileEntry> {
  const fileKey = await getDecryptedFileKeyById(file.id);

  const updatedMetadata: UserFileMetadata = {
    ...file.metadata!,
    name: newName,
  };

  const newNameHash = hashFileName(newName);
  const metadataEncrypted = await encryptFileMetadata(updatedMetadata, fileKey);

  const updates: UpdateFile = {
    nameHash: newNameHash,
    metadataEncrypted,
  };

  const updatedFile = await updateFileApi(file.id, updates);

  return {
    ...file,
    name: newName,
    updatedAt: new Date(updatedFile.updatedAt),
    metadata: updatedMetadata,
  };
}

export async function moveFiles(
  files: FileEntry[],
  currentFolderId: string | null,
  targetFolderId: string | null
): Promise<{
  updated: FileEntry[];
  failed: { id: string; error: string }[];
}> {
  if (files.length === 0)
    return {
      updated: [],
      failed: [],
    };

  const parentFolderKey = await getDecryptedFolderKey(targetFolderId);

  const { results, failed } = await processBatch(
    files,
    file => file.id,
    async file => {
      const fileKey = await getDecryptedFileKeyById(file.id);
      const fkWrapped = await encryptEnvelope(fileKey, parentFolderKey);

      const updateFile: UpdateFile = { parentId: targetFolderId, fkWrapped };
      const updatedFile = await updateFileApi(file.id, updateFile);
      ClientRegistry.getKeyManager().setFileKey(file.id, fileKey);

      return updatedFile;
    }
  );

  const updated: FileEntry[] = results.map(({ item, result }) => ({
    ...item,
    parentId: targetFolderId ?? 'root',
    updatedAt: new Date(result.updatedAt),
  }));

  ClientRegistry.getContentTreeManager().store.evictFolderData(currentFolderId || 'root');
  ClientRegistry.getContentTreeManager().store.evictFolderData(targetFolderId || 'root');

  return {
    updated,
    failed,
  };
}
