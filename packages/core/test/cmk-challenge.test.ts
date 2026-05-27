import { randomBytes } from 'crypto';
import { generateCmkChallenge, getSodium, verifyCmkChallenge } from '../src';
import { IdentityKeyManager } from '../src';

describe('cmkChallenge', () => {
  beforeAll(async () => {
    await getSodium();
  });

  describe('generateCmkChallenge', () => {
    it('should generate a valid challenge signature for a user', async () => {
      const payload = { userId: 'test-user' };
      const seed = IdentityKeyManager.generateIdentitySeed();
      const identityKeys = await IdentityKeyManager.generateIdentityKeys(seed);
      const { timestamp, signature } = await generateCmkChallenge(
        payload,
        identityKeys.signKey.privateKey
      );
      expect(timestamp).toBeGreaterThan(Date.now() - 1000);
      expect(signature).toMatch(/^[A-Za-z0-9+/]+={0,2}$/); // Base64 format
      expect(signature.length).toBeGreaterThan(44);
    });

    it('should use custom signFunction when provided', async () => {
      const payload = { userId: 'test-user' };
      const seed = IdentityKeyManager.generateIdentitySeed();
      const identityKeys = await IdentityKeyManager.generateIdentityKeys(seed);

      const customSign = jest.fn(async (message: Uint8Array) =>
        IdentityKeyManager.sign(message, identityKeys.signKey.privateKey)
      );

      const { timestamp, signature } = await generateCmkChallenge(
        payload,
        new Uint8Array(32), // key arg ignored when signFunction provided
        customSign
      );

      expect(customSign).toHaveBeenCalledTimes(1);
      // Signature produced by custom function should still verify correctly
      await expect(
        verifyCmkChallenge(
          payload,
          signature,
          Buffer.from(identityKeys.signKey.publicKey).toString('base64'),
          timestamp,
          30000
        )
      ).resolves.toBeUndefined();
    });
  });

  describe('verifyCmkChallenge', () => {
    it('should verify a valid challenge signature', async () => {
      const payload = { userId: 'test-user' };
      const seed = IdentityKeyManager.generateIdentitySeed();
      const identityKeys = await IdentityKeyManager.generateIdentityKeys(seed);
      const { timestamp, signature } = await generateCmkChallenge(
        payload,
        identityKeys.signKey.privateKey
      );

      await verifyCmkChallenge(
        payload,
        signature,
        Buffer.from(identityKeys.signKey.publicKey).toString('base64'),
        timestamp,
        30000 // 30 seconds max age
      );
    });

    it('should throw an error for an invalid signature', async () => {
      const payload = { userId: 'test-user' };
      const seed = IdentityKeyManager.generateIdentitySeed();
      const identityKeys = await IdentityKeyManager.generateIdentityKeys(seed);
      const { timestamp } = await generateCmkChallenge(payload, identityKeys.signKey.privateKey);

      await expect(
        verifyCmkChallenge(
          payload,
          Buffer.from(randomBytes(44)).toString('base64'),
          Buffer.from(identityKeys.signKey.publicKey).toString('base64'),
          timestamp,
          30000 // 30 seconds max age
        )
      ).rejects.toThrow('Invalid signature. Cannot verify key possession');
    });

    it('should throw an error for an expired challenge', async () => {
      const payload = { userId: 'test-user' };
      const seed = IdentityKeyManager.generateIdentitySeed();
      const identityKeys = await IdentityKeyManager.generateIdentityKeys(seed);
      const { timestamp, signature } = await generateCmkChallenge(
        payload,
        identityKeys.signKey.privateKey
      );

      await expect(
        verifyCmkChallenge(
          payload,
          signature,
          Buffer.from(identityKeys.signKey.publicKey).toString('base64'),
          timestamp - 60000, // 1 minute ago
          30000 // 30 seconds max age
        )
      ).rejects.toThrow('Challenge timestamp too old. Please retry with current timestamp.');
    });

    it('should throw an error for a future challenge', async () => {
      const payload = { userId: 'test-user' };
      const seed = IdentityKeyManager.generateIdentitySeed();
      const identityKeys = await IdentityKeyManager.generateIdentityKeys(seed);
      const { signature } = await generateCmkChallenge(payload, identityKeys.signKey.privateKey);

      await expect(
        verifyCmkChallenge(
          payload,
          signature,
          Buffer.from(identityKeys.signKey.publicKey).toString('base64'),
          Date.now() + 60000, // 1 minute in the future
          30000 // 30 seconds max age
        )
      ).rejects.toThrow('Challenge timestamp too far in the future.');
    });

    it('should throw an error for a mismatched userId', async () => {
      const payload = { userId: 'test-user' };
      const seed = IdentityKeyManager.generateIdentitySeed();
      const identityKeys = await IdentityKeyManager.generateIdentityKeys(seed);
      const { timestamp, signature } = await generateCmkChallenge(
        payload,
        identityKeys.signKey.privateKey
      );

      await expect(
        verifyCmkChallenge(
          { userId: 'another-user' },
          signature,
          Buffer.from(identityKeys.signKey.publicKey).toString('base64'),
          timestamp,
          30000 // 30 seconds max age
        )
      ).rejects.toThrow('Invalid signature. Cannot verify key possession');
    });

    it('should throw an error for a mismatched public key', async () => {
      const payload = { userId: 'test-user' };
      const seed1 = IdentityKeyManager.generateIdentitySeed();
      const seed2 = IdentityKeyManager.generateIdentitySeed();
      const identityKeys1 = await IdentityKeyManager.generateIdentityKeys(seed1);
      const identityKeys2 = await IdentityKeyManager.generateIdentityKeys(seed2);
      const { timestamp, signature } = await generateCmkChallenge(
        payload,
        identityKeys1.signKey.privateKey
      );

      await expect(
        verifyCmkChallenge(
          payload,
          signature,
          Buffer.from(identityKeys2.signKey.publicKey).toString('base64'),
          timestamp,
          30000 // 30 seconds max age
        )
      ).rejects.toThrow('Invalid signature. Cannot verify key possession');
    });

    it('should handle edge case of zero timestamp', async () => {
      const payload = { userId: 'test-user' };
      const seed = IdentityKeyManager.generateIdentitySeed();
      const identityKeys = await IdentityKeyManager.generateIdentityKeys(seed);
      const { signature } = await generateCmkChallenge(payload, identityKeys.signKey.privateKey);

      await expect(
        verifyCmkChallenge(
          payload,
          signature,
          Buffer.from(identityKeys.signKey.publicKey).toString('base64'),
          0, // Zero timestamp
          30000 // 30 seconds max age
        )
      ).rejects.toThrow('Invalid timestamp. Must be a positive integer.');
    });
  });
});
