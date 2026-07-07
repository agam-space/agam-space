import { RawFileMetadata } from '@agam-space/shared-types';

export interface AbstractFileReader {
  readonly size: number;
  getMetadata(): RawFileMetadata;
  getChunkCount(chunkSize: number): number;
  readChunk(start: number, end: number): Promise<Uint8Array>;
  readFileInChunks(
    chunkSize: number,
    cb: (chunk: Uint8Array, chunkIndex: number, start: number, end: number) => Promise<void>
  ): Promise<void>;
}
