import { ContentTreeV2Store } from '../../src/content-tree/content-tree.store';
import { FileEntry, FolderEntry } from '../../src/content-tree/entities';

function makeFolder(overrides: Partial<FolderEntry> = {}): FolderEntry {
  return {
    id: 'folder-1',
    name: 'Folder',
    nameHash: 'hash',
    parentId: 'root',
    isFolder: true,
    ...overrides,
  };
}

function makeFile(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    id: 'file-1',
    name: 'file.txt',
    nameHash: 'hash',
    size: 10,
    mime: 'text/plain',
    parentId: 'root',
    isFolder: false,
    chunkCount: 1,
    ...overrides,
  };
}

describe('ContentTreeV2Store', () => {
  describe('upsertItem / getItem / getAllItems', () => {
    it('stores and retrieves an item by id', () => {
      const store = new ContentTreeV2Store();
      const file = makeFile();

      store.upsertItem(file);

      expect(store.getItem(file.id)).toEqual(file);
      expect(store.getAllItems([file.id])).toEqual([file]);
    });

    it('does not mark the parent folder as fully loaded just from an incidental upsert', () => {
      const store = new ContentTreeV2Store();
      const file = makeFile({ id: 'file-a', parentId: 'folder-x' });

      store.upsertItem(file);

      expect(store.getFolderItemIds('folder-x')).toBeNull();
    });

    it('returns the full listing once the parent folder has actually been fetched', () => {
      const store = new ContentTreeV2Store();
      store.setFolderItemIds('folder-x', ['file-a', 'file-b']);
      store.upsertItem(makeFile({ id: 'file-a', parentId: 'folder-x' }));

      expect(store.getFolderItemIds('folder-x')).toEqual(['file-a', 'file-b']);
    });

    it('ignores a falsy item', () => {
      const store = new ContentTreeV2Store();
      expect(() => store.upsertItem(undefined as unknown as FileEntry)).not.toThrow();
    });
  });

  describe('getFolderItemIds / setFolderItemIds', () => {
    it('returns null when the folder has never been fetched', () => {
      const store = new ContentTreeV2Store();
      expect(store.getFolderItemIds('unknown-folder')).toBeNull();
    });

    it('returns the stored item ids for a folder', () => {
      const store = new ContentTreeV2Store();
      store.setFolderItemIds('folder-1', ['a', 'b', 'c']);

      expect(store.getFolderItemIds('folder-1')).toEqual(['a', 'b', 'c']);
    });
  });

  describe('applySort', () => {
    const a = makeFile({ id: 'a', name: 'apple.txt', size: 100 });
    const b = makeFile({ id: 'b', name: 'banana.txt', size: 50 });
    const folder = makeFolder({ id: 'c', name: 'cherry-folder' });

    it('sorts by name ascending and descending', () => {
      const items = [b, a];
      items.sort(ContentTreeV2Store.applySort('name', 'asc'));
      expect(items.map(i => i.id)).toEqual(['a', 'b']);

      items.sort(ContentTreeV2Store.applySort('name', 'desc'));
      expect(items.map(i => i.id)).toEqual(['b', 'a']);
    });

    it('sorts by size, treating folders as size 0', () => {
      const items = [a, b, folder];
      items.sort(ContentTreeV2Store.applySort('size', 'asc'));
      expect(items.map(i => i.id)).toEqual(['c', 'b', 'a']);
    });

    it('sorts by date-modified, treating missing dates as epoch 0', () => {
      const older = makeFile({ id: 'older', updatedAt: new Date('2020-01-01') });
      const newer = makeFile({ id: 'newer', updatedAt: new Date('2023-01-01') });
      const missing = makeFile({ id: 'missing' });

      const items = [newer, missing, older];
      items.sort(ContentTreeV2Store.applySort('date-modified', 'asc'));

      expect(items.map(i => i.id)).toEqual(['missing', 'older', 'newer']);
    });

    it('sorts by date-created', () => {
      const older = makeFile({ id: 'older', createdAt: new Date('2020-01-01') });
      const newer = makeFile({ id: 'newer', createdAt: new Date('2023-01-01') });

      const items = [older, newer];
      items.sort(ContentTreeV2Store.applySort('date-created', 'desc'));

      expect(items.map(i => i.id)).toEqual(['newer', 'older']);
    });
  });

  describe('getAncestorPath', () => {
    it('returns an empty path for the root folder', () => {
      const store = new ContentTreeV2Store();
      store.upsertItem(makeFolder({ id: 'root', parentId: undefined }));

      expect(store.getAncestorPath('root')).toEqual([]);
    });

    it('returns an empty path when the folder is unknown', () => {
      const store = new ContentTreeV2Store();
      expect(store.getAncestorPath('unknown')).toEqual([]);
    });

    it('builds the ancestor chain from root to the folder itself', () => {
      const store = new ContentTreeV2Store();
      const grandparent = makeFolder({ id: 'grandparent', name: 'GP', parentId: 'root' });
      const parent = makeFolder({ id: 'parent', name: 'Parent', parentId: 'grandparent' });
      const child = makeFolder({ id: 'child', name: 'Child', parentId: 'parent' });

      store.upsertItem(grandparent);
      store.upsertItem(parent);
      store.upsertItem(child);

      const path = store.getAncestorPath('child');

      expect(path.map(f => f.id)).toEqual(['grandparent', 'parent', 'child']);
    });

    it('stops and warns if a parent link is broken', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const store = new ContentTreeV2Store();
      const orphan = makeFolder({ id: 'orphan', parentId: 'missing-parent' });
      store.upsertItem(orphan);

      const path = store.getAncestorPath('orphan');

      expect(path.map(f => f.id)).toEqual(['orphan']);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('LRU eviction', () => {
    it('evicts the least-recently-accessed folder once maxFolders is exceeded', () => {
      const store = new ContentTreeV2Store(2);

      store.setFolderItemIds('folder-1', ['a']);
      store.upsertItem(makeFile({ id: 'a', parentId: 'folder-1' }));

      store.setFolderItemIds('folder-2', ['b']);
      store.upsertItem(makeFile({ id: 'b', parentId: 'folder-2' }));

      // Adding a third folder should evict folder-1 (least recently accessed).
      store.setFolderItemIds('folder-3', ['c']);
      store.upsertItem(makeFile({ id: 'c', parentId: 'folder-3' }));

      expect(store.getFolderItemIds('folder-1')).toBeNull();
      expect(store.getItem('a')).toBeUndefined();
      expect(store.getFolderItemIds('folder-2')).toEqual(['b']);
      expect(store.getFolderItemIds('folder-3')).toEqual(['c']);
    });

    it('refreshes recency when a folder view is read, protecting it from eviction', () => {
      const store = new ContentTreeV2Store(2);

      store.setFolderItemIds('folder-1', ['a']);
      store.setFolderItemIds('folder-2', ['b']);

      // Touch folder-1 (via getView, which marks access) so it becomes more recent than folder-2.
      store.getView('folder-1', 'name:asc');

      store.setFolderItemIds('folder-3', ['c']);

      // folder-2 was least recently touched, so it should be evicted instead of folder-1.
      expect(store.getFolderItemIds('folder-2')).toBeNull();
      expect(store.getFolderItemIds('folder-1')).toEqual(['a']);
    });
  });

  describe('setView / getView / hasView', () => {
    it('stores and retrieves a view for a folder + sort key combination', () => {
      const store = new ContentTreeV2Store();
      const view = { pages: new Map(), isLoading: false, hasMore: false, lastFetchedAt: 123 };

      store.setView('folder-1', 'name:asc', view);

      expect(store.hasView('folder-1', 'name:asc')).toBe(true);
      expect(store.getView('folder-1', 'name:asc')).toEqual(view);
      expect(store.hasView('folder-1', 'size:desc')).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all items, folder associations, and views', () => {
      const store = new ContentTreeV2Store();
      store.upsertItem(makeFile({ id: 'a', parentId: 'folder-1' }));
      store.setView('folder-1', 'name:asc', {
        pages: new Map(),
        isLoading: false,
        hasMore: false,
        lastFetchedAt: Date.now(),
      });

      store.clear();

      expect(store.getItem('a')).toBeUndefined();
      expect(store.getFolderItemIds('folder-1')).toBeNull();
      expect(store.hasView('folder-1', 'name:asc')).toBe(false);
    });
  });
});
