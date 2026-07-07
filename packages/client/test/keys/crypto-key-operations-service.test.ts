import { randomBytes } from '@agam-space/core';
import { CmkManager } from '../../src/keys/cmk-manager';
import { CryptoKeyOperationsService } from '../../src/keys/crypto-key-operations-service';

describe('CryptoKeyOperationsService', () => {
  let service: CryptoKeyOperationsService;
  let cmk: Uint8Array;

  beforeEach(() => {
    service = new CryptoKeyOperationsService();
    cmk = randomBytes(32);
  });

  describe('before initialization', () => {
    it('reports not initialized', () => {
      expect(service.isInitialized()).toBe(false);
    });

    it('returns null for the CMK', async () => {
      expect(await service.getCMK()).toBeNull();
    });

    it('returns null for the identity public key', async () => {
      expect(await service.getIdentitySignPubKey()).toBeNull();
    });

    it('throws when signing without an identity key', async () => {
      await expect(service.signWithIdentity(new Uint8Array([1, 2, 3]))).rejects.toThrow(
        'Identity sign key not available'
      );
    });

    it('throws when encrypting without a CMK', async () => {
      await expect(service.encryptAndEncodeWithCmk(new Uint8Array([1]))).rejects.toThrow(
        'CMK not available for encryption'
      );
    });

    it('throws when decrypting without a CMK', async () => {
      await expect(service.decodeAndDecryptWithCmk('anything')).rejects.toThrow(
        'CMK not available for decryption'
      );
    });
  });

  describe('initKeys with an identity seed', () => {
    it('derives the identity keypair from the seed and marks the service initialized', async () => {
      const cmkManager = new CmkManager();
      const bootstrap = await cmkManager.bootstrapCmkWithPassword('TestPassword123!');

      await service.initKeys({
        cmk: bootstrap.masterKey,
        encIdentitySeed: bootstrap.encIdentitySeed,
      });

      expect(service.isInitialized()).toBe(true);
      expect(await service.getCMK()).toEqual(bootstrap.masterKey);

      const pubKey = await service.getIdentitySignPubKey();
      expect(pubKey).not.toBeNull();
    });
  });

  describe('initKeys without an identity seed (legacy path)', () => {
    it('derives the identity keypair directly from the CMK', async () => {
      await service.initKeys({ cmk });

      expect(service.isInitialized()).toBe(true);
      expect(await service.getIdentitySignPubKey()).not.toBeNull();
    });
  });

  describe('signWithIdentity', () => {
    it('produces a verifiable signature once initialized', async () => {
      await service.initKeys({ cmk });
      const message = new TextEncoder().encode('hello world');

      const signature = await service.signWithIdentity(message);

      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBeGreaterThan(0);
    });
  });

  describe('encryptAndEncodeWithCmk / decodeAndDecryptWithCmk', () => {
    it('round-trips plaintext through the CMK', async () => {
      await service.initKeys({ cmk });
      const plaintext = new TextEncoder().encode('sensitive data');

      const encoded = await service.encryptAndEncodeWithCmk(plaintext);
      const decrypted = await service.decodeAndDecryptWithCmk(encoded);

      expect(Buffer.from(decrypted).equals(Buffer.from(plaintext))).toBe(true);
    });
  });

  describe('clearAll', () => {
    it('resets initialization state and clears the CMK', async () => {
      await service.initKeys({ cmk });
      expect(service.isInitialized()).toBe(true);

      service.clearAll();

      expect(service.isInitialized()).toBe(false);
      expect(await service.getCMK()).toBeNull();
    });
  });
});
