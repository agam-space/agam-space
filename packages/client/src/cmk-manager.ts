import {
  decodeBase58,
  encodeBase58,
  EncryptedEnvelopeCodec,
  IdentityKeyManager,
  toBase64,
  randomBytes,
} from '@agam-space/core';

import { ARGON2ID_PRESETS, Argon2idOptions, deriveKeyFromSecret } from './crypto/argon2';
import { EncryptionRegistry, EncryptionStrategy } from './encryption/encryption-strategy';

export interface BootstrapResult {
  masterKey: Uint8Array;
  recoveryKey: string;
  encCmkWithPassword: string;
  encCmkWithRecovery: string;
  encRecoveryWithCmk: string;
  identityPublicKey: string;
  identityEncPubKey: string;
  encIdentitySeed: string;
  kdfOptions: {
    type: string;
    salt: string;
    params: Argon2idOptions;
  };
}

export class CmkManager {
  get encryptionStrategy(): EncryptionStrategy {
    return EncryptionRegistry.get();
  }

  /* Bootstrap a Content Master Key (CMK) using a password.
   * This method generates a random CMK, derives keys from the provided password,
   * and encrypts the CMK with both the password key and a recovery key.
   *
   * @param password - The master password used to derive the encryption keys.
   * @returns A promise that resolves to a BootstrapResult containing the CMK,
   * recovery key, encrypted CMK with password, encrypted CMK with recovery,
   * encrypted recovery key with CMK, and KDF options.
   */
  async bootstrapCmkWithPassword(password: string): Promise<BootstrapResult> {
    const salt = randomBytes(16);
    const kdfOptions = {
      type: 'argon2id',
      salt: Buffer.from(salt).toString('base64'),
      params: ARGON2ID_PRESETS.v1,
    };

    const recoveryKey = randomBytes(32);
    const masterKey = randomBytes(32);
    const identitySeed = IdentityKeyManager.generateIdentitySeed();
    const identityKeys = await IdentityKeyManager.generateIdentityKeys(identitySeed);

    const [encCmkWithPassword, encCmkWithRecovery, encRecoveryWithCmk, encIdentitySeed] =
      await Promise.all([
        this.encryptCmkWithPassword(masterKey, password, salt),
        this.encryptCmkWithRecovery(masterKey, recoveryKey),
        this.encryptRecoveryWithCmk(recoveryKey, masterKey),
        this.encryptIdentitySeedWithCmk(identitySeed, masterKey),
      ]);

    return {
      masterKey,
      recoveryKey: encodeBase58(recoveryKey),
      encCmkWithPassword,
      encCmkWithRecovery,
      encRecoveryWithCmk,
      identityPublicKey: toBase64(identityKeys.signKey.publicKey),
      identityEncPubKey: toBase64(identityKeys.encKey.publicKey),
      encIdentitySeed,
      kdfOptions,
    };
  }

  async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array | string
  ): Promise<{ key: Uint8Array; params: Argon2idOptions }> {
    return deriveKeyFromSecret(new TextEncoder().encode(password), this.getBufferFromBase64(salt));
  }

  async decryptCmkWithPassword(
    encCmk: string,
    password: string,
    salt: string
  ): Promise<Uint8Array> {
    const { key } = await this.deriveKeyFromPassword(password, salt);
    const envelope = EncryptedEnvelopeCodec.deserialize(encCmk);
    return this.encryptionStrategy.decrypt(envelope, key);
  }

  async decryptRecoveryWithCmk(encRecovery: string, cmk: Uint8Array): Promise<Uint8Array> {
    const envelope = EncryptedEnvelopeCodec.deserialize(encRecovery);
    return this.encryptionStrategy.decrypt(envelope, cmk);
  }

  async decryptIdentitySeedWithCmk(encIdentitySeed: string, cmk: Uint8Array): Promise<Uint8Array> {
    const envelope = EncryptedEnvelopeCodec.deserialize(encIdentitySeed);
    return this.encryptionStrategy.decrypt(envelope, cmk);
  }

  async decryptCmkWithRecoveryKey(
    encCmkWithRecovery: string,
    recoveryKey: string | Uint8Array
  ): Promise<Uint8Array> {
    try {
      const recoveryKeyBuffer =
        typeof recoveryKey === 'string' ? decodeBase58(recoveryKey) : recoveryKey;

      const envelope = EncryptedEnvelopeCodec.deserialize(encCmkWithRecovery);
      return this.encryptionStrategy.decrypt(envelope, recoveryKeyBuffer);
    } catch (e) {
      console.error('Failed to decrypt CMK with recovery key:', e);
      throw new Error(`Invalid recovery key or decryption failed: ${(e as Error).message}`, {
        cause: e,
      });
    }
  }

  //TODO add kdfParams to the envelope
  async encryptCmkWithPassword(
    cmk: Uint8Array,
    password: string,
    salt: string | Uint8Array
  ): Promise<string> {
    const { key: passwordKey } = await this.deriveKeyFromPassword(password, salt);
    const encCMKEnvelope = await this.encryptionStrategy.encrypt(cmk, passwordKey);
    return EncryptedEnvelopeCodec.serialize(encCMKEnvelope);
  }

  async encryptRecoveryWithCmk(recoveryKey: Uint8Array, cmk: Uint8Array): Promise<string> {
    const encRecoveryEnvelope = await this.encryptionStrategy.encrypt(recoveryKey, cmk);
    return EncryptedEnvelopeCodec.serialize(encRecoveryEnvelope);
  }

  async encryptCmkWithRecovery(cmk: Uint8Array, recoveryKey: string | Uint8Array): Promise<string> {
    const recoveryKeyBuffer =
      typeof recoveryKey === 'string' ? decodeBase58(recoveryKey) : recoveryKey;
    const envelope = await this.encryptionStrategy.encrypt(cmk, recoveryKeyBuffer);
    return EncryptedEnvelopeCodec.serialize(envelope);
  }

  async encryptIdentitySeedWithCmk(identitySeed: Uint8Array, cmk: Uint8Array): Promise<string> {
    const encSeedEnvelope = await this.encryptionStrategy.encrypt(identitySeed, cmk);
    return EncryptedEnvelopeCodec.serialize(encSeedEnvelope);
  }

  async encryptAndEncode(data: Uint8Array, key: Uint8Array): Promise<string> {
    const envelope = await this.encryptionStrategy.encrypt(data, key);
    return EncryptedEnvelopeCodec.serialize(envelope);
  }

  async decodeAndDecrypt(data: string, key: Uint8Array): Promise<Uint8Array> {
    const envelope = EncryptedEnvelopeCodec.deserialize(data);
    return this.encryptionStrategy.decrypt(envelope, key);
  }

  getBufferFromBase64(data: string | Uint8Array): Buffer {
    if (data instanceof Uint8Array) {
      return Buffer.from(data);
    } else {
      return Buffer.from(data, 'base64');
    }
  }
}
