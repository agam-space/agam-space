import { UserQuota, UserQuotaSchema } from '@agam-space/shared-types';
import { ClientRegistry } from '../registry/client.registry';

export async function fetchMyQuota(): Promise<UserQuota> {
  return ClientRegistry.getApiClient().fetchAndParse('/v1/quota/me', UserQuotaSchema);
}
