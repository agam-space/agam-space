import { getSodium, IdentityKeyManager } from '../src';
import { randomBytes } from 'crypto';

describe('IdentityKeyManager', () => {
  beforeAll(async () => {
    await getSodium();
  });

  it('should generate a random identity seed', () => {
    const seed1 = IdentityKeyManager.generateIdentitySeed();
    const seed2 = IdentityKeyManager.generateIdentitySeed();

    expect(seed1).toBeInstanceOf(Uint8Array);
    expect(seed1.length).toBe(32);
    expect(seed1).not.toEqual(seed2);
  });

  it('should generate both sign and encryption keys from a seed', async () => {
    const seed = IdentityKeyManager.generateIdentitySeed();

    const identityKeys = await IdentityKeyManager.generateIdentityKeys(seed);

    expect(identityKeys.signKey.publicKey).toBeInstanceOf(Uint8Array);
    expect(identityKeys.signKey.privateKey).toBeInstanceOf(Uint8Array);
    expect(identityKeys.encKey.publicKey).toBeInstanceOf(Uint8Array);
    expect(identityKeys.encKey.privateKey).toBeInstanceOf(Uint8Array);

    expect(identityKeys.signKey.publicKey.length).toBe(32);
    expect(identityKeys.signKey.privateKey.length).toBe(64);

    expect(identityKeys.encKey.publicKey.length).toBe(32);
    expect(identityKeys.encKey.privateKey.length).toBe(32);

    expect(identityKeys.signKey.publicKey).not.toEqual(identityKeys.encKey.publicKey);
    expect(identityKeys.signKey.privateKey).not.toEqual(identityKeys.encKey.privateKey);
  });

  it('should generate the same keys for the same seed', async () => {
    const seed = IdentityKeyManager.generateIdentitySeed();
    const keys1 = await IdentityKeyManager.generateIdentityKeys(seed);
    const keys2 = await IdentityKeyManager.generateIdentityKeys(seed);

    expect(keys1.signKey.publicKey).toEqual(keys2.signKey.publicKey);
    expect(keys1.signKey.privateKey).toEqual(keys2.signKey.privateKey);
    expect(keys1.encKey.publicKey).toEqual(keys2.encKey.publicKey);
    expect(keys1.encKey.privateKey).toEqual(keys2.encKey.privateKey);
  });

  it('should generate different keys for different seeds', async () => {
    const seed1 = IdentityKeyManager.generateIdentitySeed();
    const seed2 = IdentityKeyManager.generateIdentitySeed();
    const keys1 = await IdentityKeyManager.generateIdentityKeys(seed1);
    const keys2 = await IdentityKeyManager.generateIdentityKeys(seed2);

    expect(keys1.signKey.publicKey).not.toEqual(keys2.signKey.publicKey);
    expect(keys1.encKey.publicKey).not.toEqual(keys2.encKey.publicKey);
  });

  it('should sign and verify a message', async () => {
    const seed = IdentityKeyManager.generateIdentitySeed();
    const identityKeys = await IdentityKeyManager.generateIdentityKeys(seed);

    const message = Buffer.from('Hello, world!');
    const signature = await IdentityKeyManager.sign(message, identityKeys.signKey.privateKey);

    const isValid = await IdentityKeyManager.verify(
      message,
      signature,
      identityKeys.signKey.publicKey
    );
    expect(isValid).toBe(true);
  });

  it('should fail to verify with an invalid signature', async () => {
    const seed = IdentityKeyManager.generateIdentitySeed();
    const identityKeys = await IdentityKeyManager.generateIdentityKeys(seed);

    const message = Buffer.from('Hello, world!');
    const invalidSignature = randomBytes(64);

    const isValid = await IdentityKeyManager.verify(
      message,
      invalidSignature,
      identityKeys.signKey.publicKey
    );
    expect(isValid).toBe(false);
  });

  it('should fail to verify with a different public key', async () => {
    const seed1 = IdentityKeyManager.generateIdentitySeed();
    const seed2 = IdentityKeyManager.generateIdentitySeed();
    const keys1 = await IdentityKeyManager.generateIdentityKeys(seed1);
    const keys2 = await IdentityKeyManager.generateIdentityKeys(seed2);

    const message = Buffer.from('Hello, world!');
    const signature = await IdentityKeyManager.sign(message, keys1.signKey.privateKey);

    const isValid = await IdentityKeyManager.verify(message, signature, keys2.signKey.publicKey);
    expect(isValid).toBe(false);
  });

  it('should generate a legacy Ed25519 keypair from CMK (generateIdentityKeyPairWithCmk)', async () => {
    const cmk = randomBytes(32);
    const keypair = await IdentityKeyManager.generateIdentityKeyPairWithCmk(cmk);

    expect(keypair.publicKey).toBeInstanceOf(Uint8Array);
    expect(keypair.privateKey).toBeInstanceOf(Uint8Array);
    // Ed25519: public key 32 bytes, private key 64 bytes
    expect(keypair.publicKey.length).toBe(32);
    expect(keypair.privateKey.length).toBe(64);
  });

  it('should derive the same legacy keypair deterministically from the same CMK', async () => {
    const cmk = randomBytes(32);
    const keypair1 = await IdentityKeyManager.generateIdentityKeyPairWithCmk(cmk);
    const keypair2 = await IdentityKeyManager.generateIdentityKeyPairWithCmk(cmk);

    expect(keypair1.publicKey).toEqual(keypair2.publicKey);
    expect(keypair1.privateKey).toEqual(keypair2.privateKey);
  });

  it('should derive different legacy keypairs from different CMKs', async () => {
    const cmk1 = randomBytes(32);
    const cmk2 = randomBytes(32);
    const keypair1 = await IdentityKeyManager.generateIdentityKeyPairWithCmk(cmk1);
    const keypair2 = await IdentityKeyManager.generateIdentityKeyPairWithCmk(cmk2);

    expect(keypair1.publicKey).not.toEqual(keypair2.publicKey);
  });
});
