import { ApiClient } from '../api';
import { ICryptoKeyOperationsService } from '../keys/crypto-key-operations-service';
import { DownloadManager } from '../files';
import { ContentTreeManager } from '../content-tree/content-tree.manager';
import { KeyManager } from '../keys/key-manager';
import { UploadManager } from '../files/upload/upload-manager';
import { defineClientRegistry } from './client-registry-definitions';

export const ClientRegistry = defineClientRegistry<{
  apiClient: ApiClient;
  keyManager: KeyManager;
  uploadManager: UploadManager;
  downloadManager: DownloadManager;
  contentTreeManager: ContentTreeManager;
  cryptoKeyOperationsService: ICryptoKeyOperationsService;
}>([
  'apiClient',
  'keyManager',
  'uploadManager',
  'downloadManager',
  'contentTreeManager',
  'cryptoKeyOperationsService',
]);

export function getClientRegistry() {
  return {
    apiClient: ClientRegistry.getApiClient(),
    keyManager: ClientRegistry.getKeyManager(),
    uploadManager: ClientRegistry.getUploadManager(),
    downloadManager: ClientRegistry.getDownloadManager(),
    contentTreeManager: ClientRegistry.getContentTreeManager(),
  };
}
