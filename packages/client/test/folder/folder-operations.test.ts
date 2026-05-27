import { randomBytes } from '@agam-space/core';
import { encryptFolderMetadata, hashFolderName } from '../../src/folder/folder-operations';
import { decryptFolderMetadata } from '../../src/folder/folder-contents';
import { FolderMetadata } from '@agam-space/shared-types';

describe('hashFolderName', () => {
  it('should return a hex string', () => {
    const hash = hashFolderName('Documents');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should be deterministic', () => {
    expect(hashFolderName('Photos')).toBe(hashFolderName('Photos'));
  });

  it('should produce different hashes for different names', () => {
    expect(hashFolderName('Photos')).not.toBe(hashFolderName('Videos'));
  });

  it('should trim whitespace before hashing', () => {
    expect(hashFolderName('  Photos  ')).toBe(hashFolderName('Photos'));
  });
});

describe('encryptFolderMetadata / decryptFolderMetadata round-trip', () => {
  const metadata: FolderMetadata = {
    name: 'My Secure Folder',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('should encrypt and decrypt metadata back to original', async () => {
    const key = randomBytes(32);

    const encrypted = await encryptFolderMetadata(metadata, key);
    const decrypted = await decryptFolderMetadata(encrypted, key);

    expect(decrypted.name).toBe(metadata.name);
    expect(decrypted.createdAt).toBe(metadata.createdAt);
  });

  it('should produce different ciphertext each time (random nonce)', async () => {
    const key = randomBytes(32);

    const enc1 = await encryptFolderMetadata(metadata, key);
    const enc2 = await encryptFolderMetadata(metadata, key);

    expect(enc1).not.toBe(enc2);
  });

  it('should fail to decrypt with wrong key', async () => {
    const key = randomBytes(32);
    const wrongKey = randomBytes(32);

    const encrypted = await encryptFolderMetadata(metadata, key);

    await expect(decryptFolderMetadata(encrypted, wrongKey)).rejects.toThrow();
  });

  it('should fail to decrypt tampered ciphertext', async () => {
    const key = randomBytes(32);
    const encrypted = await encryptFolderMetadata(metadata, key);

    // Corrupt the end of the base64 string
    const tampered = encrypted.slice(0, -8) + 'AAAAAAAA';

    await expect(decryptFolderMetadata(tampered, key)).rejects.toThrow();
  });
});
