'use client';

import { useEffect, useState } from 'react';
import {
  FileEntry,
  PublicShareApi,
  formatFileSize,
  downloadBlobAsFile,
  MAX_PREVIEW_SIZE_BYTES,
  decryptFileChunks,
} from '@agam-space/client';
import { FilePreviewCoordinator } from '@/components/file-preview/file-preview-coordinator';
import { PreviewLoading } from '@/components/file-preview/preview-loading';
import { PublicShareUnsupportedPreview } from '@/components/public-share/public-share-unsupported-preview';
import { Info, ArrowDownToLine, X, Moon, Sun, Monitor } from 'lucide-react';
import { ThemeService } from '@/services/theme.service';

type ThemeOption = 'light' | 'dark' | 'system';

type Props = {
  fileEntry: FileEntry;
  shareId: string;
  accessToken: string;
  fileKey: Uint8Array;
  onClose?: () => void;
};

export function PublicShareFilePreview({
  fileEntry,
  shareId,
  accessToken,
  fileKey,
  onClose,
}: Props) {
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFileInfo, setShowFileInfo] = useState(false);
  const [theme, setTheme] = useState<ThemeOption>('system');

  useEffect(() => {
    setTheme(ThemeService.getCurrentTheme());
    ThemeService.applyTheme(ThemeService.getCurrentTheme());

    const unsubscribe = ThemeService.onSystemPreferenceChange(isDark => {
      document.documentElement.classList.toggle('dark', isDark);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (fileEntry.size > MAX_PREVIEW_SIZE_BYTES) return;

    let cancelled = false;

    (async () => {
      try {
        const fetchChunk = async (fileId: string, index: number): Promise<Uint8Array> => {
          return await PublicShareApi.fetchPublicFileChunk(shareId, accessToken, fileId, index);
        };

        const chunks: Uint8Array[] = [];
        let totalLength = 0;

        for await (const chunk of decryptFileChunks({
          fileId: fileEntry.id,
          fileKey: fileKey,
          totalChunks: fileEntry.chunkCount,
          fetchChunk,
        })) {
          if (cancelled) return;
          chunks.push(chunk);
          totalLength += chunk.length;
        }

        if (cancelled) return;

        const merged = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }

        setFileData(merged);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError('Failed to load or decrypt file.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileEntry.size, fileEntry.id, fileEntry.chunkCount, shareId, accessToken, fileKey]);

  const toggleTheme = () => {
    const next = ThemeService.getNextTheme(theme);
    ThemeService.setTheme(next);
    setTheme(next);
  };

  const isUnsupportedType = (mimeType: string): boolean => {
    return (
      mimeType.includes('word') ||
      mimeType.includes('msword') ||
      mimeType.includes('officedocument.wordprocessing') ||
      mimeType.includes('sheet') ||
      mimeType.includes('excel') ||
      mimeType.includes('officedocument.spreadsheet') ||
      mimeType.includes('presentation') ||
      mimeType.includes('powerpoint') ||
      mimeType.includes('officedocument.presentation')
    );
  };

  if (fileEntry.size > MAX_PREVIEW_SIZE_BYTES) {
    return (
      <PublicShareUnsupportedPreview
        fileEntry={fileEntry}
        shareId={shareId}
        accessToken={accessToken}
        fileKey={fileKey}
        onClose={onClose}
        reason='large'
      />
    );
  }

  if (isUnsupportedType(fileEntry.mime)) {
    return (
      <PublicShareUnsupportedPreview
        fileEntry={fileEntry}
        shareId={shareId}
        accessToken={accessToken}
        fileKey={fileKey}
        onClose={onClose}
        reason='unsupported-type'
      />
    );
  }

  if (error) {
    return (
      <div className='flex items-center justify-center min-h-screen text-destructive bg-destructive/10 rounded-lg p-4 border border-destructive/30'>
        {error}
      </div>
    );
  }

  if (!fileData) {
    return <PreviewLoading />;
  }

  const handleDownload = () => {
    downloadBlobAsFile(fileData, fileEntry.name, fileEntry.mime);
  };

  return (
    <div className='w-screen h-screen max-w-none p-0 overflow-hidden bg-background flex flex-col'>
      <div className='flex items-center justify-between px-6 py-3 flex-shrink-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
        <div className='flex items-center gap-3'>
          {onClose && (
            <button
              onClick={onClose}
              className='rounded-full p-2 hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              aria-label='Close preview'
            >
              <X className='w-5 h-5' />
            </button>
          )}
          <h2 className='text-base font-semibold truncate max-w-md'>{fileEntry.name}</h2>
        </div>
        <div className='flex items-center gap-2'>
          <button
            onClick={toggleTheme}
            className='rounded-full p-2 hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            aria-label='Toggle theme'
          >
            {theme === 'light' ? (
              <Moon className='w-5 h-5' />
            ) : theme === 'dark' ? (
              <Sun className='w-5 h-5' />
            ) : (
              <Monitor className='w-5 h-5' />
            )}
          </button>
          <button
            onClick={() => setShowFileInfo(!showFileInfo)}
            className='rounded-full p-2 hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            aria-label='Toggle file info'
          >
            <Info className='w-5 h-5' />
          </button>
          <button
            onClick={handleDownload}
            className='rounded-full p-2 hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            aria-label='Download file'
          >
            <ArrowDownToLine className='w-5 h-5' />
          </button>
        </div>
      </div>

      <div className='relative flex-1 min-h-0 flex items-center justify-center overflow-hidden'>
        <div
          className={`w-full h-full min-h-0 flex items-center justify-center overflow-auto transition-all duration-300 ${
            showFileInfo ? 'sm:pr-80' : 'pr-0'
          }`}
        >
          <FilePreviewCoordinator data={fileData} fileEntry={fileEntry} />
        </div>

        <div
          className={`absolute top-0 right-0 h-full w-full sm:w-80 bg-background border-l transition-transform duration-300 ease-in-out ${
            showFileInfo ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className='p-6 overflow-y-auto h-full'>
            <div className='flex items-center justify-between mb-6'>
              <h3 className='text-lg font-semibold'>File Information</h3>
              <button
                onClick={() => setShowFileInfo(false)}
                className='rounded-full p-1 hover:bg-accent transition-colors'
                aria-label='Close info panel'
              >
                <X className='w-4 h-4' />
              </button>
            </div>
            <div className='space-y-4'>
              <div>
                <h4 className='text-sm font-medium text-muted-foreground mb-1'>Name</h4>
                <p className='text-sm break-all'>{fileEntry.name}</p>
              </div>
              <div>
                <h4 className='text-sm font-medium text-muted-foreground mb-1'>Size</h4>
                <p className='text-sm'>{formatFileSize(fileEntry.size)}</p>
              </div>
              <div>
                <h4 className='text-sm font-medium text-muted-foreground mb-1'>Type</h4>
                <p className='text-sm'>{fileEntry.mime || 'Unknown'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
