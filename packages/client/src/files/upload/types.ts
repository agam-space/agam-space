import { CreateFile, File as UserFile, RawFileMetadata } from '@agam-space/shared-types';
import { AbstractFileReader } from './abstract-file-reader';

export type UploadStatus = 'pending' | 'encrypting' | 'uploading' | 'complete' | 'error';

export type UploadableFile = File | Blob;

export interface UploadItem {
  id: string; // nanoid, used to track locally
  parentId: string | null; // null for root-level files
  fileMetadata?: RawFileMetadata;
  fileReq?: CreateFile;
  fileReader: AbstractFileReader; // file reader instance
  fileResponse?: UserFile;

  fileId?: string; // backend fileId after creation
  progress: number; // 0–100
  status: UploadStatus;
  error?: string;
}
