import { EncryptedEnvelope } from '@agam-space/core';
import { XChaChaV1Strategy } from './xchacha';

export interface EncryptionStrategy {
  encrypt(plaintext: Uint8Array, key: Uint8Array): Promise<EncryptedEnvelope>;
  decrypt(envelope: EncryptedEnvelope, key: Uint8Array): Promise<Uint8Array>;
}

export const EncryptionRegistry = {
  registry: new Map<number, EncryptionStrategy>([[1, new XChaChaV1Strategy()]]),
  defaultVersion: 1,
  get(version?: number): EncryptionStrategy {
    const strategy = this.registry.get(version ?? this.defaultVersion);
    if (!strategy) throw new Error(`No strategy registered for version ${version}`);
    return strategy;
  },
};
