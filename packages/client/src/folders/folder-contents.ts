import { FileEntry, FolderEntry } from '../content-tree/entities';
import { Folder, FolderMetadata } from '@agam-space/shared-types';
import { fetchFolderById, fetchFolderContentsApi } from '../api';
import { decryptEnvelope, decryptJsonEnvelope } from '../crypto/encryption';
import { fetchTrashedItemsApi } from '../api';
import { decryptFile } from '../files';
import { ClientRegistry } from '../registry/client.registry';

export async function loadTrashedItems(): Promise<{
  folders: FolderEntry[];
  files: FileEntry[];
  hasMore: boolean;
}> {
  const trashedItems = await fetchTrashedItemsApi();

  const folderEntries: FolderEntry[] = await Promise.all(
    trashedItems.folders.map(async folder => decryptFolder(folder))
  );

  const fileEntries: FileEntry[] = await Promise.all(
    trashedItems.files.map(async file => decryptFile(file))
  );

  return {
    folders: folderEntries,
    files: fileEntries,
    hasMore: false, // pagination not supported yet
  };
}

export async function fetchFolderContents(folderId: string): Promise<{
  folders: FolderEntry[];
  files: FileEntry[];
  hasMore: boolean;
}> {
  const contents = await fetchFolderContentsApi(folderId);

  const { folders, files } = contents;

  const folderEntries: FolderEntry[] = await Promise.all(
    folders.map(async folder => decryptFolder(folder))
  );

  const fileEntries: FileEntry[] = await Promise.all(files.map(async file => decryptFile(file)));

  return {
    folders: folderEntries,
    files: fileEntries,
    hasMore: false, // pagination not supported yet
  };
}

export async function decryptFolder(folder: Folder): Promise<FolderEntry> {
  const folderKey = await getDecryptedFolderKey(folder.id);
  const metadata = await decryptFolderMetadata(folder.metadataEncrypted, folderKey);
  return {
    id: folder.id,
    name: metadata.name,
    nameHash: folder.nameHash,
    parentId: folder.parentId || 'root',
    isFolder: true,
    createdAt: new Date(metadata.createdAt),
    updatedAt: new Date(folder.updatedAt),
  };
}

export async function getFolderInfo(folderId: string): Promise<FolderEntry> {
  const folder = await fetchFolderById(folderId);
  if (!folder) {
    throw new Error(`Folder with ID ${folderId} not found`);
  }

  const folderKey = await getDecryptedFolderKey(folder.id);
  const metadata = await decryptFolderMetadata(folder.metadataEncrypted, folderKey);

  return {
    id: folder.id,
    name: metadata.name,
    nameHash: folder.nameHash,
    parentId: folder.parentId || undefined,
    isFolder: true,
    createdAt: new Date(metadata.createdAt),
    updatedAt: new Date(folder.updatedAt),
    status: folder.status,
  };
}

export async function getDecryptedFolderKey(
  folderId: string | null | undefined
): Promise<Uint8Array> {
  //Root-level folder uses CMK
  if (!folderId || folderId === 'root') {
    const cmk = await ClientRegistry.getCryptoKeyOperationsService().getCMK();
    if (!cmk) throw new Error('CMK not loaded');
    return cmk;
  }

  // Check if the key is already cached
  const parentKey = ClientRegistry.getKeyManager().getFolderKey(folderId);
  if (parentKey) {
    return parentKey;
  }

  const folder = await fetchFolderById(folderId);
  if (!folder) {
    throw new Error(`Folder with ID ${folderId} not found`);
  }

  const parentFolderKey = await getDecryptedFolderKey(folder.parentId);
  const folderKey = await decryptEnvelope(folder.fkWrapped, parentFolderKey);

  ClientRegistry.getKeyManager().setFolderKey(folderId, folderKey);
  return folderKey;
}

export async function decryptFolderMetadata(
  metadataEncrypted: string,
  folderKey: Uint8Array
): Promise<FolderMetadata> {
  return decryptJsonEnvelope<FolderMetadata>(metadataEncrypted, folderKey);
}
