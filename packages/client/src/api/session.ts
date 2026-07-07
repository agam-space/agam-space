import { SessionCryptoMaterial, SessionCryptoMaterialSchema } from '@agam-space/shared-types';
import { ClientRegistry } from '../registry/client.registry';

export async function fetchSessionCryptoMaterial(): Promise<SessionCryptoMaterial> {
  return ClientRegistry.getApiClient().fetchAndParse(
    '/v1/session/crypto-material',
    SessionCryptoMaterialSchema
  );
}
