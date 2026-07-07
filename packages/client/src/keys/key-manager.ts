import { MemoryKeyStore } from './memory-keystore';
import { IdentityKeyPair } from '@agam-space/core';

export class KeyManager {
  private cmk: Uint8Array | null = null;
  private identitySignKeyPair: IdentityKeyPair | null = null;
  private identityEncKeyPair: IdentityKeyPair | null = null;
  private readonly fileKeyStore = new MemoryKeyStore<string, Uint8Array>(500, 10 * 60 * 1000);
  private readonly folderStore = new MemoryKeyStore<string, Uint8Array>(500, 10 * 60 * 1000);

  setCMK(key: Uint8Array) {
    this.cmk = key;
  }

  getCMK(): Uint8Array | null {
    return this.cmk;
  }

  setIdentitySignKeyPair(keyPair: IdentityKeyPair) {
    this.identitySignKeyPair = keyPair;
  }

  getIdentitySignKeyPair(): IdentityKeyPair | null {
    return this.identitySignKeyPair;
  }

  setIdentityEncKeyPair(keyPair: IdentityKeyPair) {
    this.identityEncKeyPair = keyPair;
  }

  getIdentityEncKeyPair(): IdentityKeyPair | null {
    return this.identityEncKeyPair;
  }

  setFileKey(fileId: string, key: Uint8Array) {
    this.fileKeyStore.set(fileId, key);
  }

  getFileKey(fileId: string): Uint8Array | null {
    return this.fileKeyStore.get(fileId);
  }

  setFolderKey(folderId: string, key: Uint8Array) {
    this.folderStore.set(folderId, key);
  }

  getFolderKey(folderId: string): Uint8Array | null {
    return this.folderStore.get(folderId);
  }

  zeroOut(arr: Uint8Array) {
    if (arr) {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = 0;
      }
    }
  }

  clearAll() {
    if (this.cmk) {
      this.zeroOut(this.cmk);
      this.cmk = null;
    }

    this.fileKeyStore.clear();
    this.folderStore.clear();
  }
}
