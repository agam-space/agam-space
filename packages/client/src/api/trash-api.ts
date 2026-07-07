import {
  EmptyTrashResponse,
  EmptyTrashResponseSchema,
  TrashedItems,
  TrashItemsSchema,
} from '@agam-space/shared-types';
import { ClientRegistry } from '../registry/client.registry';

export async function emptyTrashApi(): Promise<EmptyTrashResponse> {
  return ClientRegistry.getApiClient().fetchAndParse(`/v1/trash/empty`, EmptyTrashResponseSchema, {
    method: 'DELETE',
  });
}

export async function fetchTrashedItemsApi(): Promise<TrashedItems> {
  return ClientRegistry.getApiClient().fetchAndParse(`/v1/trash/items`, TrashItemsSchema);
}
