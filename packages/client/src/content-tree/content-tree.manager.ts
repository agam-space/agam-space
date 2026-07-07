import { ContentTreeV2Store, ContentTreeViewModel, Sort } from './content-tree.store';
import { decryptFolder, fetchFolderContents, getFolderInfo } from '../folders/folder-contents';
import { isFolderIdRoot } from '@agam-space/shared-types';
import { ContentEntry, FileEntry, FolderEntry } from './entities';
import { fetchFolderAncestorsApi } from '../api';

type ExplorerState = {
  entries: ContentEntry[];
  folders: FolderEntry[];
  files: FileEntry[];
  viewModel: ContentTreeViewModel;
  currentParent: FolderEntry;
};

export class ContentTreeManager {
  public readonly store: ContentTreeV2Store;

  constructor() {
    this.store = new ContentTreeV2Store();
  }

  async getOrFetch(
    folderId: string,
    sort: Sort = {
      key: 'name',
      direction: 'asc',
    },
    groupFolders: boolean = true
  ): Promise<ExplorerState | null> {
    const folderInfo = await this.getFolderInfo(folderId);

    // Check if we have cached items for this folder
    const cachedItemIds = this.store.getFolderItemIds(folderId);

    if (cachedItemIds && cachedItemIds.length > 0) {
      const items = this.store.getAllItems(cachedItemIds);
      return this.buildExplorerState(items, folderInfo, sort, groupFolders);
    }

    // Cache miss - fetch from API
    const { folders, files } = await fetchFolderContents(folderId);
    const allItems = [...folders, ...files];

    // Store items in cache
    for (const item of allItems) {
      this.store.upsertItem(item);
    }

    // Store the list of item IDs for this folder (unsorted - we'll sort on demand)
    this.store.setFolderItemIds(
      folderId,
      allItems.map(item => item.id)
    );

    return this.buildExplorerState(allItems, folderInfo, sort, groupFolders);
  }

  buildExplorerState(
    items: ContentEntry[],
    currentParent: FolderEntry,
    sort: Sort,
    groupFolders: boolean = true
  ): ExplorerState {
    const sortFn = ContentTreeV2Store.applySort(sort.key, sort.direction);

    let sortedEntries: ContentEntry[];
    let folders: FolderEntry[];
    let files: FileEntry[];

    if (groupFolders) {
      // Folders first, then files (each group sorted independently)
      folders = items.filter(f => f.isFolder) as FolderEntry[];
      files = items.filter(f => !f.isFolder) as FileEntry[];

      folders.sort(sortFn);
      files.sort(sortFn);

      sortedEntries = [...folders, ...files];
    } else {
      // Mix folders and files together, sorted by the same criteria
      sortedEntries = [...items].sort(sortFn);
      folders = sortedEntries.filter(f => f.isFolder) as FolderEntry[];
      files = sortedEntries.filter(f => !f.isFolder) as FileEntry[];
    }

    return {
      entries: sortedEntries,
      folders,
      files,
      viewModel: {
        pages: new Map(), // Deprecated - kept for compatibility
        isLoading: false,
        hasMore: false,
        lastFetchedAt: Date.now(),
      },
      currentParent,
    };
  }

  getItems(ids: string[]): ContentEntry[] {
    return this.store.getAllItems(ids);
  }

  async getFolders(folderId: string): Promise<FolderEntry[]> {
    const state = await this.getOrFetch(folderId);
    return state?.folders ?? [];
  }

  addItem(item: ContentEntry, currentParentId: string) {
    // Add item to the store
    this.store.upsertItem(item);

    // Add item ID to the folder's item list (if folder is cached)
    const existingIds = this.store.getFolderItemIds(currentParentId);
    if (existingIds) {
      const updatedIds = [item.id, ...existingIds.filter(id => id !== item.id)];
      this.store.setFolderItemIds(currentParentId, updatedIds);
    }
  }

  async getFolderInfo(folderId: string) {
    let folderInfo = this.store.getItem(folderId);
    if (folderInfo) {
      return folderInfo as FolderEntry;
    }

    if (isFolderIdRoot(folderId)) {
      folderInfo = {
        id: 'root',
        name: 'root',
        nameHash: 'root',
        isFolder: true,
      };
    } else {
      folderInfo = await getFolderInfo(folderId);
      if (!folderInfo) {
        throw new Error(`Folder with ID ${folderId} not found`);
      }
    }
    this.store.upsertItem(folderInfo);
    return folderInfo as FolderEntry;
  }

  async loadAncestorsPath(folderId: string, depth: number): Promise<FolderEntry[]> {
    const folder = await this.getFolderInfo(folderId);

    if (isFolderIdRoot(folderId)) {
      return [];
    }

    if (folder.parentId && !this.store.getItem(folder.parentId)) {
      const ancestors = await fetchFolderAncestorsApi(folder.id, depth);

      for (const ancestor of ancestors) {
        const folderEntry = await decryptFolder(ancestor);
        this.store.upsertItem(folderEntry);
      }
    }

    return this.store.getAncestorPath(folderId);
  }

  clear(): void {
    this.store.clear();
  }
}
