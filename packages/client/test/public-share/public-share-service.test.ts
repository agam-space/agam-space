import { randomBytes } from '@agam-space/core';
import { PublicShareService } from '../../src/public-share/public-share-service';
import { PublicShareCrypto } from '../../src/public-share/public-share-crypto';

jest.mock('../../src/api', () => ({
  ...jest.requireActual('../../src/api'),
  createPublicShareApi: jest.fn(),
  listPublicSharesApi: jest.fn(),
  revokePublicShareApi: jest.fn(),
}));

import { createPublicShareApi, listPublicSharesApi, revokePublicShareApi } from '../../src/api';

describe('PublicShareService', () => {
  const originalWindow = (global as any).window;

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).window = { location: { origin: 'https://app.example.com' } };
  });

  afterAll(() => {
    (global as any).window = originalWindow;
  });

  describe('createShare', () => {
    it('rejects when no item key is provided', async () => {
      await expect(
        PublicShareService.createShare(
          { itemId: 'item-1', itemType: 'file' },
          undefined as unknown as Uint8Array
        )
      ).rejects.toThrow('Item key is required to create a public share');

      expect(createPublicShareApi).not.toHaveBeenCalled();
    });

    it('wraps the item key and sends the correct payload to the API', async () => {
      const itemKey = randomBytes(32);
      (createPublicShareApi as jest.Mock).mockResolvedValue({ id: 'share-123' });

      const result = await PublicShareService.createShare(
        { itemId: 'item-1', itemType: 'file' },
        itemKey
      );

      expect(createPublicShareApi).toHaveBeenCalledTimes(1);
      const payload = (createPublicShareApi as jest.Mock).mock.calls[0][0];
      expect(payload.itemId).toBe('item-1');
      expect(payload.itemType).toBe('file');
      expect(typeof payload.serverShareKey).toBe('string');
      expect(typeof payload.wrappedItemKey).toBe('string');
      expect(typeof payload.salt).toBe('string');

      expect(result.shareId).toBe('share-123');
      expect(result.clientKey).toBeDefined();
      expect(result.shareUrl).toContain('share-123');
      expect(result.shareUrl).toContain(result.clientKey);
    });

    it('includes the password and expiry when provided', async () => {
      const itemKey = randomBytes(32);
      (createPublicShareApi as jest.Mock).mockResolvedValue({ id: 'share-456' });
      const expiresAt = new Date('2030-01-01T00:00:00.000Z');

      await PublicShareService.createShare(
        { itemId: 'folder-1', itemType: 'folder', password: 'secret', expiresAt },
        itemKey
      );

      const payload = (createPublicShareApi as jest.Mock).mock.calls[0][0];
      expect(payload.password).toBe('secret');
      expect(payload.expiresAt).toBe(expiresAt.toISOString());
    });

    it('produces a wrapped key that the server share key + client key can unwrap', async () => {
      const itemKey = randomBytes(32);
      (createPublicShareApi as jest.Mock).mockResolvedValue({ id: 'share-789' });

      const result = await PublicShareService.createShare(
        { itemId: 'item-1', itemType: 'file' },
        itemKey
      );
      const payload = (createPublicShareApi as jest.Mock).mock.calls[0][0];

      const wrapKey = await PublicShareCrypto.deriveWrapKey(
        result.clientKey,
        payload.serverShareKey,
        payload.salt
      );
      const unwrapped = await PublicShareCrypto.unwrapKey(payload.wrappedItemKey, wrapKey);

      expect(Buffer.from(unwrapped)).toEqual(Buffer.from(itemKey));
    });
  });

  describe('revokeShare', () => {
    it('delegates to the API', async () => {
      await PublicShareService.revokeShare('share-1');
      expect(revokePublicShareApi).toHaveBeenCalledWith('share-1');
    });
  });

  describe('listShares', () => {
    it('returns the shares from the API', async () => {
      const shares = [{ id: 'share-1' }, { id: 'share-2' }];
      (listPublicSharesApi as jest.Mock).mockResolvedValue(shares);

      const result = await PublicShareService.listShares();

      expect(result).toEqual(shares);
      expect(listPublicSharesApi).toHaveBeenCalledTimes(1);
    });
  });
});
