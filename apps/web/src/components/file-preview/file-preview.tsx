'use client';

import { useEffect, useState } from 'react';
import {
  decryptAndMergeFileChunks,
  FileEntry,
  getPreviewCache,
  setPreviewCache,
  MAX_PREVIEW_SIZE_BYTES,
} from '@agam-space/client';
import { FilePreviewCoordinator } from '@/components/file-preview/file-preview-coordinator';
import { PreviewLoading } from '@/components/file-preview/preview-loading';
import { UnsupportedPreview } from '@/components/file-preview/unsupported-file-preview';

type Props = {
  fileEntry: FileEntry;
  onClose?: () => void;
};

export function FilePreview({ fileEntry, onClose }: Props) {
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fileEntry.size > MAX_PREVIEW_SIZE_BYTES) return;

    let cancelled = false;

    const cached = getPreviewCache(fileEntry.id);
    if (cached) {
      setFileData(cached);
      return;
    }

    (async () => {
      try {
        const bytes = await decryptAndMergeFileChunks({
          fileId: fileEntry.id,
          totalChunks: fileEntry.chunkCount,
        });
        if (!cancelled) {
          setFileData(bytes);
          setPreviewCache(fileEntry.id, bytes);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError('Failed to load or decrypt file.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileEntry.size, fileEntry.id, fileEntry.chunkCount]);

  if (fileEntry.size > MAX_PREVIEW_SIZE_BYTES) {
    return <UnsupportedPreview fileEntry={fileEntry} onClose={onClose} />;
  }

  if (error)
    return (
      <div className='flex items-center justify-center min-h-[400px] text-destructive bg-destructive/10 rounded-lg p-4 border border-destructive/30'>
        {error}
      </div>
    );
  if (!fileData) {
    return <PreviewLoading />;
  }

  return <FilePreviewCoordinator data={fileData} fileEntry={fileEntry} onClose={onClose} />;
}
