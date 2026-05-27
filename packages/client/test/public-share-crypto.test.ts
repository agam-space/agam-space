import { PublicShareCrypto } from '../src/public-share-crypto';
import { randomBytes } from '@agam-space/core';

describe('PublicShareCrypto', () => {
  describe('key generation', () => {
    it('should generate a unique client key each time', () => {
      const k1 = PublicShareCrypto.generateClientKey();
      const k2 = PublicShareCrypto.generateClientKey();

      expect(typeof k1).toBe('string');
      expect(k1.length).toBeGreaterThan(0);
      expect(k1).not.toBe(k2);
    });

    it('should generate a unique server share key each time', () => {
      const k1 = PublicShareCrypto.generateServerShareKey();
      const k2 = PublicShareCrypto.generateServerShareKey();

      expect(typeof k1).toBe('string');
      expect(k1).not.toBe(k2);
    });

    it('should generate a unique salt each time', () => {
      const s1 = PublicShareCrypto.generateSalt();
      const s2 = PublicShareCrypto.generateSalt();

      expect(typeof s1).toBe('string');
      expect(s1).not.toBe(s2);
    });
  });

  describe('deriveWrapKey', () => {
    it('should derive a 32-byte key', async () => {
      const clientKey = PublicShareCrypto.generateClientKey();
      const serverKey = PublicShareCrypto.generateServerShareKey();
      const salt = PublicShareCrypto.generateSalt();

      const wrapKey = await PublicShareCrypto.deriveWrapKey(clientKey, serverKey, salt);

      expect(wrapKey).toBeInstanceOf(Uint8Array);
      expect(wrapKey.length).toBe(32);
    });

    it('should be deterministic with same inputs', async () => {
      const clientKey = PublicShareCrypto.generateClientKey();
      const serverKey = PublicShareCrypto.generateServerShareKey();
      const salt = PublicShareCrypto.generateSalt();

      const k1 = await PublicShareCrypto.deriveWrapKey(clientKey, serverKey, salt);
      const k2 = await PublicShareCrypto.deriveWrapKey(clientKey, serverKey, salt);

      expect(Buffer.from(k1)).toEqual(Buffer.from(k2));
    });

    it('should produce different keys for different client keys', async () => {
      const serverKey = PublicShareCrypto.generateServerShareKey();
      const salt = PublicShareCrypto.generateSalt();

      const k1 = await PublicShareCrypto.deriveWrapKey(
        PublicShareCrypto.generateClientKey(),
        serverKey,
        salt
      );
      const k2 = await PublicShareCrypto.deriveWrapKey(
        PublicShareCrypto.generateClientKey(),
        serverKey,
        salt
      );

      expect(Buffer.from(k1)).not.toEqual(Buffer.from(k2));
    });

    it('should produce different keys with vs without password', async () => {
      const clientKey = PublicShareCrypto.generateClientKey();
      const serverKey = PublicShareCrypto.generateServerShareKey();
      const salt = PublicShareCrypto.generateSalt();

      const withoutPassword = await PublicShareCrypto.deriveWrapKey(clientKey, serverKey, salt);
      const withPassword = await PublicShareCrypto.deriveWrapKey(
        clientKey,
        serverKey,
        salt,
        'secret123'
      );

      expect(Buffer.from(withoutPassword)).not.toEqual(Buffer.from(withPassword));
    });

    it('should produce different keys for different passwords', async () => {
      const clientKey = PublicShareCrypto.generateClientKey();
      const serverKey = PublicShareCrypto.generateServerShareKey();
      const salt = PublicShareCrypto.generateSalt();

      const k1 = await PublicShareCrypto.deriveWrapKey(clientKey, serverKey, salt, 'password1');
      const k2 = await PublicShareCrypto.deriveWrapKey(clientKey, serverKey, salt, 'password2');

      expect(Buffer.from(k1)).not.toEqual(Buffer.from(k2));
    });
  });

  describe('wrapKey / unwrapKey round-trip', () => {
    it('should unwrap what was wrapped', async () => {
      const clientKey = PublicShareCrypto.generateClientKey();
      const serverKey = PublicShareCrypto.generateServerShareKey();
      const salt = PublicShareCrypto.generateSalt();
      const itemKey = randomBytes(32);

      const wrapKey = await PublicShareCrypto.deriveWrapKey(clientKey, serverKey, salt);
      const wrapped = await PublicShareCrypto.wrapKey(itemKey, wrapKey);
      const unwrapped = await PublicShareCrypto.unwrapKey(wrapped, wrapKey);

      expect(Buffer.from(unwrapped)).toEqual(Buffer.from(itemKey));
    });

    it('should fail to unwrap with wrong wrap key', async () => {
      const clientKey = PublicShareCrypto.generateClientKey();
      const serverKey = PublicShareCrypto.generateServerShareKey();
      const salt = PublicShareCrypto.generateSalt();
      const itemKey = randomBytes(32);

      const wrapKey = await PublicShareCrypto.deriveWrapKey(clientKey, serverKey, salt);
      const wrapped = await PublicShareCrypto.wrapKey(itemKey, wrapKey);

      const wrongWrapKey = await PublicShareCrypto.deriveWrapKey(
        PublicShareCrypto.generateClientKey(),
        serverKey,
        salt
      );

      await expect(PublicShareCrypto.unwrapKey(wrapped, wrongWrapKey)).rejects.toThrow();
    });

    it('password-protected share: correct password unwraps, wrong password fails', async () => {
      const clientKey = PublicShareCrypto.generateClientKey();
      const serverKey = PublicShareCrypto.generateServerShareKey();
      const salt = PublicShareCrypto.generateSalt();
      const itemKey = randomBytes(32);
      const password = 'correct-horse-battery-staple';

      const wrapKey = await PublicShareCrypto.deriveWrapKey(clientKey, serverKey, salt, password);
      const wrapped = await PublicShareCrypto.wrapKey(itemKey, wrapKey);

      // Correct password
      const correctWrapKey = await PublicShareCrypto.deriveWrapKey(
        clientKey,
        serverKey,
        salt,
        password
      );
      const unwrapped = await PublicShareCrypto.unwrapKey(wrapped, correctWrapKey);
      expect(Buffer.from(unwrapped)).toEqual(Buffer.from(itemKey));

      // Wrong password
      const wrongWrapKey = await PublicShareCrypto.deriveWrapKey(
        clientKey,
        serverKey,
        salt,
        'wrong-password'
      );
      await expect(PublicShareCrypto.unwrapKey(wrapped, wrongWrapKey)).rejects.toThrow();
    });
  });

  describe('parseShareUrl', () => {
    it('should parse a valid share URL', () => {
      const result = PublicShareCrypto.parseShareUrl(
        'https://app.example.com/public/share/abc123#myClientKey'
      );

      expect(result).toEqual({ shareId: 'abc123', clientKey: 'myClientKey' });
    });

    it('should return null for URL without hash', () => {
      const result = PublicShareCrypto.parseShareUrl('https://app.example.com/public/share/abc123');
      expect(result).toBeNull();
    });

    it('should return null for URL with wrong path', () => {
      const result = PublicShareCrypto.parseShareUrl('https://app.example.com/some/other#key');
      expect(result).toBeNull();
    });

    it('should return null for invalid URL', () => {
      const result = PublicShareCrypto.parseShareUrl('not-a-url');
      expect(result).toBeNull();
    });

    it('should round-trip with buildShareUrl', () => {
      const shareId = 'share-xyz-789';
      const clientKey = PublicShareCrypto.generateClientKey();

      const url = PublicShareCrypto.buildShareUrl(shareId, clientKey, 'https://app.example.com');
      const parsed = PublicShareCrypto.parseShareUrl(url);

      expect(parsed?.shareId).toBe(shareId);
      expect(parsed?.clientKey).toBe(clientKey);
    });
  });
});
