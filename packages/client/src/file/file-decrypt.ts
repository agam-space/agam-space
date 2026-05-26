import { File, UserFileMetadata, UserFileMetadataSchema } from '@agam-space/shared-types';
import { FileEntry } from '../content-tree.store';
import { decryptEnvelope } from '../encryption/encryption';
import { getDecryptedFolderKey } from '../folder/folder-contents';
import { EncryptedEnvelopeCodec, fromUtf8Bytes } from '@agam-space/core';
import { EncryptionRegistry } from '../encryption/encryption-strategy';
import { fetchFileByIdApi } from '../api';
import { ClientRegistry } from '../init/client.registry';

export async function getFileDecrypted(fileId: string) {
  const file = await fetchFileByIdApi(fileId);
  if (!file) {
    throw new Error(`File with ID ${fileId} not found`);
  }

  return decryptFile(file);
}

export async function decryptFile(file: File): Promise<FileEntry> {
  const fileKey = await getDecryptedFileKey(file);
  const metadata = await decryptFileMetadata(file.metadataEncrypted, fileKey);
  return {
    id: file.id,
    name: metadata.name,
    nameHash: file.nameHash,
    mime: metadata.mimeType || 'application/octet-stream',
    parentId: file.parentId || 'root',
    size: file.approxSize,
    isFolder: false,
    chunkCount: file.chunkCount,
    createdAt: new Date(file.createdAt),
    updatedAt: new Date(file.updatedAt),
    metadata: metadata,
  };
}

export async function getDecryptedFileKeyById(fileId: string): Promise<Uint8Array> {
  const key = ClientRegistry.getKeyManager().getFileKey(fileId);
  if (key) {
    return key;
  }

  const file = await fetchFileByIdApi(fileId);
  return getDecryptedFileKey(file);
}

export async function getDecryptedFileKey(file: File): Promise<Uint8Array> {
  let key = ClientRegistry.getKeyManager().getFileKey(file.id);
  if (key) {
    return key;
  }

  const parentKey = await getDecryptedFolderKey(file.parentId);
  key = await decryptEnvelope(file.fkWrapped, parentKey);

  ClientRegistry.getKeyManager().setFileKey(file.id, key);
  return key;
}

export async function decryptFileMetadata(
  metadataEncrypted: string,
  fileKey: Uint8Array
): Promise<UserFileMetadata> {
  const metadataBytes = await decryptEnvelope(metadataEncrypted, fileKey);
  const metadata = JSON.parse(fromUtf8Bytes(metadataBytes));
  return UserFileMetadataSchema.parse(metadata);
}

export async function decryptFileChunk(
  chunkEncrypted: Uint8Array,
  fileKey: Uint8Array
): Promise<Uint8Array> {
  let envelope;
  try {
    envelope = EncryptedEnvelopeCodec.deserializeFromTLV(chunkEncrypted);
  } catch (e) {
    console.error(`Failed to deserialize chunk: ${e}`);
    throw new Error('Invalid encrypted chunk format', { cause: e });
  }
  return EncryptionRegistry.get().decrypt(envelope, fileKey);
}

export async function* decryptFileChunks({
  fileId,
  fileKey,
  totalChunks,
  fetchChunk,
}: {
  fileId: string;
  fileKey: Uint8Array;
  totalChunks: number;
  fetchChunk: (fileId: string, chunkIndex: number) => Promise<Uint8Array>;
}): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < totalChunks; i++) {
    const encrypted = await fetchChunk(fileId, i);
    const decrypted = await decryptFileChunk(encrypted, fileKey);
    yield decrypted;
  }
}
