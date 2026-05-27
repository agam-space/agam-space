import { EncryptedEnvelopeCodec } from '@agam-space/core';
import { EncryptionRegistry } from './encryption-strategy';
import { DecryptionError } from '../errors';

export async function decryptEnvelope(dataEncrypted: string, key: Uint8Array): Promise<Uint8Array> {
  try {
    const envelope = EncryptedEnvelopeCodec.deserialize(dataEncrypted);
    return await EncryptionRegistry.get().decrypt(envelope, key);
  } catch (e) {
    console.error('Failed to decrypt envelope:', e);
    throw new DecryptionError(
      `Failed to decrypt envelope: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
