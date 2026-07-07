import { FileManager } from '../file-manager';
import { UploadWorkerPool } from './upload-worker-pool';

export class MainThreadUploadWorkerPool implements UploadWorkerPool {
  async encryptChunk(
    chunkIndex: number,
    chunk: Uint8Array,
    fileKey: Uint8Array
  ): Promise<{ encChunk: Uint8Array; checksum: string }> {
    return new FileManager().encryptChunk(chunk, fileKey);
  }
}
