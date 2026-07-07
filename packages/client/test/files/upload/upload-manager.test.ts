import { blake3 } from '@noble/hashes/blake3';
import { toHex } from '@agam-space/core';
import type { RawFileMetadata, File as UserFile } from '@agam-space/shared-types';
import { UploadManager, UploadManagerCallbacks } from '../../../src/files/upload/upload-manager';
import { AbstractFileReader } from '../../../src/files/upload/abstract-file-reader';
import { UploadWorkerPool } from '../../../src/files/upload/upload-worker-pool';
import { UploadItem } from '../../../src/files/upload/types';

jest.mock('../../../src/files/file-manager', () => {
  return {
    FileManager: jest.fn().mockImplementation(() => ({
      prepareNewFileUpload: jest.fn().mockResolvedValue({
        nameHash: 'name-hash',
        metadataEncrypted: 'metadata-encrypted',
        fkWrapped: 'fk-wrapped',
        fileKey: new Uint8Array(32).fill(1),
      }),
    })),
  };
});

jest.mock('../../../src/api', () => ({
  ...jest.requireActual('../../../src/api'),
  createNewFileApi: jest.fn(),
  completeFileUploadApi: jest.fn(),
  uploadFileChunkApi: jest.fn(),
}));

import {
  createNewFileApi,
  completeFileUploadApi,
  uploadFileChunkApi,
  ApiClientError,
} from '../../../src/api';

class FakeFileReader implements AbstractFileReader {
  readonly size: number;

  constructor(
    private readonly chunks: Uint8Array[],
    private readonly metadata: RawFileMetadata
  ) {
    this.size = chunks.reduce((sum, c) => sum + c.length, 0);
  }

  getMetadata(): RawFileMetadata {
    return this.metadata;
  }

  getChunkCount(_chunkSize: number): number {
    return this.chunks.length;
  }

  async readChunk(): Promise<Uint8Array> {
    throw new Error('not implemented');
  }

  async readFileInChunks(
    _chunkSize: number,
    cb: (chunk: Uint8Array, chunkIndex: number, start: number, end: number) => Promise<void>
  ): Promise<void> {
    for (let i = 0; i < this.chunks.length; i++) {
      await cb(this.chunks[i], i, 0, 0);
    }
  }
}

/** Deterministic worker pool: "encrypts" a chunk by tagging it with its index, no real crypto. */
class FakeWorkerPool implements UploadWorkerPool {
  constructor(private readonly delayForIndex: (chunkIndex: number) => number = () => 0) {}

  async encryptChunk(
    chunkIndex: number,
    chunk: Uint8Array,
    _fileKey: Uint8Array
  ): Promise<{ encChunk: Uint8Array; checksum: string }> {
    const delay = this.delayForIndex(chunkIndex);
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    return { encChunk: chunk, checksum: `checksum-${chunkIndex}` };
  }
}

function expectedFileChecksum(chunkCount: number): string {
  const hasher = blake3.create();
  for (let i = 0; i < chunkCount; i++) {
    hasher.update(`checksum-${i}`);
  }
  return toHex(hasher.digest());
}

function makeMetadata(overrides: Partial<RawFileMetadata> = {}): RawFileMetadata {
  return {
    name: 'report.pdf',
    size: 3,
    mimeType: 'application/pdf',
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeFileResponse(overrides: Partial<UserFile> = {}): UserFile {
  return {
    id: 'file-1',
    userId: 'user-1',
    parentId: null,
    nameHash: 'name-hash',
    fkWrapped: 'fk-wrapped',
    metadataEncrypted: 'metadata-encrypted',
    chunkCount: 3,
    approxSize: 3n,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as UserFile;
}

/** Waits until the item reaches a terminal status ('complete' or 'error') via callbacks. */
function waitForTerminalStatus(callbacks: UploadManagerCallbacks): Promise<{
  status: 'complete' | 'error';
  fileEntry?: ReturnType<UploadManager['toFileEntry']>;
  error?: string;
}> {
  return new Promise(resolve => {
    const originalOnStatusChange = callbacks.onStatusChange;
    const originalOnError = callbacks.onError;

    callbacks.onStatusChange = (id, status, fileEntry) => {
      originalOnStatusChange?.(id, status, fileEntry);
      if (status === 'complete') {
        resolve({ status: 'complete', fileEntry });
      }
    };

    callbacks.onError = (id, error) => {
      originalOnError?.(id, error);
      resolve({ status: 'error', error });
    };
  });
}

describe('UploadManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('enqueue', () => {
    it('rejects files exceeding the configured max size without starting upload', () => {
      const onError = jest.fn();
      const manager = new UploadManager(
        { concurrency: 2, chunkSize: 1_000, maxFileSize: 10 },
        { onError }
      );
      const reader = new FakeFileReader([new Uint8Array(20)], makeMetadata({ size: 20 }));

      const item = manager.enqueue(reader, null);

      expect(item?.status).toBe('error');
      expect(item?.error).toMatch(/exceeds maximum limit/);
      expect(onError).toHaveBeenCalledWith(item!.id, item!.error);
      expect(createNewFileApi).not.toHaveBeenCalled();
    });

    it('queues an accepted file for processing with pending status', async () => {
      (createNewFileApi as jest.Mock).mockResolvedValue(makeFileResponse({ chunkCount: 1 }));
      (uploadFileChunkApi as jest.Mock).mockResolvedValue(undefined);
      (completeFileUploadApi as jest.Mock).mockResolvedValue(makeFileResponse({ chunkCount: 1 }));

      const callbacks: UploadManagerCallbacks = {};
      const donePromise = waitForTerminalStatus(callbacks);

      const manager = new UploadManager(
        { concurrency: 2, chunkSize: 1_000, maxFileSize: 1_000_000 },
        callbacks,
        new FakeWorkerPool()
      );
      const reader = new FakeFileReader([new Uint8Array(3)], makeMetadata({ size: 3 }));

      const item = manager.enqueue(reader, null);

      expect(item).not.toBeNull();
      expect(item!.parentId).toBeNull();

      // Drain the background upload so it doesn't leak into the next test's mocks.
      await donePromise;
    });
  });

  describe('pipelined upload', () => {
    it('uploads chunks and computes the final checksum in index order regardless of completion order', async () => {
      const chunks = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];
      const reader = new FakeFileReader(chunks, makeMetadata({ size: 3 }));

      (createNewFileApi as jest.Mock).mockResolvedValue(makeFileResponse({ chunkCount: 3 }));
      (uploadFileChunkApi as jest.Mock).mockImplementation(
        async (_fileId: string, chunkIndex: number) => {
          // Chunk 2 resolves fastest, chunk 0 slowest — completion order != index order.
          const delay = [30, 10, 0][chunkIndex];
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      );
      (completeFileUploadApi as jest.Mock).mockResolvedValue(makeFileResponse({ chunkCount: 3 }));

      const callbacks: UploadManagerCallbacks = {};
      const donePromise = waitForTerminalStatus(callbacks);

      const manager = new UploadManager(
        { concurrency: 2, chunkSize: 1_000, maxFileSize: 1_000_000 },
        callbacks,
        new FakeWorkerPool()
      );
      manager.enqueue(reader, null);

      const result = await donePromise;

      expect(result.status).toBe('complete');
      expect(uploadFileChunkApi).toHaveBeenCalledTimes(3);
      expect(completeFileUploadApi).toHaveBeenCalledWith('file-1', expectedFileChecksum(3));
    });

    it('reports progress as chunks complete, ending at 100%', async () => {
      const chunks = [new Uint8Array(2), new Uint8Array(2)];
      const reader = new FakeFileReader(chunks, makeMetadata({ size: 4 }));

      (createNewFileApi as jest.Mock).mockResolvedValue(makeFileResponse({ chunkCount: 2 }));
      (uploadFileChunkApi as jest.Mock).mockResolvedValue(undefined);
      (completeFileUploadApi as jest.Mock).mockResolvedValue(makeFileResponse({ chunkCount: 2 }));

      const onProgress = jest.fn();
      const callbacks: UploadManagerCallbacks = { onProgress };
      const donePromise = waitForTerminalStatus(callbacks);

      const manager = new UploadManager(
        { concurrency: 2, chunkSize: 1_000, maxFileSize: 1_000_000 },
        callbacks,
        new FakeWorkerPool()
      );
      manager.enqueue(reader, null);

      await donePromise;

      expect(onProgress).toHaveBeenCalled();
      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][1];
      expect(lastCall.percent).toBe(100);
      expect(lastCall.uploadedBytes).toBe(4);
      expect(lastCall.totalBytes).toBe(4);
    });

    it('notifies completion with a FileEntry derived from the upload item', async () => {
      const reader = new FakeFileReader(
        [new Uint8Array([9])],
        makeMetadata({ name: 'photo.jpg', size: 1 })
      );

      (createNewFileApi as jest.Mock).mockResolvedValue(
        makeFileResponse({ id: 'file-42', chunkCount: 1, nameHash: 'photo-hash' })
      );
      (uploadFileChunkApi as jest.Mock).mockResolvedValue(undefined);
      (completeFileUploadApi as jest.Mock).mockResolvedValue(makeFileResponse({ chunkCount: 1 }));

      const callbacks: UploadManagerCallbacks = {};
      const donePromise = waitForTerminalStatus(callbacks);

      const manager = new UploadManager(
        { concurrency: 2, chunkSize: 1_000, maxFileSize: 1_000_000 },
        callbacks,
        new FakeWorkerPool()
      );
      manager.enqueue(reader, 'parent-folder');

      const result = await donePromise;

      expect(result.status).toBe('complete');
      expect(result.fileEntry).toMatchObject({
        id: 'file-42',
        name: 'photo.jpg',
        nameHash: 'photo-hash',
        parentId: 'parent-folder',
        isFolder: false,
      });
    });
  });

  describe('conflict and error handling', () => {
    it('marks the item as error without throwing when the server reports a conflict', async () => {
      const reader = new FakeFileReader([new Uint8Array([1])], makeMetadata({ size: 1 }));

      const conflictResponse = new Response(null, { status: 409, statusText: 'Conflict' });
      (createNewFileApi as jest.Mock).mockRejectedValue(
        new ApiClientError('File already exists', 409, conflictResponse, {
          message: 'File already exists',
        })
      );

      const onError = jest.fn();
      const callbacks: UploadManagerCallbacks = { onError };
      const donePromise = waitForTerminalStatus(callbacks);

      const manager = new UploadManager(
        { concurrency: 2, chunkSize: 1_000, maxFileSize: 1_000_000 },
        callbacks,
        new FakeWorkerPool()
      );
      manager.enqueue(reader, null);

      const result = await donePromise;

      expect(result.status).toBe('error');
      expect(result.error).toBe('File already exists');
      expect(onError).toHaveBeenCalledTimes(1);
      expect(completeFileUploadApi).not.toHaveBeenCalled();
    });

    it('marks the item as error on unexpected upload failures', async () => {
      const reader = new FakeFileReader([new Uint8Array([1])], makeMetadata({ size: 1 }));

      (createNewFileApi as jest.Mock).mockResolvedValue(makeFileResponse({ chunkCount: 1 }));
      (uploadFileChunkApi as jest.Mock).mockRejectedValue(new Error('network timeout'));

      const onError = jest.fn();
      const callbacks: UploadManagerCallbacks = { onError };
      const donePromise = waitForTerminalStatus(callbacks);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const manager = new UploadManager(
        { concurrency: 2, chunkSize: 1_000, maxFileSize: 1_000_000 },
        callbacks,
        new FakeWorkerPool()
      );
      manager.enqueue(reader, null);

      const result = await donePromise;

      expect(result.status).toBe('error');
      expect(result.error).toBe('network timeout');
      expect(completeFileUploadApi).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('toFileEntry', () => {
    it('throws when required fields are missing', () => {
      const manager = new UploadManager();
      const incompleteItem = {
        id: 'x',
        parentId: null,
        status: 'pending',
        progress: 0,
      } as unknown as UploadItem;

      expect(() => manager.toFileEntry(incompleteItem as any)).toThrow(
        'Cannot convert to FileEntry: missing fileId or fileMetadata'
      );
    });
  });
});
