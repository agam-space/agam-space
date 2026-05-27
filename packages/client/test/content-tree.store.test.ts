import { contentTreeStore, FileEntry, FolderEntry } from '../src/content-tree.store';

// Helpers
function makeFolder(id: string, name: string, parentId?: string): FolderEntry {
  return { id, name, nameHash: `hash-${name}`, isFolder: true, parentId };
}

function makeFile(id: string, name: string, parentId: string, size = 100): FileEntry {
  return {
    id,
    name,
    nameHash: `hash-${name}`,
    isFolder: false,
    parentId,
    size,
    mime: 'application/octet-stream',
    chunkCount: 1,
  };
}

beforeEach(() => {
  contentTreeStore.clear();
});

describe('getOrFetch', () => {
  it('fetches and caches folder contents on cache miss', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      folders: [makeFolder('f1', 'Alpha')],
      files: [makeFile('file1', 'report.pdf', 'root')],
      hasMore: false,
    });
    const fetchFolderInfo = jest.fn();

    const result = await contentTreeStore.getOrFetch(
      'root',
      1,
      'name',
      'asc',
      fetchFn,
      fetchFolderInfo
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.folder.id).toBe('root');
    expect(result.node.folders).toHaveLength(1);
    expect(result.node.files).toHaveLength(1);
  });

  it('returns cached result on second call without re-fetching', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ folders: [], files: [], hasMore: false });
    const fetchFolderInfo = jest.fn();

    await contentTreeStore.getOrFetch('root', 1, 'name', 'asc', fetchFn, fetchFolderInfo);
    await contentTreeStore.getOrFetch('root', 1, 'name', 'asc', fetchFn, fetchFolderInfo);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('creates root folder entry automatically without calling fetchFolderInfo', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ folders: [], files: [], hasMore: false });
    const fetchFolderInfo = jest.fn();

    const result = await contentTreeStore.getOrFetch(
      'root',
      1,
      'name',
      'asc',
      fetchFn,
      fetchFolderInfo
    );

    expect(fetchFolderInfo).not.toHaveBeenCalled();
    expect(result.folder.name).toBe('root');
  });

  it('calls fetchFolderInfo for non-root folders not yet cached', async () => {
    const folder = makeFolder('folder-abc', 'Documents');
    const fetchFn = jest.fn().mockResolvedValue({ folders: [], files: [], hasMore: false });
    const fetchFolderInfo = jest.fn().mockResolvedValue(folder);

    const result = await contentTreeStore.getOrFetch(
      'folder-abc',
      1,
      'name',
      'asc',
      fetchFn,
      fetchFolderInfo
    );

    expect(fetchFolderInfo).toHaveBeenCalledWith('folder-abc');
    expect(result.folder.name).toBe('Documents');
  });

  it('uses cached folder metadata and skips fetchFolderInfo', async () => {
    const folder = makeFolder('folder-xyz', 'Photos');
    contentTreeStore.setFolder('folder-xyz', folder);

    const fetchFn = jest.fn().mockResolvedValue({ folders: [], files: [], hasMore: false });
    const fetchFolderInfo = jest.fn();

    await contentTreeStore.getOrFetch('folder-xyz', 1, 'name', 'asc', fetchFn, fetchFolderInfo);

    expect(fetchFolderInfo).not.toHaveBeenCalled();
  });

  it('sorts results by name asc', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      folders: [makeFolder('f2', 'Zebra'), makeFolder('f1', 'Alpha')],
      files: [],
      hasMore: false,
    });

    const result = await contentTreeStore.getOrFetch('root', 1, 'name', 'asc', fetchFn, jest.fn());

    expect(result.node.folders[0].name).toBe('Alpha');
    expect(result.node.folders[1].name).toBe('Zebra');
  });

  it('sorts results by name desc', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      folders: [makeFolder('f1', 'Alpha'), makeFolder('f2', 'Zebra')],
      files: [],
      hasMore: false,
    });

    const result = await contentTreeStore.getOrFetch('root', 1, 'name', 'desc', fetchFn, jest.fn());

    expect(result.node.folders[0].name).toBe('Zebra');
    expect(result.node.folders[1].name).toBe('Alpha');
  });

  it('sorts files by size asc', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      folders: [],
      files: [makeFile('b', 'big.zip', 'root', 9000), makeFile('s', 'small.txt', 'root', 10)],
      hasMore: false,
    });

    const result = await contentTreeStore.getOrFetch('root', 1, 'size', 'asc', fetchFn, jest.fn());

    expect(result.node.files[0].size).toBe(10);
    expect(result.node.files[1].size).toBe(9000);
  });
});

describe('subscribeToFolder / notifySubscribers', () => {
  it('calls subscriber when folder is fetched', async () => {
    const cb = jest.fn();
    contentTreeStore.subscribeToFolder('root', cb);

    const fetchFn = jest.fn().mockResolvedValue({ folders: [], files: [], hasMore: false });
    await contentTreeStore.getOrFetch('root', 1, 'name', 'asc', fetchFn, jest.fn());

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ folders: [], files: [] }));
  });

  it('unsubscribe stops receiving notifications', async () => {
    const cb = jest.fn();
    const unsubscribe = contentTreeStore.subscribeToFolder('root', cb);
    unsubscribe();

    const fetchFn = jest.fn().mockResolvedValue({ folders: [], files: [], hasMore: false });
    await contentTreeStore.getOrFetch('root', 1, 'name', 'asc', fetchFn, jest.fn());

    expect(cb).not.toHaveBeenCalled();
  });

  it('notifies all subscribers for a folder', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    contentTreeStore.subscribeToFolder('fld', cb1);
    contentTreeStore.subscribeToFolder('fld', cb2);

    const node = { folders: [], files: [], page: 1, hasMore: false, sortBy: 'name' as const };
    contentTreeStore.notifySubscribers('fld', node);

    expect(cb1).toHaveBeenCalledWith(node);
    expect(cb2).toHaveBeenCalledWith(node);
  });
});

describe('updateEntry / updateEntryForPage', () => {
  async function seedNode(folderId: string) {
    const fetchFn = jest.fn().mockResolvedValue({
      folders: [makeFolder('sub1', 'Beta', folderId)],
      files: [makeFile('file1', 'z.txt', folderId, 50)],
      hasMore: false,
    });
    return contentTreeStore.getOrFetch(folderId, 1, 'name', 'asc', fetchFn, jest.fn());
  }

  it('returns undefined when node not in cache', () => {
    const result = contentTreeStore.updateEntry(makeFile('x', 'x.txt', 'ghost-folder'));
    expect(result).toBeUndefined();
  });

  it('updates an existing file in the node', async () => {
    await seedNode('root');

    const updated = makeFile('file1', 'renamed.txt', 'root', 200);
    const node = contentTreeStore.updateEntry(updated);

    expect(node!.files.find(f => f.id === 'file1')!.name).toBe('renamed.txt');
  });

  it('inserts a new file if not already present', async () => {
    await seedNode('root');

    const newFile = makeFile('file2', 'new.pdf', 'root', 300);
    const node = contentTreeStore.updateEntry(newFile);

    expect(node!.files).toHaveLength(2);
  });

  it('updates an existing folder in the node', async () => {
    await seedNode('root');

    const updated = makeFolder('sub1', 'Renamed', 'root');
    const node = contentTreeStore.updateEntry(updated);

    expect(node!.folders.find(f => f.id === 'sub1')!.name).toBe('Renamed');
  });

  it('inserts a new folder if not already present', async () => {
    await seedNode('root');

    const newFolder = makeFolder('sub2', 'NewFolder', 'root');
    const node = contentTreeStore.updateEntry(newFolder);

    expect(node!.folders).toHaveLength(2);
  });

  it('re-sorts files after update', async () => {
    await seedNode('root');
    contentTreeStore.updateEntry(makeFile('file2', 'aaa.txt', 'root', 1));

    const node = contentTreeStore.getNode('root', 'name', 'asc', 1);
    expect(node!.files[0].name).toBe('aaa.txt');
  });

  it('notifies subscribers on update', async () => {
    await seedNode('root');
    const cb = jest.fn();
    contentTreeStore.subscribeToFolder('root', cb);

    contentTreeStore.updateEntry(makeFile('file1', 'updated.txt', 'root'));

    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('getPath', () => {
  it('returns empty array for root folder', () => {
    contentTreeStore.setFolder('root', makeFolder('root', 'root'));
    expect(contentTreeStore.getPath('root')).toEqual([]);
  });

  it('returns single folder path', () => {
    const folder = makeFolder('f1', 'Documents', 'root');
    contentTreeStore.setFolder('f1', folder);

    const path = contentTreeStore.getPath('f1');
    expect(path).toHaveLength(1);
    expect(path[0].id).toBe('f1');
  });

  it('returns nested path in order from root to leaf', () => {
    const parent = makeFolder('p1', 'Parent', 'root');
    const child = makeFolder('c1', 'Child', 'p1');
    contentTreeStore.setFolder('p1', parent);
    contentTreeStore.setFolder('c1', child);

    const path = contentTreeStore.getPath('c1');
    expect(path).toHaveLength(2);
    expect(path[0].id).toBe('p1');
    expect(path[1].id).toBe('c1');
  });

  it('returns empty array when folder is not in cache', () => {
    expect(contentTreeStore.getPath('not-cached')).toEqual([]);
  });
});

describe('invalidate / forceRefresh / clear / has / hasFolder', () => {
  it('has() returns true after fetch, false before', async () => {
    expect(contentTreeStore.has('root', 'name', 'asc', 1)).toBe(false);

    await contentTreeStore.getOrFetch(
      'root',
      1,
      'name',
      'asc',
      jest.fn().mockResolvedValue({ folders: [], files: [], hasMore: false }),
      jest.fn()
    );

    expect(contentTreeStore.has('root', 'name', 'asc', 1)).toBe(true);
  });

  it('hasFolder() returns true after setFolder', () => {
    expect(contentTreeStore.hasFolder('f99')).toBe(false);
    contentTreeStore.setFolder('f99', makeFolder('f99', 'Test'));
    expect(contentTreeStore.hasFolder('f99')).toBe(true);
  });

  it('forceRefresh removes specific page', async () => {
    await contentTreeStore.getOrFetch(
      'root',
      1,
      'name',
      'asc',
      jest.fn().mockResolvedValue({ folders: [], files: [], hasMore: false }),
      jest.fn()
    );

    contentTreeStore.forceRefresh('root', 'name', 'asc', 1);
    expect(contentTreeStore.has('root', 'name', 'asc', 1)).toBe(false);
  });

  it('invalidate removes all pages for a folder, leaving others intact', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ folders: [], files: [], hasMore: false });
    await contentTreeStore.getOrFetch('root', 1, 'name', 'asc', fetchFn, jest.fn());
    await contentTreeStore.getOrFetch('root', 2, 'name', 'asc', fetchFn, jest.fn());
    await contentTreeStore.getOrFetch('other', 1, 'name', 'asc', fetchFn, jest.fn());

    contentTreeStore.invalidate('root');

    expect(contentTreeStore.has('root', 'name', 'asc', 1)).toBe(false);
    expect(contentTreeStore.has('root', 'name', 'asc', 2)).toBe(false);
    expect(contentTreeStore.has('other', 'name', 'asc', 1)).toBe(true);
  });

  it('clear removes all nodes', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ folders: [], files: [], hasMore: false });
    await contentTreeStore.getOrFetch('root', 1, 'name', 'asc', fetchFn, jest.fn());

    contentTreeStore.clear();

    expect(contentTreeStore.has('root', 'name', 'asc', 1)).toBe(false);
  });
});

describe('getFolderMetadata', () => {
  it('returns undefined for root', async () => {
    const result = await contentTreeStore.getFolderMetadata('root');
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty string', async () => {
    const result = await contentTreeStore.getFolderMetadata('');
    expect(result).toBeUndefined();
  });

  it('returns cached folder without calling fetchFolderInfo', async () => {
    const folder = makeFolder('f1', 'Cached');
    contentTreeStore.setFolder('f1', folder);

    const fetchFolderInfo = jest.fn();
    const result = await contentTreeStore.getFolderMetadata('f1', fetchFolderInfo);

    expect(result).toEqual(folder);
    expect(fetchFolderInfo).not.toHaveBeenCalled();
  });

  it('fetches and caches when folder not in cache', async () => {
    const folder = makeFolder('f-uncached-unique', 'Fetched');
    const fetchFolderInfo = jest.fn().mockResolvedValue(folder);

    const result = await contentTreeStore.getFolderMetadata('f-uncached-unique', fetchFolderInfo);

    expect(fetchFolderInfo).toHaveBeenCalledWith('f-uncached-unique');
    expect(result).toEqual(folder);
    // Second call should use cache
    await contentTreeStore.getFolderMetadata('f-uncached-unique', fetchFolderInfo);
    expect(fetchFolderInfo).toHaveBeenCalledTimes(1);
  });
});
