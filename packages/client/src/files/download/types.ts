import { FileEntry } from '../../content-tree/entities';

export type DownloadStatus = 'pending' | 'downloading' | 'complete' | 'error';

export interface DownloadItem {
  id: string;
  file: FileEntry;
  totalBytes: number;
  downloadedBytes: number;
  progress: number; // 0 - 100
  status: DownloadStatus;
  error?: string;
}

export interface DownloadProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
}

export interface DownloadManagerCallbacks {
  onStatusChange?: (id: string, status: DownloadStatus) => void;
  onProgress?: (id: string, progress: DownloadProgress) => void;
  onError?: (id: string, error: string) => void;
}
