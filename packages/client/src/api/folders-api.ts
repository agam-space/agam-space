import {
  BatchCheckFolderExistsResponseSchema,
  CreatedFolder,
  Folder,
  FolderArraySchema,
  FolderContents,
  FolderContentsSchema,
  FolderSchema,
  RestoreItem,
  TrashFoldersResponseSchema,
  UpdateFolder,
} from '@agam-space/shared-types';
import { ClientRegistry } from '../registry/client.registry';

export async function fetchFoldersApi(): Promise<Folder[]> {
  return await ClientRegistry.getApiClient().fetchAndParse('/v1/folders', FolderArraySchema);
}

export async function fetchFolderById(id: string): Promise<Folder> {
  return await ClientRegistry.getApiClient().fetchAndParse(`/v1/folders/${id}`, FolderSchema);
}

export async function createFolderApi(folder: CreatedFolder): Promise<Folder> {
  return await ClientRegistry.getApiClient().fetchAndParse('/v1/folders', FolderSchema, {
    method: 'POST',
    body: JSON.stringify(folder),
  });
}

export async function patchFolderApi(folderId: string, patchData: UpdateFolder): Promise<Folder> {
  return await ClientRegistry.getApiClient().fetchAndParse(
    `/v1/folders/${folderId}`,
    FolderSchema,
    {
      method: 'PATCH',
      body: JSON.stringify(patchData),
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

export async function fetchFolderContentsApi(folderId: string): Promise<FolderContents> {
  return await ClientRegistry.getApiClient().fetchAndParse(
    `/v1/folders/${folderId}/contents`,
    FolderContentsSchema
  );
}

export async function trashFolderApi(folderId: string): Promise<void> {
  await ClientRegistry.getApiClient().fetchRaw(`/v1/folders/${folderId}/trash`, {
    method: 'PATCH',
  });
}

export async function trashFoldersApi(folderIds: string[]) {
  return await ClientRegistry.getApiClient().fetchAndParse(
    '/v1/folders/batch/trash',
    TrashFoldersResponseSchema,
    {
      method: 'PATCH',
      body: JSON.stringify(folderIds),
    }
  );
}

export async function restoreFolderApi(folderId: string, restoreItem?: RestoreItem): Promise<void> {
  await ClientRegistry.getApiClient().fetchRaw(`/v1/folders/${folderId}/restore`, {
    method: 'PATCH',
    body: restoreItem ? JSON.stringify(restoreItem) : undefined,
    headers: restoreItem ? { 'Content-Type': 'application/json' } : undefined,
  });
}

export async function batchCheckFolderExists(
  checks: Array<{ parentId: string | null; nameHash: string }>
) {
  return ClientRegistry.getApiClient().fetchAndParse(
    `/v1/folders/batch/check-exists`,
    BatchCheckFolderExistsResponseSchema,
    {
      method: 'POST',
      body: JSON.stringify({ checks }),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function fetchFolderAncestorsApi(folderId: string, depth: number): Promise<Folder[]> {
  return await ClientRegistry.getApiClient().fetchAndParse(
    `/v1/folders/${folderId}/ancestors/path?depth=${depth}`,
    FolderArraySchema
  );
}
