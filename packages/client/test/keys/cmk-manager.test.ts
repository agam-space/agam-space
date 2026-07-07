import { CmkManager } from '../../src/keys/cmk-manager';
import { encodeBase58, EncryptedEnvelopeCodec } from '@agam-space/core';

const TEST_PASSWORD = 'TestPassword123!';

describe('CmkManager', () => {
  let cmkManager: CmkManager;

  beforeEach(() => {
    cmkManager = new CmkManager();
  });

  it('should bootstrap CMK with password', async () => {
    const result = await cmkManager.bootstrapCmkWithPassword(TEST_PASSWORD);
    expect(result.masterKey).toBeInstanceOf(Uint8Array);
    expect(result.masterKey.length).toBe(32);

    expect(typeof result.recoveryKey).toBe('string'); // base58 encoded
    expect(result.recoveryKey.length).toBeGreaterThan(0);

    expect(typeof result.identityPublicKey).toBe('string'); // base64 encoded (Ed25519)
    expect(result.identityPublicKey.length).toBeGreaterThan(0);

    expect(typeof result.identityEncPubKey).toBe('string'); // base64 encoded (X25519)
    expect(result.identityEncPubKey.length).toBeGreaterThan(0);

    expect(typeof result.encCmkWithPassword).toBe('string');
    expect(typeof result.encCmkWithRecovery).toBe('string');
    expect(typeof result.encRecoveryWithCmk).toBe('string');
    expect(typeof result.encIdentitySeed).toBe('string');

    expect(result.kdfOptions.salt).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64 encoded salt
    expect(result.kdfOptions.params).toMatchObject({
      opslimit: 3,
      memlimit: 65_536,
      hashLength: 32,
    });

    verifyEncryptedContent(result.encCmkWithPassword);
    verifyEncryptedContent(result.encCmkWithRecovery);
    verifyEncryptedContent(result.encRecoveryWithCmk);
    verifyEncryptedContent(result.encIdentitySeed);

    // Verify identity keys are different
    expect(result.identityPublicKey).not.toEqual(result.identityEncPubKey);
  });

  // it('should throw error for invalid envelope format', async () => {
  //   const salt = Buffer.from(randomBytes(16)).toString('base64');
  //   await expect(
  //     cmkManager.decryptCmkWithPassword(
  //       'invalid-envelope',
  //       new TextEncoder().encode(TEST_PASSWORD),
  //       salt
  //     )
  //   ).rejects.toThrow('Invalid envelope format');
  // });

  it('should decrypt CMK with master password or recovery key', async () => {
    const result = await cmkManager.bootstrapCmkWithPassword(TEST_PASSWORD);

    const decryptedCmk = await cmkManager.decryptCmkWithPassword(
      result.encCmkWithPassword,
      TEST_PASSWORD,
      result.kdfOptions.salt
    );
    expect(Buffer.from(decryptedCmk).equals(result.masterKey)).toBe(true);

    const decryptedCmkWithRecovery = await cmkManager.decryptCmkWithRecoveryKey(
      result.encCmkWithRecovery,
      result.recoveryKey
    );
    expect(Buffer.from(decryptedCmkWithRecovery).equals(result.masterKey)).toBe(true);

    const decryptedRecovery = await cmkManager.decryptRecoveryWithCmk(
      result.encRecoveryWithCmk,
      result.masterKey
    );

    expect(encodeBase58(decryptedRecovery)).toStrictEqual(result.recoveryKey);
  });

  it('should decrypt recovery key with CMK', async () => {
    const result = await cmkManager.bootstrapCmkWithPassword(TEST_PASSWORD);
    const decryptedRecovery = await cmkManager.decryptRecoveryWithCmk(
      result.encRecoveryWithCmk,
      result.masterKey
    );

    expect(encodeBase58(decryptedRecovery)).toStrictEqual(result.recoveryKey);
  });
});

function verifyEncryptedContent(content: string) {
  expect(typeof content).toBe('string');
  expect(content.length).toBeGreaterThan(0);

  const envelope = EncryptedEnvelopeCodec.deserialize(content);
  expect(envelope).toBeDefined();
}
