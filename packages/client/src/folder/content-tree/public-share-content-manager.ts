import { ContentEntry, FileEntry, FolderEntry } from '../../content-tree.store';
import { ContentTreeV2Store, Sort } from './content-tree-v2.store';
import { EncryptedEnvelopeCodec } from '@agam-space/core';
import { EncryptionRegistry } from '../../encryption/encryption-strategy';
import { PublicShareApi } from '../../api';
import { decryptFileMetadata } from '../../file';
import { isFolderIdRoot, PublicSharedFile } from '@agam-space/shared-types';
import { decryptFolderMetadata } from '../folder-contents';

/**
 * Public Share Content Manager
 * Manages fetching, decrypting, and caching content for public shares
 * Each folder/file has its own key (fkWrapped) that is decrypted using parent's key
 */
export class PublicShareContentManager {
  private keyCache = new Map<string, Uint8Array>();
  private fkWrappedMap = new Map<string, string>(); // Store fkWrapped for folders
  public readonly store: ContentTreeV2Store;
  private rootFolderMetadata: string | null = null; // Cache root folder encrypted metadata

  constructor(
    private readonly shareId: string,
    private readonly accessToken: string,
    private readonly rootItemId: string,
    private readonly rootItemKey: Uint8Array
  ) {
    this.store = new ContentTreeV2Store();
    this.keyCache.set(rootItemId, rootItemKey);
  }

  private async getKeyForItem(itemId: string): Promise<Uint8Array> {
    console.log('Getting key for item:', itemId);
    if (itemId === this.rootItemId) {
      return this.rootItemKey;
    }

    if (this.keyCache.has(itemId)) {
      const key = this.keyCache.get(itemId);
      if (key) return key;
    }

    const fkWrapped = this.fkWrappedMap.get(itemId);
    if (!fkWrapped) {
      throw new Error(`No wrapped key found for item ${itemId}`);
    }

    const item = this.store.getItem(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not found in store`);
    }

    // Get parent key (recursively if needed)
    const parentId = item.parentId || 'root';
    const parentKey = await this.getKeyForItem(parentId);

    // Decrypt item's wrapped key using parent key
    const itemKey = await this.decryptWrappedKey(fkWrapped, parentKey);

    this.keyCache.set(itemId, itemKey);
    return itemKey;
  }

  private async decryptWrappedKey(fkWrapped: string, parentKey: Uint8Array): Promise<Uint8Array> {
    const envelope = EncryptedEnvelopeCodec.deserialize(fkWrapped);
    return EncryptionRegistry.get().decrypt(envelope, parentKey);
  }

  async getOrFetch(
    folderId?: string,
    sort?: Sort
  ): Promise<{
    entries: ContentEntry[];
    folders: FolderEntry[];
    files: FileEntry[];
  }> {
    const actualFolderId = folderId || 'root';
    const cachedItemIds = this.store.getFolderItemIds(actualFolderId);
    if (cachedItemIds) {
      const items = this.store.getAllItems(cachedItemIds);
      return this.sortAndReturn(items, sort);
    }

    const encryptedContent = await PublicShareApi.getShareContent(
      this.shareId,
      this.accessToken,
      isFolderIdRoot(actualFolderId) ? undefined : folderId
    );

    // Store root folder metadata for later use (getting folder name)
    if (
      isFolderIdRoot(actualFolderId) &&
      encryptedContent.itemType === 'folder' &&
      encryptedContent.folder
    ) {
      this.rootFolderMetadata = encryptedContent.folder.metadataEncrypted;
    }

    const decryptedItems: ContentEntry[] = [];

    if (encryptedContent.itemType === 'file' && encryptedContent.file) {
      const file = await this.decryptFile(encryptedContent.file);
      decryptedItems.push(file);
    } else if (encryptedContent.itemType === 'folder' && encryptedContent.contents) {
      const folderKey = isFolderIdRoot(actualFolderId)
        ? this.rootItemKey
        : await this.getKeyForItem(actualFolderId);

      // Decrypt folders
      for (const encryptedFolder of encryptedContent.contents.folders) {
        // Store fkWrapped for later key derivation
        this.fkWrappedMap.set(encryptedFolder.id, encryptedFolder.fkWrapped);

        // Decrypt folder key
        const subFolderKey = await this.decryptWrappedKey(encryptedFolder.fkWrapped, folderKey);
        this.keyCache.set(encryptedFolder.id, subFolderKey);

        // Decrypt metadata
        const metadata = await decryptFolderMetadata(
          encryptedFolder.metadataEncrypted,
          subFolderKey
        );

        const folderEntry: FolderEntry = {
          id: encryptedFolder.id,
          name: metadata.name,
          nameHash: '',
          parentId: actualFolderId,
          isFolder: true,
          createdAt: new Date(encryptedFolder.createdAt),
          updatedAt: new Date(encryptedFolder.updatedAt),
        };
        decryptedItems.push(folderEntry);
      }

      // Decrypt files
      for (const encryptedFile of encryptedContent.contents.files) {
        // Store fkWrapped for later use
        this.fkWrappedMap.set(encryptedFile.id, encryptedFile.fkWrapped);

        // Decrypt file key
        const fileKey = await this.decryptWrappedKey(encryptedFile.fkWrapped, folderKey);
        this.keyCache.set(encryptedFile.id, fileKey);

        // Decrypt metadata
        const metadata = await decryptFileMetadata(encryptedFile.metadataEncrypted, fileKey);

        const fileEntry: FileEntry = {
          id: encryptedFile.id,
          name: metadata.name,
          nameHash: '',
          mime: metadata.mimeType || 'application/octet-stream',
          parentId: actualFolderId,
          size: encryptedFile.approxSize,
          isFolder: false,
          chunkCount: encryptedFile.chunkCount,
          createdAt: new Date(encryptedFile.createdAt),
          updatedAt: new Date(encryptedFile.updatedAt),
        };
        decryptedItems.push(fileEntry);
      }
    }

    const itemIds = decryptedItems.map(item => item.id);
    this.store.setFolderItemIds(actualFolderId, itemIds);
    decryptedItems.forEach(item => this.store.upsertItem(item));

    return this.sortAndReturn(decryptedItems, sort);
  }

  /**
   * Sort and separate items
   */
  private sortAndReturn(
    items: ContentEntry[],
    sort?: Sort
  ): {
    entries: ContentEntry[];
    folders: FolderEntry[];
    files: FileEntry[];
  } {
    let sortedItems = items;

    if (sort) {
      const compareFn = ContentTreeV2Store.applySort(sort.key, sort.direction);
      sortedItems = [...items].sort(compareFn);
    }

    return {
      entries: sortedItems,
      folders: sortedItems.filter(item => item.isFolder) as FolderEntry[],
      files: sortedItems.filter(item => !item.isFolder) as FileEntry[],
    };
  }

  async decryptFile(file: PublicSharedFile): Promise<FileEntry> {
    try {
      const fileKey = await this.getKeyForItem(file.id);
      const metadata = await decryptFileMetadata(file.metadataEncrypted, fileKey);

      return {
        id: file.id,
        name: metadata.name,
        nameHash: '',
        mime: metadata.mimeType || 'application/octet-stream',
        parentId: file.parentId || '',
        size: file.approxSize,
        isFolder: false,
        chunkCount: file.chunkCount,
        createdAt: new Date(file.createdAt),
        updatedAt: new Date(file.updatedAt),
      };
    } catch (err) {
      throw new Error(`Failed to decrypt public shared file`, { cause: err });
    }
  }

  clear(): void {
    this.keyCache.clear();
    this.fkWrappedMap.clear();
  }

  /**
   * Get the decrypted root folder name
   * Must be called after getOrFetch('root') has been called at least once
   */
  async getRootFolderName(): Promise<string | null> {
    if (!this.rootFolderMetadata) {
      return null;
    }

    try {
      const metadata = await decryptFolderMetadata(this.rootFolderMetadata, this.rootItemKey);
      return metadata.name;
    } catch (err) {
      console.error('Failed to decrypt root folder name:', err);
      return null;
    }
  }
}
