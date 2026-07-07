import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  promises as fsPromises,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { Blake3Hasher } from '@napi-rs/blake-hash';
import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../../config/config.service';
import { ChunkAlreadyExistsError, StorageHealth, StorageService } from './storage.abstract';

@Injectable()
export class LocalStorageService extends StorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly filesDir: string;

  constructor(private readonly configService: AppConfigService) {
    super();
    const directories = this.configService.getDirectories();
    this.filesDir = directories.filesDir;
    this.logger.log(`💾 Local storage initialized: ${this.filesDir}`);
  }

  async ensureUserDirectory(userId: string): Promise<string> {
    const userDirPath = this.getUserDirectoryPath(userId);
    this.ensureDirExists(userDirPath);
    return userDirPath;
  }

  async ensureFileDirectory(userId: string, fileId: string): Promise<string> {
    const fileDirPath = this.getFileDirectoryPath(userId, fileId);
    this.ensureDirExists(fileDirPath);
    return fileDirPath;
  }

  async deleteFileDirectory(userId: string, fileId: string): Promise<string> {
    const fileDirPath = this.getFileDirectoryPath(userId, fileId);
    this.deleteDirectory(fileDirPath);
    return fileDirPath;
  }

  userDirectoryExists(userId: string): boolean {
    return existsSync(this.getUserDirectoryPath(userId));
  }

  fileDirectoryExists(userId: string, fileId: string): boolean {
    return existsSync(this.getFileDirectoryPath(userId, fileId));
  }

  async readChunkStream(userId: string, fileId: string, chunkIndex: number): Promise<Readable> {
    const relativePath = this.getRelativeChunkPath(userId, fileId, chunkIndex);
    const absolutePath = this.getAbsolutePath(relativePath);

    if (!existsSync(absolutePath)) {
      throw new Error(`Chunk file not found: ${relativePath}`);
    }
    return createReadStream(absolutePath);
  }

  async saveFileChunkStream(
    fileDirPath: string,
    chunkIndex: number,
    stream: Readable,
    checksum: string | undefined = undefined,
    neededChunkSize: number | undefined = undefined
  ): Promise<{ size: number; chunkFilePath: string }> {
    const chunkFilePath = path.join(fileDirPath, `chunk-${chunkIndex}`);
    const tempPath = chunkFilePath + '.part';

    if (existsSync(chunkFilePath)) {
      throw new ChunkAlreadyExistsError(chunkFilePath);
    }

    const hasher = new Blake3Hasher();
    let size = 0;

    await pipeline(
      stream,
      new Transform({
        transform(chunk, _, cb) {
          hasher.update(chunk);
          size += chunk.length;

          if (neededChunkSize && size > neededChunkSize * 1.01) {
            cb(new Error(`Chunk too large: received ${size} bytes`));
            return;
          }

          cb(null, chunk);
        },
      }),
      createWriteStream(tempPath)
    );

    const actualChecksum = hasher.digest('hex');

    if (checksum && checksum !== actualChecksum) {
      rmSync(tempPath);
      throw new Error(`Checksum mismatch: expected ${checksum}, got ${actualChecksum}`);
    }

    if (neededChunkSize && size > neededChunkSize * 1.01) {
      rmSync(tempPath);
      throw new Error(`Chunk size mismatch: expected ${neededChunkSize}, got ${size}`);
    }

    await fsPromises.rename(tempPath, chunkFilePath);
    return {
      size,
      chunkFilePath: path.relative(this.filesDir, chunkFilePath),
    };
  }

  async deleteChunk(fileDirPath: string, chunkIndex: number): Promise<void> {
    const chunkFilePath = path.join(fileDirPath, `chunk-${chunkIndex}`);
    if (existsSync(chunkFilePath)) {
      rmSync(chunkFilePath, { force: true });
    }
  }

  async healthCheck(): Promise<StorageHealth> {
    try {
      const testFile = path.join(this.filesDir, `.health-${Date.now()}`);
      await fsPromises.writeFile(testFile, 'ok');
      await fsPromises.unlink(testFile);
      return { healthy: true };
    } catch (e) {
      return { healthy: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  getRelativeChunkPath(userId: string, fileId: string, chunkIndex: number): string {
    const fullPath = this.getChunkFilePath(userId, fileId, chunkIndex);
    return path.relative(this.filesDir, fullPath);
  }

  getAbsolutePath(relativePath: string): string {
    return path.join(this.filesDir, relativePath);
  }

  getFilesDir(): string {
    return this.filesDir;
  }

  ensureDirExists(dirPath: string) {
    if (existsSync(dirPath)) return;
    try {
      mkdirSync(dirPath, { recursive: true });
      this.logger.log(`📁 Created directory: ${dirPath}`);
    } catch {
      throw new Error(`Failed to create directory: ${dirPath}`);
    }
  }

  deleteDirectory(dirPath: string) {
    if (!existsSync(dirPath)) {
      this.logger.debug(`Directory does not exist: ${dirPath}`);
      return;
    }
    try {
      rmSync(dirPath, { recursive: true, force: true });
      this.logger.log(`🗑️ Deleted directory: ${dirPath}`);
    } catch {
      throw new Error(`Failed to delete directory: ${dirPath}`);
    }
  }

  private getUserDirectoryPath(userId: string): string {
    return path.join(this.filesDir, `u-${userId}`);
  }

  private getFileDirectoryPath(userId: string, fileId: string): string {
    return path.join(this.filesDir, `u-${userId}`, this.getFileShardPath(fileId));
  }

  private getChunkFilePath(userId: string, fileId: string, chunkIndex: number): string {
    return path.join(this.getFileDirectoryPath(userId, fileId), `chunk-${chunkIndex}`);
  }
}
