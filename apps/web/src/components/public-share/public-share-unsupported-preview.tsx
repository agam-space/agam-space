'use client';

import {
  FileEntry,
  fetchPublicFileChunkApi,
  decryptFileChunks,
  formatBytes,
} from '@agam-space/client';
import { FileX, ArrowDownToLine, Loader2, Info, X } from 'lucide-react';
import { useState } from 'react';

type Props = {
  fileEntry: FileEntry;
  shareId: string;
  accessToken: string;
  fileKey: Uint8Array;
  onClose?: () => void;
  reason?: 'large' | 'unsupported-type';
};

export function PublicShareUnsupportedPreview({
  fileEntry,
  shareId,
  accessToken,
  fileKey,
  onClose,
  reason = 'large',
}: Props) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setIsDownloading(true);
    setError(null);
    setDownloadProgress(0);

    try {
      const fetchChunk = async (fileId: string, index: number): Promise<Uint8Array> => {
        const chunk = await fetchPublicFileChunkApi(shareId, accessToken, fileId, index);
        // Update progress
        const progress = Math.round(((index + 1) / fileEntry.chunkCount) * 100);
        setDownloadProgress(progress);
        return chunk;
      };

      // Decrypt and collect all chunks
      const chunks: Uint8Array[] = [];
      let totalLength = 0;

      for await (const chunk of decryptFileChunks({
        fileId: fileEntry.id,
        fileKey: fileKey,
        totalChunks: fileEntry.chunkCount,
        fetchChunk,
      })) {
        chunks.push(chunk);
        totalLength += chunk.length;
      }

      // Merge chunks
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      // Download merged file
      const blob = new Blob([merged], { type: fileEntry.mime || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileEntry.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setIsDownloading(false);
      setDownloadProgress(0);
    } catch (err) {
      console.error('Download failed:', err);
      setError('Failed to download file. Please try again.');
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  return (
    <div className='w-full h-full flex flex-col'>
      {/* Close button */}
      {onClose && (
        <div className='p-4'>
          <button
            onClick={onClose}
            className='rounded-full p-2 hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            aria-label='Close preview'
          >
            <X className='w-5 h-5' />
          </button>
        </div>
      )}

      {/* Content */}
      <div className='flex-1 flex items-center justify-center p-8'>
        <div className='max-w-md w-full'>
          {/* Icon Circle */}
          <div className='flex justify-center mb-6'>
            <div className='rounded-full bg-muted/50 p-6 border border-border'>
              <FileX className='w-16 h-16 text-muted-foreground' strokeWidth={1.5} />
            </div>
          </div>

          {/* Content */}
          <div className='text-center space-y-3 mb-8'>
            <h2 className='text-2xl font-semibold tracking-tight'>
              {reason === 'unsupported-type' ? 'Preview Not Available' : 'File Too Large'}
            </h2>
            <p className='text-muted-foreground'>
              {reason === 'unsupported-type'
                ? 'This file type cannot be previewed in your browser'
                : `This file is too large to preview (${formatBytes(fileEntry.size)})`}
            </p>

            {/* File Info Card */}
            <div className='mt-6 p-4 rounded-lg bg-muted/50 border border-border/50 space-y-2'>
              <div className='flex items-center justify-between text-sm'>
                <span className='text-muted-foreground'>File name</span>
                <span className='font-medium truncate ml-2 max-w-[200px]' title={fileEntry.name}>
                  {fileEntry.name}
                </span>
              </div>
              <div className='flex items-center justify-between text-sm'>
                <span className='text-muted-foreground'>File size</span>
                <span className='font-medium'>{formatBytes(fileEntry.size)}</span>
              </div>
              {fileEntry.mime && (
                <div className='flex items-center justify-between text-sm'>
                  <span className='text-muted-foreground'>Type</span>
                  <span className='font-medium font-mono text-xs'>{fileEntry.mime}</span>
                </div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className='mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3'>
              <Info className='w-5 h-5 text-destructive flex-shrink-0 mt-0.5' />
              <p className='text-sm text-destructive'>{error}</p>
            </div>
          )}

          {/* Download Button */}
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className='w-full px-6 py-3.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 disabled:shadow-none'
          >
            {isDownloading ? (
              <>
                <Loader2 className='w-5 h-5 animate-spin' />
                <span>Downloading... {downloadProgress}%</span>
              </>
            ) : (
              <>
                <ArrowDownToLine className='w-5 h-5' />
                <span>Download File</span>
              </>
            )}
          </button>

          {/* Helper Text */}
          {!isDownloading && !error && (
            <p className='text-center text-xs text-muted-foreground mt-4'>
              The file will be downloaded to your device
            </p>
          )}

          {/* Progress Info */}
          {isDownloading && (
            <div className='mt-4'>
              <div className='flex justify-between text-xs text-muted-foreground mb-2'>
                <span>Downloading and decrypting...</span>
                <span>{downloadProgress}%</span>
              </div>
              <div className='w-full bg-muted rounded-full h-2 overflow-hidden'>
                <div
                  className='h-full bg-primary transition-all duration-300 ease-out rounded-full'
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
