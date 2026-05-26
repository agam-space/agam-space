import {
  ResetCmkPasswordRequest,
  UserKeys,
  UserKeysSchema,
  UserKeysSetup,
  MigrateIdentitySeedRequest,
} from '@agam-space/shared-types';
import { ApiClientError } from './api-client';
import { ClientRegistry } from '../init/client.registry';

export async function fetchE2eeKeys(): Promise<UserKeys | null> {
  try {
    return await ClientRegistry.getApiClient().fetchAndParse(`/v1/e2ee/keys`, UserKeysSchema);
  } catch (e: unknown) {
    if (e instanceof ApiClientError && (e as ApiClientError)?.status === 404) {
      return null;
    }
    throw new Error(`Error fetching keys: ${e}`, { cause: e });
  }
}

export async function setupE2eeKeysApi(data: UserKeysSetup): Promise<UserKeys> {
  return await ClientRegistry.getApiClient().fetchAndParse(`/v1/e2ee/keys/setup`, UserKeysSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function resetCmkPasswordApi(request: ResetCmkPasswordRequest): Promise<UserKeys> {
  return ClientRegistry.getApiClient().fetchAndParse(`/v1/e2ee/keys/password`, UserKeysSchema, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export async function migrateIdentitySeedApi(
  request: MigrateIdentitySeedRequest
): Promise<UserKeys> {
  return ClientRegistry.getApiClient().fetchAndParse(
    `/v1/e2ee/keys/migrate-identity-seed`,
    UserKeysSchema,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }
  );
}
