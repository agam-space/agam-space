import {
  CreatePublicShare,
  CreatePublicShareSchema,
  PublicShareDetails,
  PublicShareDetailsSchema,
  PublicShareResponse,
  PublicShareResponseSchema,
  GetPublicShareKeyDetails,
  PublicShareKeys,
  PublicShareKeysSchema,
  PublicShareExternalDetails,
  PublicShareExternalDetailsSchema,
  PublicShareContentResponse,
  PublicShareContentResponseSchema,
} from '@agam-space/shared-types';
import { ClientRegistry } from '../registry/client.registry';

export async function createPublicShareApi(data: CreatePublicShare): Promise<PublicShareResponse> {
  const validated = CreatePublicShareSchema.parse(data);
  return await ClientRegistry.getApiClient().fetchAndParse(
    '/v1/public-shares',
    PublicShareResponseSchema,
    {
      method: 'POST',
      body: JSON.stringify(validated),
    }
  );
}

export async function listPublicSharesApi(): Promise<PublicShareDetails[]> {
  return await ClientRegistry.getApiClient().fetchAndParse(
    '/v1/public-shares',
    PublicShareDetailsSchema.array()
  );
}

export async function revokePublicShareApi(shareId: string): Promise<void> {
  await ClientRegistry.getApiClient().fetchRaw(`/v1/public-shares/${shareId}/revoke`, {
    method: 'POST',
  });
}

export async function getPublicShareMetadataApi(
  shareId: string
): Promise<PublicShareExternalDetails> {
  return await ClientRegistry.getApiClient().fetchAndParse(
    `/v1/public/share/${shareId}`,
    PublicShareExternalDetailsSchema
  );
}

export async function getPublicShareKeysApi(
  shareId: string,
  password?: string
): Promise<PublicShareKeys> {
  const body: GetPublicShareKeyDetails = { password };
  return await ClientRegistry.getApiClient().fetchAndParse(
    `/v1/public/share/${shareId}/keys`,
    PublicShareKeysSchema,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
}

export async function getPublicShareContentApi(
  shareId: string,
  accessToken: string,
  folderId?: string
): Promise<PublicShareContentResponse> {
  const params = new URLSearchParams();
  if (folderId) {
    params.set('folderId', folderId);
  }

  const endpoint = `/v1/public/share/${shareId}/content${params.toString() ? `?${params.toString()}` : ''}`;

  return await ClientRegistry.getApiClient().fetchAndParse(
    endpoint,
    PublicShareContentResponseSchema,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
}

export async function fetchPublicFileChunkApi(
  shareId: string,
  accessToken: string,
  fileId: string,
  chunkIndex: number
): Promise<Uint8Array> {
  const endpoint = `/v1/public/share/${shareId}/files/${fileId}/chunks/${chunkIndex}`;

  const response = await ClientRegistry.getApiClient().fetchRaw(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return new Uint8Array(await response.arrayBuffer());
}
