import {
  BatchCheckExistsResponseSchema,
  CreateFile,
  File,
  FileSchema,
  RestoreItem,
  TrashFilesResponseSchema,
  UpdateFile,
} from '@agam-space/shared-types';
import { ClientRegistry } from '../registry/client.registry';

export async function createNewFileApi(file: CreateFile) {
  return ClientRegistry.getApiClient().fetchAndParse(`/v1/files`, FileSchema, {
    method: 'POST',
    body: JSON.stringify(file),
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export async function completeFileUploadApi(fileId: string, checksum: string) {
  return ClientRegistry.getApiClient().fetchAndParse(`/v1/files/${fileId}/complete`, FileSchema, {
    method: 'PUT',
    body: JSON.stringify({ checksum }),
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export async function updateFileApi(fileId: string, updates: UpdateFile) {
  return ClientRegistry.getApiClient().fetchAndParse(`/v1/files/${fileId}`, FileSchema, {
    method: 'PATCH',
    body: JSON.stringify(updates),
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export async function fetchFileByIdApi(fileId: string): Promise<File> {
  return ClientRegistry.getApiClient().fetchAndParse(`/v1/files/${fileId}`, FileSchema);
}

export async function trashFileApi(fileId: string) {
  return ClientRegistry.getApiClient().fetchRaw(`/v1/files/${fileId}/trash`, {
    method: 'PATCH',
  });
}

export async function trashFilesApi(fileIds: string[]) {
  return ClientRegistry.getApiClient().fetchAndParse(
    `/v1/files/batch/trash`,
    TrashFilesResponseSchema,
    {
      method: 'PATCH',
      body: JSON.stringify({ fileIds }),
    }
  );
}

export async function uploadFileChunkApi(
  fileId: string,
  chunkIndex: number,
  chunk: Uint8Array,
  checksum: string
) {
  await ClientRegistry.getApiClient().fetchRaw(`/v1/files/${fileId}/chunks/${chunkIndex}`, {
    method: 'PUT',
    body: chunk as BodyInit,
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Checksum': checksum,
    },
  });
}

export async function fetchFileChunkApi(fileId: string, chunkIndex: number): Promise<Uint8Array> {
  const response = await ClientRegistry.getApiClient().fetchRaw(
    `/v1/files/${fileId}/chunks/${chunkIndex}`
  );
  return new Uint8Array(await response.arrayBuffer());
}

export async function restoreFileApi(fileId: string, restoreItem?: RestoreItem): Promise<void> {
  await ClientRegistry.getApiClient().fetchRaw(`/v1/files/${fileId}/restore`, {
    method: 'PATCH',
    body: restoreItem ? JSON.stringify(restoreItem) : undefined,
    headers: restoreItem ? { 'Content-Type': 'application/json' } : undefined,
  });
}

export async function batchCheckFileExists(
  checks: Array<{ parentId: string | null; nameHash: string }>
) {
  return ClientRegistry.getApiClient().fetchAndParse(
    `/v1/files/batch/check-exists`,
    BatchCheckExistsResponseSchema,
    {
      method: 'POST',
      body: JSON.stringify({ checks }),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
