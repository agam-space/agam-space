import { EncryptionRegistry } from '../crypto/encryption-strategy';
import { encryptEnvelope, encryptJsonEnvelope } from '../crypto/encryption';
import { EncryptedEnvelopeCodec, randomBytes } from '@agam-space/core';

import { blake3 } from '@noble/hashes/blake3';
import { bytesToHex } from '@noble/hashes/utils';
import { UserFileMetadata } from '@agam-space/shared-types';
import { getDecryptedFolderKey } from '../folders/folder-contents';
import { hashFileName } from './file-operations';

export class FileManager {
  /**
   * Generate a random 256-bit file encryption key (FEK)
   */
  private generateFileKey(): Uint8Array {
    return randomBytes(32);
  }

  async prepareNewFileUpload(metadata: UserFileMetadata, parentId: string | null) {
    const fileKey = this.generateFileKey();

    const parentKey = await getDecryptedFolderKey(parentId);

    const nameHash = hashFileName(metadata.name);

    const [metadataEncrypted, fkWrapped] = await Promise.all([
      encryptJsonEnvelope(metadata, fileKey),
      encryptEnvelope(fileKey, parentKey),
    ]);

    return {
      nameHash,
      metadataEncrypted,
      fkWrapped,
      fileKey,
    };
  }

  /**
   * Encrypt a chunk of data using the file encryption key
   */
  async encryptChunk(
    chunk: Uint8Array,
    fileKey: Uint8Array,
    fileHasher?: ReturnType<typeof blake3.create>
  ): Promise<{
    encChunk: Uint8Array;
    checksum: string;
  }> {
    const envelope = await EncryptionRegistry.get().encrypt(chunk, fileKey);
    const encChunk = EncryptedEnvelopeCodec.serializeToTLV(envelope);

    const checksum = bytesToHex(blake3.create().update(encChunk).digest());

    if (fileHasher) {
      fileHasher.update(encChunk);
    }

    return {
      encChunk,
      checksum,
    };
  }
}
