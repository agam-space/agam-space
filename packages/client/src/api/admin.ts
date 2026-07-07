import { ClientRegistry } from '../registry/client.registry';
import { UpdateUserStatusRequest, UpdateUserQuotaRequest } from '@agam-space/shared-types';
import { ApiClientError } from './api-client';

export async function updateUserStatus(
  userId: string,
  request: UpdateUserStatusRequest
): Promise<void> {
  try {
    await ClientRegistry.getApiClient().fetchRaw(`/v1/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch (e) {
    if (e instanceof ApiClientError) {
      if (e.status === 403) {
        throw new Error('Cannot modify your own account status', { cause: e });
      }
      if (e.status === 404) {
        throw new Error('User not found', { cause: e });
      }
    }
    throw new Error('Failed to update user status', { cause: e });
  }
}

export async function updateUserQuota(
  userId: string,
  request: UpdateUserQuotaRequest
): Promise<void> {
  try {
    await ClientRegistry.getApiClient().fetchRaw(`/v1/admin/users/${userId}/quota`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch (e) {
    if (e instanceof ApiClientError) {
      if (e.status === 404) {
        throw new Error('User or quota not found', { cause: e });
      }
    }
    throw new Error('Failed to update user quota', { cause: e });
  }
}
