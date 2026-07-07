import { FolderMetadata, FolderStatus, UserFileMetadata } from '@agam-space/shared-types';

export type FolderEntry = {
  id: string;
  name: string;
  nameHash: string;
  parentId?: string;
  isFolder: true;
  size?: number;
  count?: number;
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: FolderMetadata;
  status?: FolderStatus;
};

export type FileEntry = {
  id: string;
  name: string;
  nameHash: string;
  size: number;
  mime: string;
  parentId: string;
  isFolder: false;
  chunkCount: number;
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: UserFileMetadata;
  status?: string;
};

export type ContentEntry = FileEntry | FolderEntry;
