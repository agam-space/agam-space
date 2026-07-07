import { EncryptedEnvelopeCodec, fromBase64, toBase64 } from '@agam-space/core';
import {
  Argon2idVersion,
  deriveKeyFromSecret,
  EncryptionRegistry,
  fetchSessionCryptoMaterial,
} from '@agam-space/client';
import { getPersistedSessionAutoUnlock } from '@/store/preferences.store';
import { idbSessionStore } from '@/storage/indexdb';
import { ClientSeedSync } from '@/services/cross-tab';

const CLIENT_SEED_KEY = 'agam_client_seed';
const STATIC_SALT = new Uint8Array(16);
const ENCRYPTED_CMK_KEY = 'session_enc_cmk';

export class SessionUnlockManager {
  private static clientSeedPromise: Promise<Uint8Array | null> | null = null;

  static getClientSeed(): Uint8Array | null {
    try {
      const stored = sessionStorage.getItem(CLIENT_SEED_KEY);
      if (stored) {
        return fromBase64(stored);
      }
      return null;
    } catch {
      return null;
    }
  }

  private static async getOrCreateClientSeed(): Promise<Uint8Array | null> {
    if (this.clientSeedPromise) {
      return this.clientSeedPromise;
    }

    this.clientSeedPromise = (async () => {
      try {
        let seed = SessionUnlockManager.getClientSeed();
        if (seed) {
          return seed;
        }

        seed = await ClientSeedSync.requestFromOtherTabs();
        if (!seed) {
          seed = crypto.getRandomValues(new Uint8Array(32));
        }

        sessionStorage.setItem(CLIENT_SEED_KEY, toBase64(seed));
        return seed;
      } catch {
        return null;
      } finally {
        this.clientSeedPromise = null;
      }
    })();

    return this.clientSeedPromise;
  }

  private static async deriveEncryptionKey(
    nonce: string,
    seed: Uint8Array
  ): Promise<Uint8Array | null> {
    try {
      const nonceBytes = fromBase64(nonce);
      const keyMaterial = new Uint8Array(nonceBytes.length + seed.length);
      keyMaterial.set(nonceBytes, 0);
      keyMaterial.set(seed, nonceBytes.length);

      const { key } = await deriveKeyFromSecret(keyMaterial, STATIC_SALT, Argon2idVersion.session);
      return key;
    } catch {
      return null;
    }
  }

  private static async getDerivedSessionKey(): Promise<Uint8Array | null> {
    try {
      const seed = await SessionUnlockManager.getOrCreateClientSeed();
      if (!seed) return null;

      const material = await fetchSessionCryptoMaterial();
      if (material.isNew || !material.nonce) return null;

      return await this.deriveEncryptionKey(material.nonce, seed);
    } catch {
      return null;
    }
  }

  static isSessionAutoUnlockEnabled(): boolean {
    return getPersistedSessionAutoUnlock();
  }

  static async saveCMKForAutoUnlock(cmk: Uint8Array): Promise<void> {
    if (!SessionUnlockManager.isSessionAutoUnlockEnabled()) return;

    try {
      const material = await fetchSessionCryptoMaterial();
      const seed = await this.getOrCreateClientSeed();
      if (!seed || !material.nonce) return;

      const key = await this.deriveEncryptionKey(material.nonce, seed);
      if (!key) return;

      const envelope = await EncryptionRegistry.get().encrypt(cmk, key);
      const serialized = EncryptedEnvelopeCodec.serializeToTLV(envelope);
      await idbSessionStore.storeEncryptedCMK(ENCRYPTED_CMK_KEY, serialized);
    } catch {
      return;
    }
  }

  static async restoreCMKForAutoUnlock(): Promise<Uint8Array | null> {
    if (!SessionUnlockManager.isSessionAutoUnlockEnabled()) return null;

    try {
      const combined = await idbSessionStore.getEncryptedCMK(ENCRYPTED_CMK_KEY);
      if (!combined || combined.length < 24) {
        return null;
      }

      const sessionKey = await SessionUnlockManager.getDerivedSessionKey();
      if (!sessionKey) {
        await this.clearAutoUnlockData();
        return null;
      }

      const envelope = EncryptedEnvelopeCodec.deserializeFromTLV(combined);
      return await EncryptionRegistry.get().decrypt(envelope, sessionKey);
    } catch {
      await this.clearAutoUnlockData();
      return null;
    }
  }

  static async clearAutoUnlockData(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.removeItem(CLIENT_SEED_KEY);
      await idbSessionStore.clearEncryptedCMK(ENCRYPTED_CMK_KEY);
    } catch {
      return;
    }
  }
}
