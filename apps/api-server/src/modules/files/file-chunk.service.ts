import { Readable } from 'node:stream';

import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';

import { FileChunk, fileChunks, NewFileChunk, files } from '@/database';

import { DATABASE_CONNECTION } from '@/database';
import { ChunkAlreadyExistsError, StorageService } from '@/modules/storage/storage.abstract';
import { AppConfigService } from '@/config/config.service';
import { DrizzleTransaction } from '@/database/database.providers';

@Injectable()
export class FileChunkService {
  private readonly logger = new Logger(FileChunkService.name);
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: ReturnType<typeof drizzle>,
    private readonly storageService: StorageService,
    private readonly configService: AppConfigService
  ) {}

  async saveFileChunkStream(
    fileDirPath: string,
    fileId: string,
    chunkIndex: number,
    checksum: string,
    stream: Readable
  ): Promise<FileChunk> {
    const exitingEntity = await this.findChunk(fileId, chunkIndex);
    if (exitingEntity) {
      if (exitingEntity.checksum === checksum) {
        return exitingEntity;
      }
      throw new ConflictException(
        `Chunk with index ${chunkIndex} for file ${fileId} already exists`
      );
    }

    if (!checksum) {
      throw new BadRequestException('Checksum is required');
    }

    let saveResult: { size: number; chunkFilePath: string };
    try {
      // TODO: handle other storage errors and mark chunk as failed
      saveResult = await this.storageService.saveFileChunkStream(
        fileDirPath,
        chunkIndex,
        stream,
        checksum,
        this.configService.getConfig().file.chunkSize
      );
    } catch (e) {
      if (e instanceof ChunkAlreadyExistsError) {
        // No DB row exists for this chunk (checked above), so the object in
        // storage is orphaned from a previously interrupted upload — clear it
        // so the client's retry/resume of this chunk index can succeed.
        this.logger.warn(
          `Orphaned chunk detected, clearing stale data: file=${fileId} index=${chunkIndex}`
        );
        await this.storageService.deleteChunk(fileDirPath, chunkIndex).catch(cleanupError => {
          this.logger.error(
            `Failed to clean up orphaned chunk: file=${fileId} index=${chunkIndex}`,
            cleanupError
          );
        });
        throw new ConflictException('Stale chunk data was cleared. Please retry the upload.');
      }
      throw e;
    }

    const { size, chunkFilePath } = saveResult;

    const newChunk: NewFileChunk = {
      fileId,
      index: chunkIndex,
      checksum,
      approxSize: size,
      storagePath: chunkFilePath,
    };

    const [fileChunk] = await this.db.insert(fileChunks).values(newChunk).returning();

    // Update the parent file's updatedAt timestamp to prevent premature cleanup
    await this.db.update(files).set({ updatedAt: new Date() }).where(eq(files.id, fileId));

    this.logger.log(`File chunk saved: ${fileChunk.fileId} - ${fileChunk.index}`);

    return fileChunk;
  }

  async chunkExists(fileId: string, chunkIndex: number): Promise<boolean> {
    const chunk = await this.findChunk(fileId, chunkIndex);
    return chunk !== null;
  }

  async findChunk(fileId: string, chunkIndex: number): Promise<FileChunk | null> {
    const [chunk] = await this.db
      .select()
      .from(fileChunks)
      .where(and(eq(fileChunks.fileId, fileId), eq(fileChunks.index, chunkIndex)))
      .limit(1)
      .execute();

    return chunk || null;
  }

  async getFileChunks(fileId: string): Promise<FileChunk[]> {
    return await this.db
      .select()
      .from(fileChunks)
      .where(eq(fileChunks.fileId, fileId))
      .orderBy(fileChunks.index)
      .execute();
  }

  async getFileChunkIndexes(fileId: string): Promise<number[]> {
    const chunks = await this.db
      .select({ index: fileChunks.index })
      .from(fileChunks)
      .where(eq(fileChunks.fileId, fileId))
      .orderBy(fileChunks.index)
      .execute();
    return chunks.map(chunk => chunk.index);
  }

  async readChunkStream(
    userId: string,
    fileId: string,
    chunkIndex: number
  ): Promise<{
    stream: Readable;
    chunk: FileChunk;
  }> {
    const chunk = await this.findChunk(fileId, chunkIndex);
    if (!chunk) throw new Error('Chunk not found');

    const stream = await this.storageService.readChunkStream(userId, fileId, chunkIndex);
    return {
      stream,
      chunk,
    };
  }

  async deleteFileChunks(userId: string, fileId: string, tx?: DrizzleTransaction): Promise<void> {
    this.logger.log(`Deleting chunks for file: ${fileId}`);

    // Delete from storage
    await this.storageService.deleteFileDirectory(userId, fileId);

    // Delete from database
    const result = await (tx ?? this.db)
      .delete(fileChunks)
      .where(eq(fileChunks.fileId, fileId))
      .returning();

    this.logger.log(`Deleted ${result.length} chunks for file: ${fileId}`);
  }
}
