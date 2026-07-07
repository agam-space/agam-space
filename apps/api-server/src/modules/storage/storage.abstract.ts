import { Readable } from 'node:stream';

/**
 * Thrown by saveFileChunkStream when a chunk object/file already exists at the
 * target path. Callers can catch this specifically to distinguish "orphaned
 * data from a previously interrupted upload" from other storage failures.
 */
export class ChunkAlreadyExistsError extends Error {
  constructor(chunkPath: string) {
    super(`Chunk already exists: ${chunkPath}`);
    this.name = 'ChunkAlreadyExistsError';
  }
}

export interface StorageHealth {
  healthy: boolean;
  message?: string;
}

export abstract class StorageService {
  abstract ensureUserDirectory(userId: string): Promise<string>;
  abstract ensureFileDirectory(userId: string, fileId: string): Promise<string>;
  abstract deleteFileDirectory(userId: string, fileId: string): Promise<string>;
  abstract userDirectoryExists(userId: string): boolean;
  abstract fileDirectoryExists(userId: string, fileId: string): boolean;
  abstract readChunkStream(userId: string, fileId: string, chunkIndex: number): Promise<Readable>;
  abstract saveFileChunkStream(
    fileDirPath: string,
    chunkIndex: number,
    stream: Readable,
    checksum?: string,
    neededChunkSize?: number
  ): Promise<{ size: number; chunkFilePath: string }>;
  /** Best-effort delete of a single chunk — used to clean up orphaned chunk data. */
  abstract deleteChunk(fileDirPath: string, chunkIndex: number): Promise<void>;
  abstract getRelativeChunkPath(userId: string, fileId: string, chunkIndex: number): string;
  abstract getAbsolutePath(relativePath: string): string;
  abstract getFilesDir(): string;
  /** Runtime connectivity/writability check, used by the /server/health endpoint. */
  abstract healthCheck(): Promise<StorageHealth>;

  /**
   * 2-level sharded path for a file: `f/{shard1}/{shard2}/{fileId}`
   * Shared across all backends so key structure stays identical.
   */
  protected getFileShardPath(fileId: string): string {
    const randomPart = fileId.slice(-16);
    const shard1 = randomPart[0];
    const shard2 = randomPart.slice(1, 3);
    return `f/${shard1}/${shard2}/${fileId}`;
  }
}
