import { randomBytes } from '@agam-space/core';
import { encryptFileMetadata, hashFileName } from '../../src/file/file-operations';
import { decryptFileMetadata } from '../../src/file/file-decrypt';
import { UserFileMetadata } from '@agam-space/shared-types';

describe('hashFileName', () => {
  it('should return a hex string', () => {
    const hash = hashFileName('report.pdf');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should be deterministic', () => {
    expect(hashFileName('photo.jpg')).toBe(hashFileName('photo.jpg'));
  });

  it('should produce different hashes for different names', () => {
    expect(hashFileName('a.txt')).not.toBe(hashFileName('b.txt'));
  });

  it('should trim whitespace before hashing', () => {
    expect(hashFileName('  report.pdf  ')).toBe(hashFileName('report.pdf'));
  });
});

describe('encryptFileMetadata / decryptFileMetadata round-trip', () => {
  const metadata: UserFileMetadata = {
    name: 'confidential.pdf',
    mimeType: 'application/pdf',
    size: 204800,
  };

  it('should encrypt and decrypt metadata back to original', async () => {
    const key = randomBytes(32);

    const encrypted = await encryptFileMetadata(metadata, key);
    const decrypted = await decryptFileMetadata(encrypted, key);

    expect(decrypted.name).toBe(metadata.name);
    expect(decrypted.mimeType).toBe(metadata.mimeType);
  });

  it('should produce different ciphertext on each call (random nonce)', async () => {
    const key = randomBytes(32);

    const enc1 = await encryptFileMetadata(metadata, key);
    const enc2 = await encryptFileMetadata(metadata, key);

    expect(enc1).not.toBe(enc2);
  });

  it('should fail to decrypt with wrong key', async () => {
    const key = randomBytes(32);
    const wrongKey = randomBytes(32);

    const encrypted = await encryptFileMetadata(metadata, key);

    await expect(decryptFileMetadata(encrypted, wrongKey)).rejects.toThrow();
  });

  it('should fail to decrypt tampered ciphertext', async () => {
    const key = randomBytes(32);
    const encrypted = await encryptFileMetadata(metadata, key);

    const tampered = encrypted.slice(0, -8) + 'AAAAAAAA';

    await expect(decryptFileMetadata(tampered, key)).rejects.toThrow();
  });
});
