import { DownloadItem, DownloadManagerCallbacks } from './types';
import { FileEntry } from '../../content-tree/entities';
import { downloadFile } from '../download';
import { LimitFunction, pLimiter } from '../../utils/p-limiter';
import { ulid } from 'ulid';

export interface DownloadManagerConfig {
  concurrency: number; // max concurrent uploads
}

export class DownloadManager {
  private queue: DownloadItem[] = [];
  private readonly limiter: LimitFunction;

  constructor(
    private readonly config: DownloadManagerConfig,
    private readonly callbacks?: DownloadManagerCallbacks
  ) {
    this.limiter = pLimiter(this.config.concurrency);
  }

  enqueue(file: FileEntry): DownloadItem {
    const item: DownloadItem = {
      id: ulid(),
      file: file,
      status: 'pending',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: file.size,
    };

    this.queue.push(item);
    this.process(item);

    return item;
  }

  private async process(item: DownloadItem) {
    await this.limiter(async () => {
      const file = item.file;
      const totalBytes = file.size;
      let downloadedBytes = 0;

      try {
        item.status = 'downloading';
        this.callbacks?.onStatusChange?.(item.id, item.status);

        await downloadFile(item.file, (chunkIndex: number, bytes: number) => {
          downloadedBytes += bytes;

          const percent = Math.floor((downloadedBytes / totalBytes) * 100);
          item.progress = percent;
          item.downloadedBytes = downloadedBytes;

          this.callbacks?.onProgress?.(item.id, {
            percent,
            downloadedBytes,
            totalBytes,
          });
        });

        item.status = 'complete';
        item.progress = 100;
        this.callbacks?.onStatusChange?.(item.id, item.status);
      } catch (e) {
        item.status = 'error';
        item.error = (e as Error).message;
        this.callbacks?.onStatusChange?.(item.id, item.status);
        this.callbacks?.onError?.(item.id, item.error);
      }
    });
  }
}
