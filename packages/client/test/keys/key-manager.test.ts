import { KeyManager } from '../../src/keys/key-manager';
import { IdentityKeyPair } from '@agam-space/core';

describe('KeyManager', () => {
  let keyManager: KeyManager;

  beforeEach(() => {
    keyManager = new KeyManager();
  });

  describe('CMK management', () => {
    it('should store and retrieve CMK', () => {
      const cmk = new Uint8Array([1, 2, 3, 4, 5]);

      keyManager.setCMK(cmk);
      const retrieved = keyManager.getCMK();

      expect(retrieved).toEqual(cmk);
    });

    it('should return null when CMK is not set', () => {
      expect(keyManager.getCMK()).toBeNull();
    });

    it('should overwrite existing CMK', () => {
      const cmk1 = new Uint8Array([1, 2, 3]);
      const cmk2 = new Uint8Array([4, 5, 6]);

      keyManager.setCMK(cmk1);
      keyManager.setCMK(cmk2);

      expect(keyManager.getCMK()).toEqual(cmk2);
    });
  });

  describe('Identity key pair management', () => {
    it('should store and retrieve identity sign key pair', () => {
      const keyPair: IdentityKeyPair = {
        publicKey: new Uint8Array([1, 2, 3]),
        privateKey: new Uint8Array([4, 5, 6, 7, 8]),
      };

      keyManager.setIdentitySignKeyPair(keyPair);
      const retrieved = keyManager.getIdentitySignKeyPair();

      expect(retrieved).toEqual(keyPair);
    });

    it('should return null when identity sign key pair is not set', () => {
      expect(keyManager.getIdentitySignKeyPair()).toBeNull();
    });

    it('should store and retrieve identity enc key pair', () => {
      const keyPair: IdentityKeyPair = {
        publicKey: new Uint8Array([10, 20, 30]),
        privateKey: new Uint8Array([40, 50, 60]),
      };

      keyManager.setIdentityEncKeyPair(keyPair);
      const retrieved = keyManager.getIdentityEncKeyPair();

      expect(retrieved).toEqual(keyPair);
    });

    it('should return null when identity enc key pair is not set', () => {
      expect(keyManager.getIdentityEncKeyPair()).toBeNull();
    });

    it('should store both sign and enc key pairs independently', () => {
      const signKeyPair: IdentityKeyPair = {
        publicKey: new Uint8Array([1, 2, 3]),
        privateKey: new Uint8Array([4, 5, 6]),
      };
      const encKeyPair: IdentityKeyPair = {
        publicKey: new Uint8Array([10, 20, 30]),
        privateKey: new Uint8Array([40, 50, 60]),
      };

      keyManager.setIdentitySignKeyPair(signKeyPair);
      keyManager.setIdentityEncKeyPair(encKeyPair);

      expect(keyManager.getIdentitySignKeyPair()).toEqual(signKeyPair);
      expect(keyManager.getIdentityEncKeyPair()).toEqual(encKeyPair);
    });
  });

  describe('File key management', () => {
    it('should store and retrieve file keys', () => {
      const fileId = 'file-123';
      const key = new Uint8Array([10, 20, 30]);

      keyManager.setFileKey(fileId, key);
      const retrieved = keyManager.getFileKey(fileId);

      expect(retrieved).toEqual(key);
    });

    it('should return null for non-existent file key', () => {
      expect(keyManager.getFileKey('non-existent')).toBeNull();
    });

    it('should handle multiple file keys', () => {
      const file1 = 'file-1';
      const file2 = 'file-2';
      const key1 = new Uint8Array([1, 2, 3]);
      const key2 = new Uint8Array([4, 5, 6]);

      keyManager.setFileKey(file1, key1);
      keyManager.setFileKey(file2, key2);

      expect(keyManager.getFileKey(file1)).toEqual(key1);
      expect(keyManager.getFileKey(file2)).toEqual(key2);
    });
  });

  describe('Folder key management', () => {
    it('should store and retrieve folder keys', () => {
      const folderId = 'folder-123';
      const key = new Uint8Array([10, 20, 30]);

      keyManager.setFolderKey(folderId, key);
      const retrieved = keyManager.getFolderKey(folderId);

      expect(retrieved).toEqual(key);
    });

    it('should return null for non-existent folder key', () => {
      expect(keyManager.getFolderKey('non-existent')).toBeNull();
    });

    it('should handle multiple folder keys', () => {
      const folder1 = 'folder-1';
      const folder2 = 'folder-2';
      const key1 = new Uint8Array([1, 2, 3]);
      const key2 = new Uint8Array([4, 5, 6]);

      keyManager.setFolderKey(folder1, key1);
      keyManager.setFolderKey(folder2, key2);

      expect(keyManager.getFolderKey(folder1)).toEqual(key1);
      expect(keyManager.getFolderKey(folder2)).toEqual(key2);
    });
  });

  describe('zeroOut', () => {
    it('should zero out all bytes in array', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      keyManager.zeroOut(data);

      expect(Array.from(data)).toEqual([0, 0, 0, 0, 0]);
    });

    it('should handle empty array', () => {
      const data = new Uint8Array([]);

      expect(() => keyManager.zeroOut(data)).not.toThrow();
      expect(data.length).toBe(0);
    });

    it('should handle already zeroed array', () => {
      const data = new Uint8Array([0, 0, 0]);

      keyManager.zeroOut(data);

      expect(Array.from(data)).toEqual([0, 0, 0]);
    });
  });

  describe('clearAll', () => {
    it('should clear all stored keys and zero out CMK', () => {
      const cmk = new Uint8Array([1, 2, 3, 4, 5]);
      const fileKey = new Uint8Array([10, 20, 30]);
      const folderKey = new Uint8Array([40, 50, 60]);

      keyManager.setCMK(cmk);
      keyManager.setFileKey('file-1', fileKey);
      keyManager.setFolderKey('folder-1', folderKey);

      keyManager.clearAll();

      expect(keyManager.getCMK()).toBeNull();
      expect(keyManager.getFileKey('file-1')).toBeNull();
      expect(keyManager.getFolderKey('folder-1')).toBeNull();
      expect(Array.from(cmk)).toEqual([0, 0, 0, 0, 0]);
    });

    it('should not throw when clearing empty manager', () => {
      expect(() => keyManager.clearAll()).not.toThrow();

      expect(keyManager.getCMK()).toBeNull();
    });

    it('should clear multiple keys', () => {
      keyManager.setFileKey('file-1', new Uint8Array([1]));
      keyManager.setFileKey('file-2', new Uint8Array([2]));
      keyManager.setFolderKey('folder-1', new Uint8Array([3]));
      keyManager.setFolderKey('folder-2', new Uint8Array([4]));

      keyManager.clearAll();

      expect(keyManager.getFileKey('file-1')).toBeNull();
      expect(keyManager.getFileKey('file-2')).toBeNull();
      expect(keyManager.getFolderKey('folder-1')).toBeNull();
      expect(keyManager.getFolderKey('folder-2')).toBeNull();
    });
  });

  describe('security behavior', () => {
    it('should zero out CMK on clearAll for security', () => {
      const cmk = new Uint8Array([255, 254, 253, 252, 251]);
      const originalValues = Array.from(cmk);

      keyManager.setCMK(cmk);
      keyManager.clearAll();

      expect(Array.from(cmk)).toEqual([0, 0, 0, 0, 0]);
      expect(Array.from(cmk)).not.toEqual(originalValues);
    });

    it('should maintain separate stores for files and folders', () => {
      const sameId = 'same-id';
      const fileKey = new Uint8Array([1, 2, 3]);
      const folderKey = new Uint8Array([4, 5, 6]);

      keyManager.setFileKey(sameId, fileKey);
      keyManager.setFolderKey(sameId, folderKey);

      expect(keyManager.getFileKey(sameId)).toEqual(fileKey);
      expect(keyManager.getFolderKey(sameId)).toEqual(folderKey);
    });
  });
});
