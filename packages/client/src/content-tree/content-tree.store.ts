import { ContentEntry, FolderEntry } from './entities';
import { LRUCache } from 'lru-cache';
import { isFolderIdRoot } from '@agam-space/shared-types';

export type SortKey = 'name' | 'size' | 'date-modified' | 'date-created';
export type SortDirection = 'asc' | 'desc';
export type Sort = {
  key: SortKey;
  direction: SortDirection;
};

export type ContentTreeViewModel = {
  pages: Map<number, string[]>;
  isLoading: boolean;
  hasMore: boolean;
  lastFetchedAt: number;
};

export class ContentTreeV2Store {
  private itemsById = new Map<string, ContentEntry>();
  private childrenByFolder = new Map<string, Set<string>>();
  // Distinct from childrenByFolder, which upsertItem() also touches incidentally.
  private fullyLoadedFolders = new Set<string>();
  private views = new Map<string, Map<string, ContentTreeViewModel>>();

  private folderCache: LRUCache<string, true>;

  constructor(maxFolders = 100) {
    this.folderCache = new LRUCache<string, true>({
      max: maxFolders,
      // ttl: 10 * 60 * 1000, // 10 minutes
      // allowStale: true,
      // updateAgeOnGet: true,
      dispose: (_, folderId) => {
        this.evictFolderData(folderId);
      },
    });
  }

  private markAccess(folderId: string) {
    this.folderCache.set(folderId, true);
  }

  evictFolderData(folderId: string) {
    this.views.delete(folderId);
    this.fullyLoadedFolders.delete(folderId);

    const childIds = this.childrenByFolder.get(folderId);
    if (childIds) {
      childIds.forEach(id => this.itemsById.delete(id));
      this.childrenByFolder.delete(folderId);
    }
  }

  getFolderItemIds(folderId: string): string[] | null {
    if (!this.fullyLoadedFolders.has(folderId)) return null;
    const itemIds = this.childrenByFolder.get(folderId);
    return itemIds ? Array.from(itemIds) : null;
  }

  setFolderItemIds(folderId: string, itemIds: string[]) {
    this.childrenByFolder.set(folderId, new Set(itemIds));
    this.fullyLoadedFolders.add(folderId);
    this.markAccess(folderId);
  }

  getItem(itemId: string): ContentEntry | undefined {
    return this.itemsById.get(itemId);
  }

  getAllItems(ids: string[]): ContentEntry[] {
    return ids.map(id => this.itemsById.get(id)) as ContentEntry[];
  }

  upsertItem(item: ContentEntry) {
    if (!item) return;
    this.itemsById.set(item.id, item);

    if (item.isFolder) {
      this.folderCache.set(item.id, true);
    }

    if (!isFolderIdRoot(item.id)) {
      const parentId = isFolderIdRoot(item.parentId) ? 'root' : item.parentId!;
      this.addToFolder(parentId, item.id);
      this.markAccess(parentId);
    }
  }

  addToFolder(folderId: string, itemId: string) {
    if (!this.childrenByFolder.has(folderId)) {
      this.childrenByFolder.set(folderId, new Set());
    }
    this.childrenByFolder.get(folderId)!.add(itemId);
  }

  setView(folderId: string, sortKey: string, view: ContentTreeViewModel) {
    if (!this.views.has(folderId)) {
      this.views.set(folderId, new Map());
    }
    this.views.get(folderId)!.set(sortKey, view);
    this.markAccess(folderId);
  }

  getView(folderId: string, sortKey: string): ContentTreeViewModel | undefined {
    this.markAccess(folderId);
    return this.views.get(folderId)?.get(sortKey);
  }

  hasView(folderId: string, sortKey: string): boolean {
    return this.views.get(folderId)?.has(sortKey) ?? false;
  }

  static applySort(
    sortBy: SortKey,
    direction: SortDirection
  ): (a: ContentEntry, b: ContentEntry) => number {
    const dir = direction === 'asc' ? 1 : -1;

    switch (sortBy) {
      case 'name':
        return (a, b) => a.name.localeCompare(b.name) * dir;

      case 'size':
        return (a, b) => {
          const aSize = a.isFolder ? 0 : a.size;
          const bSize = b.isFolder ? 0 : b.size;
          return (aSize - bSize) * dir;
        };

      case 'date-modified':
        return (a, b) => {
          const aDate = a.updatedAt
            ? a.updatedAt instanceof Date
              ? a.updatedAt.getTime()
              : new Date(a.updatedAt).getTime()
            : 0;
          const bDate = b.updatedAt
            ? b.updatedAt instanceof Date
              ? b.updatedAt.getTime()
              : new Date(b.updatedAt).getTime()
            : 0;
          return (aDate - bDate) * dir;
        };

      case 'date-created':
        return (a, b) => {
          const aDate = a.createdAt
            ? a.createdAt instanceof Date
              ? a.createdAt.getTime()
              : new Date(a.createdAt).getTime()
            : 0;
          const bDate = b.createdAt
            ? b.createdAt instanceof Date
              ? b.createdAt.getTime()
              : new Date(b.createdAt).getTime()
            : 0;
          return (aDate - bDate) * dir;
        };

      default:
        return () => 0;
    }
  }

  getAncestorPath(folderId: string): FolderEntry[] {
    const path: FolderEntry[] = [];
    const visited = new Set<string>();

    let current = this.getItem(folderId) as FolderEntry;

    if (!current || isFolderIdRoot(current.id)) {
      return [];
    }

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift(current);

      if (isFolderIdRoot(current.parentId)) break;
      current = this.getItem(current.parentId!) as FolderEntry;
      if (!current) {
        console.warn(`No parent found for folder`);
        break;
      }
    }

    return path;
  }

  clear(): void {
    this.itemsById.clear();
    this.childrenByFolder.clear();
    this.fullyLoadedFolders.clear();
    this.views.clear();
    this.folderCache.clear();
  }
}
