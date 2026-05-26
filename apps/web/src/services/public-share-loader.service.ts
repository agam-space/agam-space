import { PublicShareApi, PublicShareCrypto } from '@agam-space/client';
import type {
  PublicShareExternalDetails,
  PublicShareKeys,
  PublicShareContentResponse,
} from '@agam-space/shared-types';
import { logger } from '@/lib/logger';

export interface ShareLoadResult {
  success: boolean;
  metadata?: PublicShareExternalDetails;
  keys?: PublicShareKeys;
  errorType?: string;
  error?: string;
}

export class PublicShareLoaderService {
  static async fetchShareMetadata(shareId: string): Promise<PublicShareExternalDetails> {
    return await PublicShareApi.getShareMetadata(shareId);
  }

  static async getShareKeys(shareId: string, password?: string): Promise<PublicShareKeys> {
    return PublicShareApi.getShareKeys(shareId, password);
  }

  static async decryptShareItemKey(
    serverShareKey: string,
    clientKey: string,
    salt: string,
    wrappedItemKey: string,
    password?: string
  ): Promise<Uint8Array> {
    try {
      logger.debug('PublicShareLoaderService', 'Deriving wrap key...', {
        hasClientKey: !!clientKey,
        hasServerKey: !!serverShareKey,
        hasSalt: !!salt,
        hasPassword: !!password,
        clientKeyLength: clientKey?.length,
        serverKeyLength: serverShareKey?.length,
        saltLength: salt?.length,
      });

      const wrapKey = await PublicShareCrypto.deriveWrapKey(
        clientKey,
        serverShareKey,
        salt,
        password
      );

      logger.debug('PublicShareLoaderService', 'Wrap key derived, unwrapping item key...', {
        wrapKeyLength: wrapKey.length,
        wrappedItemKeyLength: wrappedItemKey?.length,
      });

      const itemKey = await PublicShareCrypto.unwrapKey(wrappedItemKey, wrapKey);

      logger.debug('PublicShareLoaderService', 'Item key unwrapped successfully', {
        itemKeyLength: itemKey.length,
      });

      return itemKey;
    } catch (e: unknown) {
      logger.error('PublicShareLoaderService', 'Failed to decrypt share item key', e);
      throw new Error('Failed to decrypt share item key', { cause: e });
    }
  }

  static async getShareContent(
    shareId: string,
    accessToken: string
  ): Promise<PublicShareContentResponse> {
    return PublicShareApi.getShareContent(shareId, accessToken);
  }
}
