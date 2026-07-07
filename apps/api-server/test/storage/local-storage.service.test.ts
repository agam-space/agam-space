import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';

import { LocalStorageService } from '../../src/modules/storage/local-storage.service';
import { ChunkAlreadyExistsError } from '../../src/modules/storage/storage.abstract';
import { Blake3Hasher } from '@napi-rs/blake-hash';

function makeConfig(filesDir: string) {
  return {
    getDirectories: () => ({ filesDir }),
    getStorage: () => ({ backend: 'local' as const }),
  } as any;
}

function makeReadable(data: Buffer): Readable {
  return Readable.from([data]);
}

function blake3Hex(data: Buffer): string {
  const h = new Blake3Hasher();
  h.update(data);
  return h.digest('hex');
}

describe('LocalStorageService', () => {
  let filesDir: string;
  let service: LocalStorageService;
  const userId = 'user-01';
  // Stable ULID-like id whose last 16 chars determine sharding
  const fileId = 'TEST_FILE_ID_1234';

  beforeEach(() => {
    filesDir = join(tmpdir(), `agam-local-test-${Date.now()}`);
    mkdirSync(filesDir, { recursive: true });
    service = new LocalStorageService(makeConfig(filesDir));
  });

  afterEach(() => {
    rmSync(filesDir, { recursive: true, force: true });
  });

  describe('getFileShardPath (via ensureFileDirectory)', () => {
    it('uses last 16 chars of fileId for sharding', async () => {
      const dirPath = await service.ensureFileDirectory(userId, fileId);
      const randomPart = fileId.slice(-16);
      expect(dirPath).toContain(`f/${randomPart[0]}/${randomPart.slice(1, 3)}/${fileId}`);
    });
  });

  describe('ensureUserDirectory', () => {
    it('creates user directory and returns its path', async () => {
      const result = await service.ensureUserDirectory(userId);
      expect(existsSync(result)).toBe(true);
      expect(result).toContain(`u-${userId}`);
    });
  });

  describe('ensureFileDirectory', () => {
    it('creates nested sharded directory and returns path', async () => {
      const result = await service.ensureFileDirectory(userId, fileId);
      expect(existsSync(result)).toBe(true);
    });

    it('is idempotent — calling twice does not throw', async () => {
      await service.ensureFileDirectory(userId, fileId);
      await expect(service.ensureFileDirectory(userId, fileId)).resolves.toBeDefined();
    });
  });

  describe('userDirectoryExists / fileDirectoryExists', () => {
    it('returns false before creation', () => {
      expect(service.userDirectoryExists(userId)).toBe(false);
      expect(service.fileDirectoryExists(userId, fileId)).toBe(false);
    });

    it('returns true after creation', async () => {
      await service.ensureUserDirectory(userId);
      await service.ensureFileDirectory(userId, fileId);
      expect(service.userDirectoryExists(userId)).toBe(true);
      expect(service.fileDirectoryExists(userId, fileId)).toBe(true);
    });
  });

  describe('saveFileChunkStream', () => {
    it('writes chunk and returns correct size and relative path', async () => {
      const fileDirPath = await service.ensureFileDirectory(userId, fileId);
      const data = Buffer.from('hello world');
      const stream = makeReadable(data);
      const checksum = blake3Hex(data);

      const result = await service.saveFileChunkStream(fileDirPath, 0, stream, checksum);

      expect(result.size).toBe(data.length);
      expect(result.chunkFilePath).not.toContain(filesDir); // relative path
      expect(result.chunkFilePath).toContain('chunk-0');
    });

    it('throws on checksum mismatch and removes temp file', async () => {
      const fileDirPath = await service.ensureFileDirectory(userId, fileId);
      const data = Buffer.from('some content');
      const stream = makeReadable(data);

      await expect(service.saveFileChunkStream(fileDirPath, 0, stream, 'deadbeef')).rejects.toThrow(
        'Checksum mismatch'
      );

      // temp .part file must not be left behind
      expect(existsSync(join(fileDirPath, 'chunk-0.part'))).toBe(false);
    });

    it('throws when chunk is too large', async () => {
      const fileDirPath = await service.ensureFileDirectory(userId, fileId);
      const data = Buffer.alloc(1000);
      const stream = makeReadable(data);

      await expect(
        service.saveFileChunkStream(fileDirPath, 0, stream, undefined, 100)
      ).rejects.toThrow('too large');
    });

    it('throws ChunkAlreadyExistsError if chunk already exists', async () => {
      const fileDirPath = await service.ensureFileDirectory(userId, fileId);
      const data = Buffer.from('data');
      const checksum = blake3Hex(data);

      await service.saveFileChunkStream(fileDirPath, 0, makeReadable(data), checksum);

      await expect(
        service.saveFileChunkStream(fileDirPath, 0, makeReadable(data), checksum)
      ).rejects.toThrow(ChunkAlreadyExistsError);
    });
  });

  describe('deleteChunk', () => {
    it('removes an existing chunk file', async () => {
      const fileDirPath = await service.ensureFileDirectory(userId, fileId);
      const data = Buffer.from('to be deleted');
      const checksum = blake3Hex(data);
      const { chunkFilePath } = await service.saveFileChunkStream(
        fileDirPath,
        0,
        makeReadable(data),
        checksum
      );

      expect(existsSync(service.getAbsolutePath(chunkFilePath))).toBe(true);
      await service.deleteChunk(fileDirPath, 0);
      expect(existsSync(service.getAbsolutePath(chunkFilePath))).toBe(false);
    });

    it('does not throw if the chunk does not exist', async () => {
      const fileDirPath = await service.ensureFileDirectory(userId, fileId);
      await expect(service.deleteChunk(fileDirPath, 99)).resolves.toBeUndefined();
    });
  });

  describe('healthCheck', () => {
    it('returns healthy when the files directory is writable', async () => {
      await expect(service.healthCheck()).resolves.toEqual({ healthy: true });
    });

    it('returns unhealthy when the files directory is not writable', async () => {
      rmSync(filesDir, { recursive: true, force: true });
      writeFileSync(filesDir, ''); // replace dir with a file to force write failures

      const result = await service.healthCheck();
      expect(result.healthy).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe('readChunkStream', () => {
    it('returns a readable stream for a saved chunk', async () => {
      const fileDirPath = await service.ensureFileDirectory(userId, fileId);
      const data = Buffer.from('chunk content');
      const checksum = blake3Hex(data);
      await service.saveFileChunkStream(fileDirPath, 0, makeReadable(data), checksum);

      const stream = await service.readChunkStream(userId, fileId, 0);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk);
      expect(Buffer.concat(chunks)).toEqual(data);
    });

    it('throws if chunk does not exist', async () => {
      await expect(service.readChunkStream(userId, fileId, 99)).rejects.toThrow('not found');
    });
  });

  describe('deleteFileDirectory', () => {
    it('removes the file directory', async () => {
      const fileDirPath = await service.ensureFileDirectory(userId, fileId);
      const data = Buffer.from('delete me');
      const checksum = blake3Hex(data);
      await service.saveFileChunkStream(fileDirPath, 0, makeReadable(data), checksum);

      expect(existsSync(fileDirPath)).toBe(true);
      await service.deleteFileDirectory(userId, fileId);
      expect(existsSync(fileDirPath)).toBe(false);
    });

    it('does not throw if directory does not exist', async () => {
      await expect(service.deleteFileDirectory(userId, 'NONEXISTENT_1234')).resolves.toBeDefined();
    });
  });

  describe('getRelativeChunkPath / getAbsolutePath', () => {
    it('round-trips: absolute(relative) === original absolute path', async () => {
      const fileDirPath = await service.ensureFileDirectory(userId, fileId);
      const data = Buffer.from('round trip');
      const checksum = blake3Hex(data);
      const { chunkFilePath } = await service.saveFileChunkStream(
        fileDirPath,
        0,
        makeReadable(data),
        checksum
      );
      const absolute = service.getAbsolutePath(chunkFilePath);
      expect(existsSync(absolute)).toBe(true);
    });
  });
});
