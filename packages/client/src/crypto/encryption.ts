import { EncryptedEnvelopeCodec, fromUtf8Bytes, toUtf8Bytes } from '@agam-space/core';
import { EncryptionRegistry } from './encryption-strategy';
import { DecryptionError } from '../errors';

/**
 * Encrypt raw bytes (a key, a metadata payload, etc.) and serialize the result
 * to the envelope string format stored/transmitted by the API.
 */
export async function encryptEnvelope(data: Uint8Array, key: Uint8Array): Promise<string> {
  const envelope = await EncryptionRegistry.get().encrypt(data, key);
  return EncryptedEnvelopeCodec.serialize(envelope);
}

/**
 * Deserialize an envelope string and decrypt it back to raw bytes.
 * Used both for unwrapping keys (file/folder keys wrapped with a parent key)
 * and for decrypting arbitrary encrypted payloads.
 */
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

/**
 * Serialize a value to JSON, encrypt it, and return the envelope string.
 * Shared by all file/folder metadata encryption call sites.
 */
export async function encryptJsonEnvelope<T>(data: T, key: Uint8Array): Promise<string> {
  return encryptEnvelope(toUtf8Bytes(JSON.stringify(data)), key);
}

/**
 * Decrypt an envelope string and parse the resulting bytes as JSON.
 * Shared by all file/folder metadata decryption call sites.
 */
export async function decryptJsonEnvelope<T>(dataEncrypted: string, key: Uint8Array): Promise<T> {
  const bytes = await decryptEnvelope(dataEncrypted, key);
  return JSON.parse(fromUtf8Bytes(bytes)) as T;
}
