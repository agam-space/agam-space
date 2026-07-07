import { DownloadManager } from '../../../src/files/download/download-manager';
import { FileEntry } from '../../../src/content-tree/entities';
import { DownloadManagerCallbacks } from '../../../src/files/download/types';

jest.mock('../../../src/files/download', () => ({
  downloadFile: jest.fn(),
}));

import { downloadFile } from '../../../src/files/download';

function makeFileEntry(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    id: 'file-1',
    name: 'document.pdf',
    nameHash: 'hash',
    size: 100,
    mime: 'application/pdf',
    parentId: 'root',
    isFolder: false,
    chunkCount: 1,
    ...overrides,
  };
}

function waitForTerminalStatus(callbacks: DownloadManagerCallbacks): Promise<'complete' | 'error'> {
  return new Promise(resolve => {
    const originalOnStatusChange = callbacks.onStatusChange;
    callbacks.onStatusChange = (id, status) => {
      originalOnStatusChange?.(id, status);
      if (status === 'complete' || status === 'error') {
        resolve(status);
      }
    };
  });
}

describe('DownloadManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enqueues an item with pending status and the file size as totalBytes', async () => {
    (downloadFile as jest.Mock).mockResolvedValue(undefined);
    const callbacks: DownloadManagerCallbacks = {};
    const donePromise = waitForTerminalStatus(callbacks);

    const manager = new DownloadManager({ concurrency: 2 }, callbacks);
    const fileEntry = makeFileEntry({ size: 500 });
    const item = manager.enqueue(fileEntry);

    expect(item.status).toBe('pending');
    expect(item.totalBytes).toBe(500);
    expect(item.downloadedBytes).toBe(0);

    await donePromise;
  });

  it('reports progress and marks completion once the download finishes', async () => {
    (downloadFile as jest.Mock).mockImplementation(
      async (_file: FileEntry, onChunkDownloaded?: (chunkIndex: number, bytes: number) => void) => {
        onChunkDownloaded?.(0, 40);
        onChunkDownloaded?.(1, 60);
      }
    );

    const onProgress = jest.fn();
    const onStatusChange = jest.fn();
    const callbacks: DownloadManagerCallbacks = { onProgress, onStatusChange };
    const donePromise = waitForTerminalStatus(callbacks);

    const manager = new DownloadManager({ concurrency: 2 }, callbacks);
    const fileEntry = makeFileEntry({ size: 100 });
    const item = manager.enqueue(fileEntry);

    const status = await donePromise;

    expect(status).toBe('complete');
    expect(onStatusChange).toHaveBeenCalledWith(item.id, 'downloading');
    expect(onStatusChange).toHaveBeenCalledWith(item.id, 'complete');
    expect(onProgress).toHaveBeenNthCalledWith(1, item.id, {
      percent: 40,
      downloadedBytes: 40,
      totalBytes: 100,
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, item.id, {
      percent: 100,
      downloadedBytes: 100,
      totalBytes: 100,
    });
    expect(item.status).toBe('complete');
    expect(item.progress).toBe(100);
  });

  it('marks the item as error and forwards the failure message when the download fails', async () => {
    (downloadFile as jest.Mock).mockRejectedValue(new Error('chunk fetch failed'));

    const onError = jest.fn();
    const callbacks: DownloadManagerCallbacks = { onError };
    const donePromise = waitForTerminalStatus(callbacks);

    const manager = new DownloadManager({ concurrency: 2 }, callbacks);
    const fileEntry = makeFileEntry();
    const item = manager.enqueue(fileEntry);

    const status = await donePromise;

    expect(status).toBe('error');
    expect(item.status).toBe('error');
    expect(item.error).toBe('chunk fetch failed');
    expect(onError).toHaveBeenCalledWith(item.id, 'chunk fetch failed');
  });

  it('limits concurrent downloads to the configured concurrency', async () => {
    let activeCount = 0;
    let maxActiveCount = 0;
    (downloadFile as jest.Mock).mockImplementation(async () => {
      activeCount++;
      maxActiveCount = Math.max(maxActiveCount, activeCount);
      await new Promise(resolve => setTimeout(resolve, 10));
      activeCount--;
    });

    const completedIds: string[] = [];
    const callbacks: DownloadManagerCallbacks = {
      onStatusChange: (id, status) => {
        if (status === 'complete') completedIds.push(id);
      },
    };
    const manager = new DownloadManager({ concurrency: 2 }, callbacks);

    const items = Array.from({ length: 4 }, (_, i) =>
      manager.enqueue(makeFileEntry({ id: `file-${i}` }))
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(maxActiveCount).toBeLessThanOrEqual(2);
    expect(completedIds.sort()).toEqual(items.map(item => item.id).sort());
  });
});
