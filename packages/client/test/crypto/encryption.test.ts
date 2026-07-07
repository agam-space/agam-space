import { randomBytes } from '@agam-space/core';
import { EncryptedEnvelopeCodec } from '@agam-space/core';
import { XChaChaV1Strategy } from '../../src/crypto/xchacha';
import { decryptEnvelope } from '../../src/crypto/encryption';

describe('decryptEnvelope', () => {
  const strategy = new XChaChaV1Strategy();
  let key: Uint8Array;
  let plaintext: Uint8Array;

  beforeEach(() => {
    key = randomBytes(32);
    plaintext = new TextEncoder().encode('hello encrypted world');
  });

  it('should decrypt what was encrypted', async () => {
    const envelope = await strategy.encrypt(plaintext, key);
    const serialized = EncryptedEnvelopeCodec.serialize(envelope);

    const result = await decryptEnvelope(serialized, key);

    expect(Buffer.from(result)).toEqual(Buffer.from(plaintext));
  });

  it('should reject on wrong key', async () => {
    const envelope = await strategy.encrypt(plaintext, key);
    const serialized = EncryptedEnvelopeCodec.serialize(envelope);
    const wrongKey = randomBytes(32);

    await expect(decryptEnvelope(serialized, wrongKey)).rejects.toThrow();
  });

  it('should reject on tampered ciphertext', async () => {
    const envelope = await strategy.encrypt(plaintext, key);
    const tampered = { ...envelope, c: new Uint8Array(envelope.c.length).fill(0xff) };
    const serialized = EncryptedEnvelopeCodec.serialize(tampered);

    await expect(decryptEnvelope(serialized, key)).rejects.toThrow();
  });

  it('should throw DecryptionError on malformed envelope string', async () => {
    await expect(decryptEnvelope('not-a-valid-envelope', key)).rejects.toThrow('Failed to decrypt');
  });
});
