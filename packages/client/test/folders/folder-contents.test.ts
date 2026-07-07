import { randomBytes } from '@agam-space/core';
import { Folder, FolderMetadata, File as UserFile } from '@agam-space/shared-types';
import { encryptEnvelope, encryptJsonEnvelope } from '../../src/crypto/encryption';
import { KeyManager } from '../../src/keys/key-manager';
import { ClientRegistry } from '../../src/registry/client.registry';
import { ICryptoKeyOperationsService } from '../../src/keys/crypto-key-operations-service';

jest.mock('../../src/api', () => ({
  ...jest.requireActual('../../src/api'),
  fetchFolderById: jest.fn(),
  fetchFolderContentsApi: jest.fn(),
  fetchTrashedItemsApi: jest.fn(),
}));
jest.mock('../../src/files', () => ({
  decryptFile: jest.fn(),
}));

import { fetchFolderById, fetchFolderContentsApi, fetchTrashedItemsApi } from '../../src/api';
import { decryptFile } from '../../src/files';
import {
  decryptFolder,
  fetchFolderContents,
  getDecryptedFolderKey,
  getFolderInfo,
  loadTrashedItems,
} from '../../src/folders/folder-contents';

function makeFakeCryptoKeyOperationsService(cmk: Uint8Array | null): ICryptoKeyOperationsService {
  return {
    initKeys: jest.fn(),
    signWithIdentity: jest.fn(),
    clearAll: jest.fn(),
    isInitialized: jest.fn(() => !!cmk),
    getCMK: jest.fn(async () => cmk),
    encryptAndEncodeWithCmk: jest.fn(),
    decodeAndDecryptWithCmk: jest.fn(),
    getIdentitySignPubKey: jest.fn(),
  };
}

async function makeFolder(
  overrides: Partial<Folder> & { key: Uint8Array; parentKey: Uint8Array; name?: string }
): Promise<Folder> {
  const { key, parentKey, name = 'Documents', ...rest } = overrides;
  const metadata: FolderMetadata = {
    name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  return {
    id: 'folder-1',
    userId: 'user-1',
    parentId: null,
    nameHash: 'hash',
    fkWrapped: await encryptEnvelope(key, parentKey),
    metadataEncrypted: await encryptJsonEnvelope(metadata, key),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...rest,
  } as Folder;
}

describe('folder-contents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ClientRegistry.clear();
    ClientRegistry.setKeyManager(new KeyManager());
  });

  describe('getDecryptedFolderKey', () => {
    it('returns the CMK for root-level folders', async () => {
      const cmk = randomBytes(32);
      ClientRegistry.setCryptoKeyOperationsService(makeFakeCryptoKeyOperationsService(cmk));

      const key = await getDecryptedFolderKey(null);

      expect(key).toEqual(cmk);
      expect(fetchFolderById).not.toHaveBeenCalled();
    });

    it('throws when the CMK is not loaded for root-level folders', async () => {
      ClientRegistry.setCryptoKeyOperationsService(makeFakeCryptoKeyOperationsService(null));

      await expect(getDecryptedFolderKey('root')).rejects.toThrow('CMK not loaded');
    });

    it('returns the cached folder key without hitting the API', async () => {
      const folderKey = randomBytes(32);
      ClientRegistry.getKeyManager().setFolderKey('folder-1', folderKey);

      const key = await getDecryptedFolderKey('folder-1');

      expect(key).toEqual(folderKey);
      expect(fetchFolderById).not.toHaveBeenCalled();
    });

    it('fetches, decrypts, and caches an uncached folder key using the CMK as root', async () => {
      const cmk = randomBytes(32);
      const folderKey = randomBytes(32);
      ClientRegistry.setCryptoKeyOperationsService(makeFakeCryptoKeyOperationsService(cmk));

      const folder = await makeFolder({
        id: 'folder-1',
        parentId: null,
        key: folderKey,
        parentKey: cmk,
      });
      (fetchFolderById as jest.Mock).mockResolvedValue(folder);

      const key = await getDecryptedFolderKey('folder-1');

      expect(Buffer.from(key)).toEqual(Buffer.from(folderKey));
      expect(ClientRegistry.getKeyManager().getFolderKey('folder-1')).toEqual(key);
    });

    it('recursively resolves nested folder keys through their parents', async () => {
      const cmk = randomBytes(32);
      const parentKey = randomBytes(32);
      const childKey = randomBytes(32);
      ClientRegistry.setCryptoKeyOperationsService(makeFakeCryptoKeyOperationsService(cmk));

      const parentFolder = await makeFolder({
        id: 'parent',
        parentId: null,
        key: parentKey,
        parentKey: cmk,
      });
      const childFolder = await makeFolder({
        id: 'child',
        parentId: 'parent',
        key: childKey,
        parentKey,
      });

      (fetchFolderById as jest.Mock).mockImplementation(async (id: string) =>
        id === 'parent' ? parentFolder : childFolder
      );

      const key = await getDecryptedFolderKey('child');

      expect(Buffer.from(key)).toEqual(Buffer.from(childKey));
    });

    it('throws when the folder does not exist', async () => {
      (fetchFolderById as jest.Mock).mockResolvedValue(undefined);

      await expect(getDecryptedFolderKey('missing-folder')).rejects.toThrow(
        'Folder with ID missing-folder not found'
      );
    });
  });

  describe('decryptFolder', () => {
    it('decrypts folder metadata and maps it to a FolderEntry', async () => {
      const cmk = randomBytes(32);
      const folderKey = randomBytes(32);
      ClientRegistry.setCryptoKeyOperationsService(makeFakeCryptoKeyOperationsService(cmk));

      const folder = await makeFolder({
        id: 'folder-1',
        parentId: null,
        key: folderKey,
        parentKey: cmk,
        name: 'Photos',
      });
      (fetchFolderById as jest.Mock).mockResolvedValue(folder);

      const entry = await decryptFolder(folder);

      expect(entry).toMatchObject({
        id: 'folder-1',
        name: 'Photos',
        nameHash: 'hash',
        parentId: 'root',
        isFolder: true,
      });
    });
  });

  describe('getFolderInfo', () => {
    it('throws when the folder is not found', async () => {
      (fetchFolderById as jest.Mock).mockResolvedValue(undefined);

      await expect(getFolderInfo('missing')).rejects.toThrow('Folder with ID missing not found');
    });

    it('returns a decrypted FolderEntry including status', async () => {
      const cmk = randomBytes(32);
      const folderKey = randomBytes(32);
      ClientRegistry.setCryptoKeyOperationsService(makeFakeCryptoKeyOperationsService(cmk));

      const folder = await makeFolder({
        id: 'folder-1',
        parentId: null,
        key: folderKey,
        parentKey: cmk,
        name: 'Reports',
        status: 'active' as never,
      });
      (fetchFolderById as jest.Mock).mockResolvedValue(folder);

      const entry = await getFolderInfo('folder-1');

      expect(entry.name).toBe('Reports');
      expect(entry.status).toBe('active');
    });
  });

  describe('fetchFolderContents', () => {
    it('decrypts every folder and file returned by the API', async () => {
      const cmk = randomBytes(32);
      const folderKey = randomBytes(32);
      ClientRegistry.setCryptoKeyOperationsService(makeFakeCryptoKeyOperationsService(cmk));

      const folder = await makeFolder({
        id: 'folder-1',
        parentId: null,
        key: folderKey,
        parentKey: cmk,
      });
      const file = { id: 'file-1' } as UserFile;
      const decryptedFile = { id: 'file-1', isFolder: false } as never;

      (fetchFolderById as jest.Mock).mockResolvedValue(folder);
      (fetchFolderContentsApi as jest.Mock).mockResolvedValue({ folders: [folder], files: [file] });
      (decryptFile as jest.Mock).mockResolvedValue(decryptedFile);

      const result = await fetchFolderContents('root');

      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].id).toBe('folder-1');
      expect(result.files).toEqual([decryptedFile]);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('loadTrashedItems', () => {
    it('decrypts trashed folders and files', async () => {
      const cmk = randomBytes(32);
      const folderKey = randomBytes(32);
      ClientRegistry.setCryptoKeyOperationsService(makeFakeCryptoKeyOperationsService(cmk));

      const folder = await makeFolder({
        id: 'folder-1',
        parentId: null,
        key: folderKey,
        parentKey: cmk,
      });
      const file = { id: 'file-1' } as UserFile;
      const decryptedFile = { id: 'file-1', isFolder: false } as never;

      (fetchFolderById as jest.Mock).mockResolvedValue(folder);
      (fetchTrashedItemsApi as jest.Mock).mockResolvedValue({ folders: [folder], files: [file] });
      (decryptFile as jest.Mock).mockResolvedValue(decryptedFile);

      const result = await loadTrashedItems();

      expect(result.folders).toHaveLength(1);
      expect(result.files).toEqual([decryptedFile]);
    });
  });
});
