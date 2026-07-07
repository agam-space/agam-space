export interface UploadWorkerPool {
  encryptChunk(
    chunkIndex: number,
    chunk: Uint8Array,
    fileKey: Uint8Array
  ): Promise<{
    encChunk: Uint8Array;
    checksum: string;
  }>;
}
