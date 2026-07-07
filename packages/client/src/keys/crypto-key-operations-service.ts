import { IdentityKeyManager } from '@agam-space/core';
import { CmkManager } from './cmk-manager';
import { KeyManager } from './key-manager';

/**
 * Interface for cryptographic key operations
 */
export interface ICryptoKeyOperationsService {
  initKeys(keys: { cmk: Uint8Array; encIdentitySeed?: string }): Promise<void>;
  signWithIdentity(message: Uint8Array): Promise<Uint8Array>;
  clearAll(): void;
  isInitialized(): boolean;
  getCMK(): Promise<Uint8Array | null>;
  encryptAndEncodeWithCmk(plaintext: Uint8Array): Promise<string>;
  decodeAndDecryptWithCmk(ciphertext: string): Promise<Uint8Array>;
  getIdentitySignPubKey(): Promise<Uint8Array | null>;
}

/**
 * Default implementation using KeyManager
 */
export class CryptoKeyOperationsService implements ICryptoKeyOperationsService {
  private readonly cmkManager = new CmkManager();
  private readonly keyManager = new KeyManager();
  private initialized = false;

  async initKeys(keys: { cmk: Uint8Array; encIdentitySeed?: string }): Promise<void> {
    this.keyManager.setCMK(keys.cmk);

    if (keys.encIdentitySeed) {
      const identitySeed = await this.cmkManager.decryptIdentitySeedWithCmk(
        keys.encIdentitySeed,
        keys.cmk
      );
      const identityKeys = await IdentityKeyManager.generateIdentityKeys(identitySeed);
      this.keyManager.setIdentitySignKeyPair(identityKeys.signKey);
      this.keyManager.setIdentityEncKeyPair(identityKeys.encKey);
    } else {
      // Legacy: derive identity keypair directly from CMK
      const legacyIdentityKeyPair = await IdentityKeyManager.generateIdentityKeyPairWithCmk(
        keys.cmk
      );
      this.keyManager.setIdentitySignKeyPair(legacyIdentityKeyPair);
      this.keyManager.setIdentityEncKeyPair(legacyIdentityKeyPair);
    }

    this.initialized = true;
  }

  async signWithIdentity(message: Uint8Array): Promise<Uint8Array> {
    const signKey = this.keyManager.getIdentitySignKeyPair();
    if (!signKey) {
      throw new Error('Identity sign key not available');
    }
    return IdentityKeyManager.sign(message, signKey.privateKey);
  }

  clearAll(): void {
    this.keyManager.clearAll();
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async getCMK(): Promise<Uint8Array | null> {
    return this.keyManager.getCMK();
  }

  async getIdentitySignPubKey(): Promise<Uint8Array | null> {
    return this.keyManager.getIdentitySignKeyPair()?.publicKey || null;
  }

  async encryptAndEncodeWithCmk(plaintext: Uint8Array): Promise<string> {
    const cmk = this.keyManager.getCMK();
    if (!cmk) {
      throw new Error('CMK not available for encryption');
    }
    return this.cmkManager.encryptAndEncode(plaintext, cmk);
  }

  async decodeAndDecryptWithCmk(ciphertext: string): Promise<Uint8Array> {
    const cmk = this.keyManager.getCMK();
    if (!cmk) {
      throw new Error('CMK not available for decryption');
    }
    return this.cmkManager.decodeAndDecrypt(ciphertext, cmk);
  }
}
