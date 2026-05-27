import { randomBytes } from '@agam-space/core';
import { EncryptedEnvelopeCodec } from '@agam-space/core';
import { XChaChaV1Strategy } from '../../src/crypto/xchacha';
import { decryptFileChunk, decryptFileChunks } from '../../src/file/file-decrypt';

describe('decryptFileChunk', () => {
  const strategy = new XChaChaV1Strategy();
  let fileKey: Uint8Array;

  beforeEach(() => {
    fileKey = randomBytes(32);
  });

  it('should decrypt an encrypted chunk', async () => {
    const plaintext = new TextEncoder().encode('file chunk data');
    const envelope = await strategy.encrypt(plaintext, fileKey);
    const tlvBytes = EncryptedEnvelopeCodec.serializeToTLV(envelope);

    const result = await decryptFileChunk(tlvBytes, fileKey);

    expect(Buffer.from(result)).toEqual(Buffer.from(plaintext));
  });

  it('should decrypt binary chunk data', async () => {
    const plaintext = randomBytes(1024);
    const envelope = await strategy.encrypt(plaintext, fileKey);
    const tlvBytes = EncryptedEnvelopeCodec.serializeToTLV(envelope);

    const result = await decryptFileChunk(tlvBytes, fileKey);

    expect(Buffer.from(result)).toEqual(Buffer.from(plaintext));
  });

  it('should throw on wrong key', async () => {
    const plaintext = new TextEncoder().encode('secret');
    const envelope = await strategy.encrypt(plaintext, fileKey);
    const tlvBytes = EncryptedEnvelopeCodec.serializeToTLV(envelope);
    const wrongKey = randomBytes(32);

    await expect(decryptFileChunk(tlvBytes, wrongKey)).rejects.toThrow();
  });

  it('should throw on tampered chunk bytes', async () => {
    const plaintext = new TextEncoder().encode('secret');
    const envelope = await strategy.encrypt(plaintext, fileKey);
    const tlvBytes = EncryptedEnvelopeCodec.serializeToTLV(envelope);

    // Flip bytes in the ciphertext region (last 32 bytes)
    const tampered = new Uint8Array(tlvBytes);
    for (let i = tampered.length - 10; i < tampered.length; i++) {
      tampered[i] ^= 0xff;
    }

    await expect(decryptFileChunk(tampered, fileKey)).rejects.toThrow();
  });

  it('should throw on completely invalid bytes', async () => {
    const garbage = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00]);
    await expect(decryptFileChunk(garbage, fileKey)).rejects.toThrow();
  });
});

describe('decryptFileChunks', () => {
  const strategy = new XChaChaV1Strategy();

  it('should yield decrypted chunks in order', async () => {
    const fileKey = randomBytes(32);
    const chunks = [
      new TextEncoder().encode('chunk 0'),
      new TextEncoder().encode('chunk 1'),
      new TextEncoder().encode('chunk 2'),
    ];

    const encryptedChunks = await Promise.all(
      chunks.map(async chunk => {
        const envelope = await strategy.encrypt(chunk, fileKey);
        return EncryptedEnvelopeCodec.serializeToTLV(envelope);
      })
    );

    const fetchChunk = jest.fn(async (_fileId: string, index: number) => encryptedChunks[index]);

    const results: Uint8Array[] = [];
    for await (const chunk of decryptFileChunks({
      fileId: 'file-123',
      fileKey,
      totalChunks: 3,
      fetchChunk,
    })) {
      results.push(chunk);
    }

    expect(results).toHaveLength(3);
    results.forEach((result, i) => {
      expect(Buffer.from(result)).toEqual(Buffer.from(chunks[i]));
    });
    expect(fetchChunk).toHaveBeenCalledTimes(3);
    expect(fetchChunk).toHaveBeenNthCalledWith(1, 'file-123', 0);
    expect(fetchChunk).toHaveBeenNthCalledWith(2, 'file-123', 1);
    expect(fetchChunk).toHaveBeenNthCalledWith(3, 'file-123', 2);
  });

  it('should handle single chunk (small file path)', async () => {
    const fileKey = randomBytes(32);
    const plaintext = new TextEncoder().encode('small file');
    const envelope = await strategy.encrypt(plaintext, fileKey);
    const tlvBytes = EncryptedEnvelopeCodec.serializeToTLV(envelope);

    const fetchChunk = jest.fn(async () => tlvBytes);

    const results: Uint8Array[] = [];
    for await (const chunk of decryptFileChunks({
      fileId: 'file-single',
      fileKey,
      totalChunks: 1,
      fetchChunk,
    })) {
      results.push(chunk);
    }

    expect(results).toHaveLength(1);
    expect(Buffer.from(results[0])).toEqual(Buffer.from(plaintext));
  });

  it('should propagate fetch errors', async () => {
    const fileKey = randomBytes(32);
    const fetchChunk = jest.fn(async () => {
      throw new Error('network error');
    });

    const gen = decryptFileChunks({ fileId: 'file-err', fileKey, totalChunks: 1, fetchChunk });
    await expect(gen.next()).rejects.toThrow('network error');
  });
});
