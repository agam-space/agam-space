import { randomBytes, randomString } from '@agam-space/core';
import { toBase64 } from '@agam-space/core';
import { EncryptedEnvelopeCodec, fromBase64, fromBase64Url, toUtf8Bytes } from '@agam-space/core';
import { Argon2idVersion, deriveKeyFromSecret } from '../crypto/argon2';
import { EncryptionRegistry } from '../crypto/encryption-strategy';

export class PublicShareCrypto {
  static generateClientKey(): string {
    return randomString(32);
  }

  static generateServerShareKey(): string {
    return toBase64(randomBytes(32));
  }

  static generateSalt(): string {
    return toBase64(randomBytes(16));
  }

  /**
   * Derive a wrapping key from client key, server key, and optional password
   * Single Argon2id derivation with unique salt per share
   */
  static async deriveWrapKey(
    clientKey: string,
    serverShareKey: string,
    salt: string,
    password?: string
  ): Promise<Uint8Array> {
    const clientKeyBytes = fromBase64Url(clientKey);
    const serverKeyBytes = fromBase64(serverShareKey);

    const passwordBytes = password ? toUtf8Bytes(password) : new Uint8Array(0);
    const combinedSecret = new Uint8Array(
      clientKeyBytes.length + serverKeyBytes.length + passwordBytes.length
    );
    combinedSecret.set(clientKeyBytes, 0);
    combinedSecret.set(serverKeyBytes, clientKeyBytes.length);
    if (passwordBytes.length > 0) {
      combinedSecret.set(passwordBytes, clientKeyBytes.length + serverKeyBytes.length);
    }

    const { key: wrapKey } = await deriveKeyFromSecret(
      combinedSecret,
      fromBase64(salt),
      Argon2idVersion.v1
    );

    return wrapKey;
  }

  static async wrapKey(itemKey: Uint8Array, wrapKey: Uint8Array): Promise<string> {
    const key = await EncryptionRegistry.get().encrypt(itemKey, wrapKey);
    return EncryptedEnvelopeCodec.serialize(key);
  }

  static async unwrapKey(wrappedKey: string, wrapKey: Uint8Array): Promise<Uint8Array> {
    const encryptedEnvelope = EncryptedEnvelopeCodec.deserialize(wrappedKey);
    return EncryptionRegistry.get().decrypt(encryptedEnvelope, wrapKey);
  }

  static buildShareUrl(shareId: string, clientKey: string, baseUrl?: string): string {
    const base = baseUrl || window.location.origin;
    return `${base}/public/share/${shareId}#${clientKey}`;
  }

  static parseShareUrl(url: string): { shareId: string; clientKey: string } | null {
    try {
      const urlObj = new URL(url);
      const pathMatch = urlObj.pathname.match(/\/public\/share\/([^/]+)/);
      const shareId = pathMatch?.[1];
      const clientKey = urlObj.hash.substring(1); // Remove # prefix

      if (shareId && clientKey) {
        return { shareId, clientKey };
      }
    } catch (_e) {
      // Invalid URL
    }
    return null;
  }
}
