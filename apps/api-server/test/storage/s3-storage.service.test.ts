import { Readable } from 'node:stream';

import { S3StorageService } from '../../src/modules/storage/s3-storage.service';
import { ChunkAlreadyExistsError } from '../../src/modules/storage/storage.abstract';
import { Blake3Hasher } from '@napi-rs/blake-hash';

// ---------------------------------------------------------------------------
// Mock AWS SDK — must be hoisted before any imports that pull the SDK in
// ---------------------------------------------------------------------------
const mockSend = jest.fn();
const mockUploadDone = jest.fn();
const mockUploadAbort = jest.fn();
const mockMiddlewareAdd = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: mockSend,
    middlewareStack: { add: mockMiddlewareAdd },
  })),
  GetObjectCommand: jest.fn(params => ({ _cmd: 'GetObject', ...params })),
  DeleteObjectCommand: jest.fn(params => ({ _cmd: 'DeleteObject', ...params })),
  DeleteObjectsCommand: jest.fn(params => ({ _cmd: 'DeleteObjects', ...params })),
  ListObjectsV2Command: jest.fn(params => ({ _cmd: 'ListObjectsV2', ...params })),
  HeadObjectCommand: jest.fn(params => ({ _cmd: 'HeadObject', ...params })),
  HeadBucketCommand: jest.fn(params => ({ _cmd: 'HeadBucket', ...params })),
  NoSuchKey: class NoSuchKey extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'NoSuchKey';
    }
  },
  S3ServiceException: class S3ServiceException extends Error {
    $metadata: { httpStatusCode: number };
    constructor(msg: string, statusCode = 500) {
      super(msg);
      this.$metadata = { httpStatusCode: statusCode };
    }
  },
}));

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation(() => ({
    done: mockUploadDone,
    abort: mockUploadAbort,
  })),
}));

// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<{ endpoint: string; pathStyleEndpoint: boolean }>) {
  return {
    getStorage: () => ({
      backend: 's3' as const,
      s3: {
        bucket: 'test-bucket',
        region: 'auto',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        pathStyleEndpoint: false,
        ...overrides,
      },
    }),
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

describe('S3StorageService', () => {
  let service: S3StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: HeadObject "not found" (no pre-existing chunk), all other SDK calls succeed;
    // individual tests override with mockResolvedValueOnce/mockRejectedValueOnce.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { S3ServiceException: MockS3ServiceException } = require('@aws-sdk/client-s3');
    mockSend.mockImplementation((cmd: { _cmd?: string }) => {
      if (cmd?._cmd === 'HeadObject') {
        return Promise.reject(new MockS3ServiceException('Not Found', 404));
      }
      return Promise.resolve({});
    });
    mockUploadDone.mockResolvedValue({});
    mockUploadAbort.mockResolvedValue({});
    service = new S3StorageService(makeConfig());
  });

  // -------------------------------------------------------------------------
  // Key / path helpers
  // -------------------------------------------------------------------------
  describe('getRelativeChunkPath', () => {
    it('produces u-{userId}/f/{s1}/{s2}/{fileId}/chunk-{n}', () => {
      const fileId = 'TEST_FILE_ID_1234';
      const key = service.getRelativeChunkPath('user-01', fileId, 0);
      const randomPart = fileId.slice(-16);
      const expected = `u-user-01/f/${randomPart[0]}/${randomPart.slice(1, 3)}/${fileId}/chunk-0`;
      expect(key).toBe(expected);
    });
  });

  describe('ensureFileDirectory', () => {
    it('returns the S3 key prefix (no-op, no SDK calls)', async () => {
      const prefix = await service.ensureFileDirectory('user-01', 'FILE_1234567890ABCD');
      expect(prefix).toMatch(/^u-user-01\/f\//);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('userDirectoryExists / fileDirectoryExists', () => {
    it('always returns true (S3 has no real directories)', () => {
      expect(service.userDirectoryExists('any')).toBe(true);
      expect(service.fileDirectoryExists('any', 'any')).toBe(true);
    });
  });

  describe('getAbsolutePath / getFilesDir', () => {
    it('getAbsolutePath returns the key unchanged', () => {
      expect(service.getAbsolutePath('u-foo/f/a/bc/bar/chunk-0')).toBe('u-foo/f/a/bc/bar/chunk-0');
    });

    it('getFilesDir returns the bucket name', () => {
      expect(service.getFilesDir()).toBe('test-bucket');
    });
  });

  // -------------------------------------------------------------------------
  // saveFileChunkStream
  // -------------------------------------------------------------------------
  describe('saveFileChunkStream', () => {
    it('uploads stream to S3 and returns correct size and key', async () => {
      const data = Buffer.from('hello s3');
      const checksum = blake3Hex(data);
      const fileDirPath = await service.ensureFileDirectory('user-01', 'FILE_1234567890ABCD');

      const result = await service.saveFileChunkStream(
        fileDirPath,
        0,
        makeReadable(data),
        checksum
      );

      expect(result.size).toBe(data.length);
      expect(result.chunkFilePath).toContain('chunk-0');
      expect(mockUploadDone).toHaveBeenCalled();
    });

    it('throws and aborts upload on checksum mismatch', async () => {
      const data = Buffer.from('mismatch test');
      const fileDirPath = await service.ensureFileDirectory('user-01', 'FILE_1234567890ABCD');

      await expect(
        service.saveFileChunkStream(fileDirPath, 0, makeReadable(data), 'wrong-checksum')
      ).rejects.toThrow('Checksum mismatch');

      // The orphaned object should be cleaned up
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ _cmd: 'DeleteObject' }));
    });

    it('aborts upload and re-throws when SDK upload fails', async () => {
      mockUploadDone.mockRejectedValueOnce(new Error('S3 network error'));
      const data = Buffer.from('upload error test');
      const fileDirPath = await service.ensureFileDirectory('user-01', 'FILE_1234567890ABCD');

      await expect(service.saveFileChunkStream(fileDirPath, 0, makeReadable(data))).rejects.toThrow(
        'S3 network error'
      );

      expect(mockUploadAbort).toHaveBeenCalled();
    });

    it('throws on oversized chunk', async () => {
      const data = Buffer.alloc(1000);
      const fileDirPath = await service.ensureFileDirectory('user-01', 'FILE_1234567890ABCD');

      await expect(
        service.saveFileChunkStream(fileDirPath, 0, makeReadable(data), undefined, 100)
      ).rejects.toThrow('too large');
    });

    it('throws ChunkAlreadyExistsError if chunk already exists', async () => {
      const data = Buffer.from('duplicate test');
      const fileDirPath = await service.ensureFileDirectory('user-01', 'FILE_1234567890ABCD');

      // HeadObjectCommand resolves => object already exists
      mockSend.mockResolvedValueOnce({});

      await expect(service.saveFileChunkStream(fileDirPath, 0, makeReadable(data))).rejects.toThrow(
        ChunkAlreadyExistsError
      );
      expect(mockUploadDone).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // deleteChunk
  // -------------------------------------------------------------------------
  describe('deleteChunk', () => {
    it('sends a DeleteObjectCommand for the chunk key', async () => {
      const fileDirPath = await service.ensureFileDirectory('user-01', 'FILE_1234567890ABCD');
      await service.deleteChunk(fileDirPath, 0);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ _cmd: 'DeleteObject', Key: `${fileDirPath}/chunk-0` })
      );
    });
  });

  // -------------------------------------------------------------------------
  // readChunkStream
  // -------------------------------------------------------------------------
  describe('readChunkStream', () => {
    it('returns the S3 response body stream', async () => {
      const body = Readable.from([Buffer.from('chunk data')]);
      mockSend.mockResolvedValueOnce({ Body: body });

      const result = await service.readChunkStream('user-01', 'FILE_1234567890ABCD', 0);
      expect(result).toBe(body);
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ _cmd: 'GetObject' }));
    });

    it('throws NotFoundException when key does not exist', async () => {
      // Use require to bypass TS type checking on the mock constructor signature
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { NoSuchKey: MockNoSuchKey } = require('@aws-sdk/client-s3');
      mockSend.mockRejectedValueOnce(new MockNoSuchKey('not found'));

      await expect(service.readChunkStream('user-01', 'FILE_1234567890ABCD', 0)).rejects.toThrow(
        'not found'
      );
    });
  });

  // -------------------------------------------------------------------------
  // onModuleInit
  // -------------------------------------------------------------------------
  describe('onModuleInit', () => {
    it('resolves when the bucket is reachable', async () => {
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ _cmd: 'HeadBucket' }),
        expect.objectContaining({ abortSignal: expect.anything() })
      );
    });

    it('throws a descriptive error when the bucket does not exist', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { S3ServiceException: MockS3ServiceException } = require('@aws-sdk/client-s3');
      mockSend.mockRejectedValueOnce(new MockS3ServiceException('Not Found', 404));

      await expect(service.onModuleInit()).rejects.toThrow('does not exist');
    });

    it('throws a descriptive error on access denied', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { S3ServiceException: MockS3ServiceException } = require('@aws-sdk/client-s3');
      mockSend.mockRejectedValueOnce(new MockS3ServiceException('Forbidden', 403));

      await expect(service.onModuleInit()).rejects.toThrow('access denied');
    });

    it('throws a descriptive error on network failure', async () => {
      mockSend.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND minio'));

      await expect(service.onModuleInit()).rejects.toThrow('getaddrinfo ENOTFOUND minio');
    });
  });

  // -------------------------------------------------------------------------
  // healthCheck
  // -------------------------------------------------------------------------
  describe('healthCheck', () => {
    it('returns healthy when the bucket is reachable', async () => {
      await expect(service.healthCheck()).resolves.toEqual({ healthy: true });
    });

    it('returns unhealthy with a reason when the bucket is unreachable', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { S3ServiceException: MockS3ServiceException } = require('@aws-sdk/client-s3');
      mockSend.mockRejectedValueOnce(new MockS3ServiceException('Forbidden', 403));

      const result = await service.healthCheck();
      expect(result.healthy).toBe(false);
      expect(result.message).toContain('access denied');
    });
  });

  // -------------------------------------------------------------------------
  // DeleteObjects MD5 checksum fallback (R2 / non-AWS provider compatibility)
  // -------------------------------------------------------------------------
  describe('installDeleteObjectsMd5Fallback', () => {
    function getInstalledMiddleware() {
      expect(mockMiddlewareAdd).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ step: 'build', priority: 'low' })
      );
      const middleware = mockMiddlewareAdd.mock.calls[0][0];
      const next = jest.fn(async (a: unknown) => a);
      return { handler: middleware(next, { commandName: undefined }), next };
    }

    it('is registered on the client middleware stack after normal-priority middleware', () => {
      getInstalledMiddleware();
    });

    it('strips checksum headers and adds Content-MD5 for DeleteObjectsCommand', async () => {
      const middleware = mockMiddlewareAdd.mock.calls[0][0];
      const next = jest.fn(async (a: unknown) => a);
      const handler = middleware(next, { commandName: 'DeleteObjectsCommand' });

      const headers: Record<string, string> = {
        'x-amz-checksum-crc32': 'abc123==',
        'x-amz-sdk-checksum-algorithm': 'CRC32',
        'content-type': 'application/xml',
      };
      const body = Buffer.from('<Delete></Delete>');

      await handler({ request: { headers, body } });

      expect(headers['x-amz-checksum-crc32']).toBeUndefined();
      expect(headers['x-amz-sdk-checksum-algorithm']).toBeUndefined();
      expect(headers['content-type']).toBe('application/xml');
      expect(headers['content-md5']).toBe(
        require('node:crypto').createHash('md5').update(body).digest('base64')
      );
      expect(next).toHaveBeenCalled();
    });

    it('does not touch other commands', async () => {
      const { handler, next } = getInstalledMiddleware();
      const headers = { 'x-amz-checksum-crc32': 'abc123==' };

      await handler({ request: { headers, body: Buffer.from('data') } });

      expect(headers['x-amz-checksum-crc32']).toBe('abc123==');
      expect(next).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // deleteFileDirectory
  // -------------------------------------------------------------------------
  describe('deleteFileDirectory', () => {
    it('lists objects under prefix and deletes them in batch', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'u-user-01/f/x/xx/fileId/chunk-0' }],
          IsTruncated: false,
        })
        .mockResolvedValueOnce({}); // DeleteObjects response

      await service.deleteFileDirectory('user-01', 'fileId_____________x');

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ _cmd: 'ListObjectsV2' }));
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ _cmd: 'DeleteObjects' }));
    });

    it('handles empty prefix (no objects) without calling DeleteObjects', async () => {
      mockSend.mockResolvedValueOnce({ Contents: [], IsTruncated: false });

      await service.deleteFileDirectory('user-01', 'EMPTY_FILE_ID_1234');

      expect(mockSend).toHaveBeenCalledTimes(1); // only ListObjectsV2
    });

    it('paginates when IsTruncated=true', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'chunk-0' }],
          IsTruncated: true,
          NextContinuationToken: 'tok',
        })
        .mockResolvedValueOnce({}) // DeleteObjects page 1
        .mockResolvedValueOnce({
          Contents: [{ Key: 'chunk-1' }],
          IsTruncated: false,
        })
        .mockResolvedValueOnce({}); // DeleteObjects page 2

      await service.deleteFileDirectory('user-01', 'PAGINATED_FILE_ID_X');

      // 2 list + 2 delete = 4 calls
      expect(mockSend).toHaveBeenCalledTimes(4);
    });
  });
});
