import { ContentTreeManager } from '../../src/content-tree/content-tree.manager';
import { FileEntry, FolderEntry } from '../../src/content-tree/entities';

jest.mock('../../src/folders/folder-contents', () => ({
  fetchFolderContents: jest.fn(),
  decryptFolder: jest.fn(),
  getFolderInfo: jest.fn(),
}));
jest.mock('../../src/api', () => ({
  ...jest.requireActual('../../src/api'),
  fetchFolderAncestorsApi: jest.fn(),
}));

import {
  fetchFolderContents,
  decryptFolder,
  getFolderInfo,
} from '../../src/folders/folder-contents';
import { fetchFolderAncestorsApi } from '../../src/api';

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

describe('ContentTreeManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrFetch', () => {
    it('fetches from the API on a cache miss and populates the store', async () => {
      const folder = makeFile({ id: 'a', name: 'a.txt' });
      (fetchFolderContents as jest.Mock).mockResolvedValue({ folders: [], files: [folder] });

      const manager = new ContentTreeManager();
      const state = await manager.getOrFetch('root');

      expect(fetchFolderContents).toHaveBeenCalledWith('root');
      expect(state?.files).toEqual([folder]);
      expect(manager.store.getFolderItemIds('root')).toEqual(['a']);
    });

    it('serves from the cache on a hit without calling the API again', async () => {
      const file = makeFile({ id: 'a', name: 'a.txt' });
      (fetchFolderContents as jest.Mock).mockResolvedValue({ folders: [], files: [file] });

      const manager = new ContentTreeManager();
      await manager.getOrFetch('root');
      (fetchFolderContents as jest.Mock).mockClear();

      const state = await manager.getOrFetch('root');

      expect(fetchFolderContents).not.toHaveBeenCalled();
      expect(state?.files).toEqual([file]);
    });

    it('groups folders before files by default and sorts each group independently', async () => {
      const fileB = makeFile({ id: 'file-b', name: 'b.txt' });
      const fileA = makeFile({ id: 'file-a', name: 'a.txt' });
      const folderB = makeFolder({ id: 'folder-b', name: 'B Folder' });
      const folderA = makeFolder({ id: 'folder-a', name: 'A Folder' });

      (fetchFolderContents as jest.Mock).mockResolvedValue({
        folders: [folderB, folderA],
        files: [fileB, fileA],
      });

      const manager = new ContentTreeManager();
      const state = await manager.getOrFetch('root', { key: 'name', direction: 'asc' }, true);

      expect(state?.entries.map(e => e.id)).toEqual(['folder-a', 'folder-b', 'file-a', 'file-b']);
    });

    it('mixes folders and files together when groupFolders is false', async () => {
      const fileA = makeFile({ id: 'file-a', name: 'a.txt' });
      const folderZ = makeFolder({ id: 'folder-z', name: 'z-folder' });

      (fetchFolderContents as jest.Mock).mockResolvedValue({
        folders: [folderZ],
        files: [fileA],
      });

      const manager = new ContentTreeManager();
      const state = await manager.getOrFetch('root', { key: 'name', direction: 'asc' }, false);

      expect(state?.entries.map(e => e.id)).toEqual(['file-a', 'folder-z']);
    });
  });

  describe('getFolderInfo', () => {
    it('synthesizes a virtual entry for the root folder without calling the API', async () => {
      const manager = new ContentTreeManager();
      const info = await manager.getFolderInfo('root');

      expect(info.id).toBe('root');
      expect(getFolderInfo).not.toHaveBeenCalled();
    });

    it('fetches and caches folder info for a non-root folder', async () => {
      const folder = makeFolder({ id: 'folder-1' });
      (getFolderInfo as jest.Mock).mockResolvedValue(folder);

      const manager = new ContentTreeManager();
      const info = await manager.getFolderInfo('folder-1');

      expect(info).toEqual(folder);
      expect(getFolderInfo).toHaveBeenCalledWith('folder-1');

      (getFolderInfo as jest.Mock).mockClear();
      const cachedInfo = await manager.getFolderInfo('folder-1');

      expect(cachedInfo).toEqual(folder);
      expect(getFolderInfo).not.toHaveBeenCalled();
    });

    it('throws when the folder does not exist', async () => {
      (getFolderInfo as jest.Mock).mockResolvedValue(undefined);
      const manager = new ContentTreeManager();

      await expect(manager.getFolderInfo('missing')).rejects.toThrow(
        'Folder with ID missing not found'
      );
    });
  });

  describe('addItem', () => {
    it('adds the item to the store and prepends it to a cached folder listing', async () => {
      (fetchFolderContents as jest.Mock).mockResolvedValue({ folders: [], files: [] });
      const manager = new ContentTreeManager();
      await manager.getOrFetch('root'); // populate cache with empty list

      const newFile = makeFile({ id: 'new-file' });
      manager.addItem(newFile, 'root');

      expect(manager.store.getItem('new-file')).toEqual(newFile);
      expect(manager.store.getFolderItemIds('root')).toEqual(['new-file']);
    });

    it('does not create a folder listing if the folder was never fetched', () => {
      const manager = new ContentTreeManager();
      const newFile = makeFile({ id: 'new-file' });

      manager.addItem(newFile, 'unfetched-folder');

      expect(manager.store.getItem('new-file')).toEqual(newFile);
      expect(manager.store.getFolderItemIds('unfetched-folder')).toBeNull();
    });
  });

  describe('loadAncestorsPath', () => {
    it('returns an empty path for the root folder', async () => {
      const manager = new ContentTreeManager();
      const path = await manager.loadAncestorsPath('root', 5);

      expect(path).toEqual([]);
      expect(fetchFolderAncestorsApi).not.toHaveBeenCalled();
    });

    it('fetches and decrypts ancestors when the parent is not cached', async () => {
      const child = makeFolder({ id: 'child', parentId: 'parent' });
      const parent = { id: 'parent', parentId: undefined, nameHash: 'h' } as any;
      const decryptedParent = makeFolder({ id: 'parent', name: 'Parent', parentId: undefined });

      (getFolderInfo as jest.Mock).mockResolvedValue(child);
      (fetchFolderAncestorsApi as jest.Mock).mockResolvedValue([parent]);
      (decryptFolder as jest.Mock).mockResolvedValue(decryptedParent);

      const manager = new ContentTreeManager();
      const path = await manager.loadAncestorsPath('child', 5);

      expect(fetchFolderAncestorsApi).toHaveBeenCalledWith('child', 5);
      expect(path.map(f => f.id)).toEqual(['parent', 'child']);
    });

    it('skips the API call when the parent is already cached', async () => {
      const parent = makeFolder({ id: 'parent', parentId: 'root' });
      const child = makeFolder({ id: 'child', parentId: 'parent' });

      (getFolderInfo as jest.Mock).mockImplementation(async (id: string) =>
        id === 'child' ? child : parent
      );

      const manager = new ContentTreeManager();
      // Warm the cache with the parent first.
      await manager.getFolderInfo('parent');
      (fetchFolderAncestorsApi as jest.Mock).mockClear();

      const path = await manager.loadAncestorsPath('child', 5);

      expect(fetchFolderAncestorsApi).not.toHaveBeenCalled();
      expect(path.map(f => f.id)).toEqual(['parent', 'child']);
    });
  });

  describe('clear', () => {
    it('resets the underlying store', async () => {
      (fetchFolderContents as jest.Mock).mockResolvedValue({ folders: [], files: [makeFile()] });
      const manager = new ContentTreeManager();
      await manager.getOrFetch('root');

      manager.clear();

      expect(manager.store.getFolderItemIds('root')).toBeNull();
    });
  });
});
