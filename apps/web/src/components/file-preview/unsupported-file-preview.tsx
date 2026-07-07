'use client';

import { FileEntry, ClientRegistry, formatBytes } from '@agam-space/client';
import { FileX, ArrowDownToLine } from 'lucide-react';
import { toast } from 'sonner';
import { useDownloadStore } from '@/store/download-store';

type Props = {
  fileEntry: FileEntry;
  onClose?: () => void;
};

export function UnsupportedPreview({ fileEntry, onClose }: Props) {
  const handleDownload = () => {
    try {
      const item = ClientRegistry.getDownloadManager().enqueue(fileEntry);
      useDownloadStore.getState().addDownload({
        id: item.id,
        fileName: fileEntry.name,
        totalBytes: fileEntry.size,
        downloadedBytes: 0,
        progress: 0,
        status: 'pending',
      });
      onClose?.();
    } catch (err) {
      console.error(err);
      toast.error('Download failed');
    }
  };

  return (
    <div className='w-full max-w-md px-4'>
      <div className='flex justify-center mb-6'>
        <div className='rounded-full bg-muted/50 p-6 border border-border'>
          <FileX className='w-16 h-16 text-muted-foreground' strokeWidth={1.5} />
        </div>
      </div>

      <div className='text-center space-y-3 mb-8'>
        <h2 className='text-2xl font-semibold tracking-tight'>Preview Not Available</h2>
        <p className='text-muted-foreground'>This file type cannot be previewed in your browser</p>

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

      <button
        onClick={handleDownload}
        className='w-full px-6 py-3.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all flex items-center justify-center gap-3 font-medium shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30'
      >
        <ArrowDownToLine className='w-5 h-5' />
        <span>Download File</span>
      </button>

      <p className='text-center text-xs text-muted-foreground mt-4'>
        The file will be downloaded to your device
      </p>
    </div>
  );
}
