import { createHash } from 'node:crypto';
import { PassThrough, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Blake3Hasher } from '@napi-rs/blake-hash';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';

import { AppConfigService } from '../../config/config.service';
import { ChunkAlreadyExistsError, StorageHealth, StorageService } from './storage.abstract';

const BUCKET_CHECK_TIMEOUT_MS = 8000;

@Injectable()
export class S3StorageService extends StorageService implements OnModuleInit {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly endpoint?: string;

  constructor(private readonly configService: AppConfigService) {
    super();
    const s3Config = configService.getStorage().s3!;
    this.bucket = s3Config.bucket;
    this.endpoint = s3Config.endpoint;
    this.s3 = new S3Client({
      region: s3Config.region,
      ...(s3Config.endpoint ? { endpoint: s3Config.endpoint } : {}),
      forcePathStyle: s3Config.pathStyleEndpoint,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      },
      // Most non-AWS S3-compatible providers don't support the SDK's default
      // CRC32 request checksums — only attach them when a provider requires it.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    S3StorageService.installDeleteObjectsMd5Fallback(this.s3);
    this.logger.log(
      `☁️  S3 storage initialized: bucket=${this.bucket} endpoint=${s3Config.endpoint ?? 'AWS'}`
    );
  }

  /**
   * Fail fast on startup if the bucket is unreachable or misconfigured —
   * mirrors the DATA_DIR write check done for the local storage backend.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.headBucketWithTimeout();
      this.logger.log(`✅ S3 bucket reachable: ${this.bucket}`);
    } catch (e) {
      const reason = this.describeConnectionError(e);
      throw new Error(
        `S3 storage validation failed (bucket=${this.bucket}, endpoint=${this.endpoint ?? 'AWS default'}): ${reason}. ` +
          'Check STORAGE_BACKEND=s3 config: S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PATH_STYLE_ENDPOINT.',
        { cause: e }
      );
    }
  }

  async healthCheck(): Promise<StorageHealth> {
    try {
      await this.headBucketWithTimeout();
      return { healthy: true };
    } catch (e) {
      return { healthy: false, message: this.describeConnectionError(e) };
    }
  }

  /** Bounds the HeadBucket call so an unreachable endpoint fails fast instead of hanging. */
  private async headBucketWithTimeout(timeoutMs = BUCKET_CHECK_TIMEOUT_MS): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }), {
        abortSignal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private describeConnectionError(e: unknown): string {
    if (e instanceof S3ServiceException) {
      const status = e.$metadata.httpStatusCode;
      if (status === 404) return `bucket "${this.bucket}" does not exist`;
      if (status === 403) return 'access denied - check credentials and bucket permissions';
      return `${e.name}: ${e.message}`;
    }
    if (e instanceof Error) {
      if (e.name === 'AbortError') {
        return `timed out after ${BUCKET_CHECK_TIMEOUT_MS}ms — endpoint may be unreachable`;
      }
      return e.message;
    }
    return String(e);
  }

  // S3 has no real directories — return the key prefix so callers can pass it to saveFileChunkStream
  async ensureUserDirectory(userId: string): Promise<string> {
    return `u-${userId}`;
  }

  async ensureFileDirectory(userId: string, fileId: string): Promise<string> {
    return `u-${userId}/${this.getFileShardPath(fileId)}`;
  }

  async deleteFileDirectory(userId: string, fileId: string): Promise<string> {
    const prefix = `u-${userId}/${this.getFileShardPath(fileId)}/`;
    await this.deleteObjectsByPrefix(prefix);
    return prefix;
  }

  // S3 has no directory concept; existence is always assumed valid
  userDirectoryExists(_userId: string): boolean {
    return true;
  }

  fileDirectoryExists(_userId: string, _fileId: string): boolean {
    return true;
  }

  async readChunkStream(userId: string, fileId: string, chunkIndex: number): Promise<Readable> {
    const key = this.getRelativeChunkPath(userId, fileId, chunkIndex);
    try {
      const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return response.Body as Readable;
    } catch (e) {
      this.mapS3Error(e, key);
    }
  }

  async saveFileChunkStream(
    fileDirPath: string,
    chunkIndex: number,
    stream: Readable,
    checksum?: string,
    neededChunkSize?: number
  ): Promise<{ size: number; chunkFilePath: string }> {
    const key = `${fileDirPath}/chunk-${chunkIndex}`;

    if (await this.objectExists(key)) {
      throw new ChunkAlreadyExistsError(key);
    }

    const hasher = new Blake3Hasher();
    let size = 0;

    const passThrough = new PassThrough();

    const hashingTransform = new Transform({
      transform(chunk, _, cb) {
        hasher.update(chunk);
        size += chunk.length;
        if (neededChunkSize && size > neededChunkSize * 1.01) {
          return cb(new Error(`Chunk too large: received ${size} bytes`));
        }
        cb(null, chunk);
      },
    });

    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: passThrough,
        ContentType: 'application/octet-stream',
      },
      // queueSize=1 prevents the SDK from buffering multiple parts ahead;
      // partSize matches default chunk size to minimise multipart overhead.
      queueSize: 1,
      partSize: 8 * 1024 * 1024,
      leavePartsOnError: false,
    });

    try {
      // pipeline pushes bytes through the hasher into passThrough;
      // upload.done() consumes passThrough and streams to S3 — no full buffering.
      await Promise.all([pipeline(stream, hashingTransform, passThrough), upload.done()]);
    } catch (e) {
      await upload.abort().catch(() => {});
      throw e;
    }

    const actualChecksum = hasher.digest('hex');
    if (checksum && checksum !== actualChecksum) {
      await this.s3
        .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
        .catch(() => {});
      throw new Error(`Checksum mismatch: expected ${checksum}, got ${actualChecksum}`);
    }

    return { size, chunkFilePath: key };
  }

  async deleteChunk(fileDirPath: string, chunkIndex: number): Promise<void> {
    const key = `${fileDirPath}/chunk-${chunkIndex}`;
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  getRelativeChunkPath(userId: string, fileId: string, chunkIndex: number): string {
    return `u-${userId}/${this.getFileShardPath(fileId)}/chunk-${chunkIndex}`;
  }

  // S3 keys are already the canonical path — no prefix to add
  getAbsolutePath(relativePath: string): string {
    return relativePath;
  }

  getFilesDir(): string {
    return this.bucket;
  }

  private async deleteObjectsByPrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;

    do {
      const list = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      const keys = (list.Contents ?? []).map(obj => ({ Key: obj.Key! }));

      if (keys.length > 0) {
        await this.s3.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys, Quiet: true },
          })
        );
        this.logger.log(`🗑️ Deleted ${keys.length} S3 objects under prefix: ${prefix}`);
      }

      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  private async objectExists(key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (e) {
      if (this.isNotFoundError(e)) return false;
      throw e;
    }
  }

  private isNotFoundError(e: unknown): boolean {
    if (e instanceof NoSuchKey) return true;
    return e instanceof S3ServiceException && e.$metadata.httpStatusCode === 404;
  }

  private mapS3Error(e: unknown, key: string): never {
    if (this.isNotFoundError(e)) {
      throw new NotFoundException(`Chunk not found: ${key}`);
    }
    if (e instanceof S3ServiceException) {
      this.logger.error(`S3 error for key ${key}: ${e.message}`);
      throw new InternalServerErrorException(`S3 error: ${e.message}`);
    }
    throw e;
  }

  /**
   * DeleteObjectsCommand hard-codes `requestChecksumRequired: true` in the SDK,
   * so `requestChecksumCalculation: 'WHEN_REQUIRED'` can't opt it out — it's the
   * one operation that still always attaches a CRC32 checksum header some
   * S3-compatible providers reject. Swap it for a Content-MD5 header instead,
   * scoped to just this command, per AWS's documented workaround:
   * https://github.com/aws/aws-sdk-js-v3/blob/main/supplemental-docs/MD5_FALLBACK.md
   *
   * Registered with `priority: 'low'` in the same 'build' step that the SDK's
   * own `flexibleChecksumsMiddleware` uses (at 'normal' priority), so it always
   * runs after it — without depending on that middleware being present, since
   * it isn't added for every command (e.g. HeadBucketCommand has none, which
   * made the previous addRelativeTo-based approach throw for it).
   */
  private static installDeleteObjectsMd5Fallback(client: S3Client): void {
    client.middlewareStack.add(
      (next, context) => async args => {
        if (context.commandName !== 'DeleteObjectsCommand') {
          return next(args);
        }

        const headers = (args.request as { headers: Record<string, string> }).headers;
        for (const header of Object.keys(headers)) {
          const lower = header.toLowerCase();
          if (lower.startsWith('x-amz-checksum-') || lower.startsWith('x-amz-sdk-checksum-')) {
            delete headers[header];
          }
        }

        const body = (args.request as { body?: unknown }).body;
        if (body) {
          const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body as string);
          headers['content-md5'] = createHash('md5').update(bodyBuffer).digest('base64');
        }

        return next(args);
      },
      {
        step: 'build',
        priority: 'low',
        name: 'addMd5ChecksumForDeleteObjects',
        tags: ['MD5_FALLBACK'],
      }
    );
  }
}
