import { randomBytes } from '@agam-space/core';
import { EncryptedEnvelopeCodec } from '@agam-space/core';
import { XChaChaV1Strategy } from '../../src/crypto/xchacha';
import { FileEntry } from '../../src/content-tree/entities';

jest.mock('../../src/files/write-file-to-blob', () => ({
  writeFileStreamToBlob: jest.fn(),
}));
jest.mock('../../src/files/download/write-file-to-fs', () => ({
  writeFileStreamToFs: jest.fn(),
}));
jest.mock('../../src/files/file-decrypt', () => ({
  ...jest.requireActual('../../src/files/file-decrypt'),
  getDecryptedFileKeyById: jest.fn(),
}));
jest.mock('../../src/api', () => ({
  ...jest.requireActual('../../src/api'),
  fetchFileChunkApi: jest.fn(),
}));

import { downloadFile, decryptAndMergeFileChunks } from '../../src/files/download';
import { writeFileStreamToBlob } from '../../src/files/write-file-to-blob';
import { writeFileStreamToFs } from '../../src/files/download/write-file-to-fs';
import { getDecryptedFileKeyById } from '../../src/files/file-decrypt';
import { fetchFileChunkApi } from '../../src/api';

const strategy = new XChaChaV1Strategy();

async function encryptChunks(chunks: Uint8Array[], fileKey: Uint8Array): Promise<Uint8Array[]> {
  return Promise.all(
    chunks.map(async chunk => {
      const envelope = await strategy.encrypt(chunk, fileKey);
      return EncryptedEnvelopeCodec.serializeToTLV(envelope);
    })
  );
}

function makeFileEntry(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    id: 'file-1',
    name: 'document.pdf',
    nameHash: 'hash',
    size: 10,
    mime: 'application/pdf',
    parentId: 'root',
    isFolder: false,
    chunkCount: 1,
    ...overrides,
  };
}

describe('decryptAndMergeFileChunks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches, decrypts, and merges chunks in order', async () => {
    const fileKey = randomBytes(32);
    const plainChunks = [
      new TextEncoder().encode('hello '),
      new TextEncoder().encode('world '),
      new TextEncoder().encode('again'),
    ];
    const encryptedChunks = await encryptChunks(plainChunks, fileKey);

    (getDecryptedFileKeyById as jest.Mock).mockResolvedValue(fileKey);
    (fetchFileChunkApi as jest.Mock).mockImplementation(
      async (_fileId: string, index: number) => encryptedChunks[index]
    );

    const merged = await decryptAndMergeFileChunks({ fileId: 'file-1', totalChunks: 3 });

    expect(new TextDecoder().decode(merged)).toBe('hello world again');
    expect(fetchFileChunkApi).toHaveBeenCalledTimes(3);
  });

  it('propagates decryption failures', async () => {
    const fileKey = randomBytes(32);
    const wrongKey = randomBytes(32);
    const [encrypted] = await encryptChunks([new TextEncoder().encode('secret')], fileKey);

    (getDecryptedFileKeyById as jest.Mock).mockResolvedValue(wrongKey);
    (fetchFileChunkApi as jest.Mock).mockResolvedValue(encrypted);

    await expect(decryptAndMergeFileChunks({ fileId: 'file-1', totalChunks: 1 })).rejects.toThrow();
  });
});

describe('downloadFile', () => {
  const originalWindow = (global as any).window;

  beforeEach(() => {
    jest.clearAllMocks();
    (getDecryptedFileKeyById as jest.Mock).mockResolvedValue(randomBytes(32));
    (fetchFileChunkApi as jest.Mock).mockResolvedValue(new Uint8Array());
  });

  afterEach(() => {
    (global as any).window = originalWindow;
  });

  it('writes small files via Blob without checking for the File System Access API', async () => {
    (global as any).window = {};
    const fileEntry = makeFileEntry({ size: 1024, chunkCount: 0 });

    await downloadFile(fileEntry);

    expect(writeFileStreamToBlob).toHaveBeenCalledWith(fileEntry.name, expect.anything());
    expect(writeFileStreamToFs).not.toHaveBeenCalled();
  });

  it('streams large files to disk when the File System Access API is available', async () => {
    (global as any).window = { showSaveFilePicker: jest.fn() };
    const fileEntry = makeFileEntry({ size: 100 * 1024 * 1024, chunkCount: 0 });

    await downloadFile(fileEntry);

    expect(writeFileStreamToFs).toHaveBeenCalledWith(fileEntry.name, expect.anything());
    expect(writeFileStreamToBlob).not.toHaveBeenCalled();
  });

  it('throws for large files on non-Chromium browsers', async () => {
    (global as any).window = {};
    const fileEntry = makeFileEntry({ size: 100 * 1024 * 1024, chunkCount: 0 });

    await expect(downloadFile(fileEntry)).rejects.toThrow(
      'Downloading large files is only supported on Chromium browsers.'
    );
    expect(writeFileStreamToBlob).not.toHaveBeenCalled();
    expect(writeFileStreamToFs).not.toHaveBeenCalled();
  });

  it('reports chunk progress via the onChunkDownloaded callback', async () => {
    const fileKey = randomBytes(32);
    const [encrypted] = await encryptChunks([new Uint8Array(50)], fileKey);
    (getDecryptedFileKeyById as jest.Mock).mockResolvedValue(fileKey);
    (fetchFileChunkApi as jest.Mock).mockResolvedValue(encrypted);
    (global as any).window = {};

    // Drain the async generator, mirroring what a real Blob/FS writer would do.
    (writeFileStreamToBlob as jest.Mock).mockImplementation(
      async (_name: string, stream: AsyncGenerator<Uint8Array>) => {
        for await (const _chunk of stream) {
          // no-op
        }
      }
    );

    const fileEntry = makeFileEntry({ size: 50, chunkCount: 1 });
    const onChunkDownloaded = jest.fn();

    await downloadFile(fileEntry, onChunkDownloaded);

    expect(onChunkDownloaded).toHaveBeenCalledWith(0, encrypted.length);
  });
});
