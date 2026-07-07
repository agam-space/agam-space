'use client';

import { useDownloadStore } from '@/store/download-store';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { formatBytes } from '@/utils/file';

export function DownloadTray() {
  const downloads = useDownloadStore(s => s.downloads);
  const updateDownload = useDownloadStore(s => s.updateDownload);
  const removeDownload = useDownloadStore(s => s.removeDownload);

  const dismissalTimerRef = useRef<NodeJS.Timeout | null>(null);

  const allFinished =
    downloads.length > 0 && downloads.every(d => d.status === 'complete' || d.status === 'error');

  const inProgress = downloads.filter(d => d.status === 'downloading');
  const errors = downloads.filter(d => d.status === 'error');

  // Smart visibility: limit items shown to prevent screen overflow
  const hasInProgress = inProgress.length > 0;
  const MAX_IN_PROGRESS_VISIBLE = 4; // Show max 5 active downloads
  const MAX_COMPLETED_VISIBLE = hasInProgress ? 2 : 4; // Show 2 during download, 5 when all done

  const visibleInProgress = inProgress.slice(0, MAX_IN_PROGRESS_VISIBLE); // Show first N in progress
  const recentCompleted = downloads
    .filter(d => d.status === 'complete' && !d.dismissed)
    .slice(-MAX_COMPLETED_VISIBLE); // Show last N completed

  const visible = [...visibleInProgress, ...errors, ...recentCompleted];

  // Debug logging
  useEffect(() => {
    if (downloads.length > 0) {
      console.log('📊 Download Tray State:', {
        totalDownloads: downloads.length,
        inProgress: inProgress.length,
        visibleInProgress: visibleInProgress.length,
        completed: downloads.filter(d => d.status === 'complete' && !d.dismissed).length,
        recentCompleted: recentCompleted.length,
        visible: visible.length,
        allFinished,
        hasInProgress,
      });
    }
  }, [
    downloads.length,
    inProgress.length,
    visibleInProgress.length,
    recentCompleted.length,
    visible.length,
    allFinished,
    hasInProgress,
  ]);

  useEffect(() => {
    const hasInProgress = downloads.some(d => d.status === 'downloading');

    if (hasInProgress) {
      if (dismissalTimerRef.current) {
        clearTimeout(dismissalTimerRef.current);
        dismissalTimerRef.current = null;
      }
    } else if (allFinished) {
      if (!dismissalTimerRef.current) {
        console.log(
          '✅ All downloads finished! Starting 3s dismissal timer. Showing',
          recentCompleted.length,
          'completed items'
        );
        dismissalTimerRef.current = setTimeout(() => {
          downloads.forEach(d => {
            if ((d.status === 'complete' || d.status === 'error') && !d.dismissed) {
              updateDownload(d.id, { dismissed: true });
            }
          });
          dismissalTimerRef.current = null;
        }, 3000);
      }
    }

    return () => {
      if (dismissalTimerRef.current) {
        clearTimeout(dismissalTimerRef.current);
        dismissalTimerRef.current = null;
      }
    };
  }, [allFinished, downloads, updateDownload, recentCompleted.length]);

  if (visible.length === 0) return null;

  return (
    <div className='pointer-events-auto w-full max-w-md rounded-xl bg-card text-card-foreground shadow-lg border border-border p-4 space-y-3'>
      <h4 className='text-sm font-semibold flex justify-between items-center'>
        <span>Downloads</span>
        {inProgress.length > 0 && (
          <span className='text-xs font-normal text-muted-foreground'>
            {inProgress.length} in progress
          </span>
        )}
      </h4>
      {visible.map(item => (
        <div key={item.id} className='text-xs'>
          <div className='flex justify-between items-center mb-1'>
            <span className='truncate max-w-[65%]'>{item.fileName}</span>
            <div className='flex items-center gap-1 text-muted-foreground text-[11px]'>
              <span>
                {item.status === 'complete'
                  ? 'Downloaded'
                  : `${formatBytes(item.downloadedBytes)} / ${formatBytes(item.totalBytes)}`}
              </span>
              {(item.status === 'complete' || item.status === 'error') && (
                <button
                  onClick={() => removeDownload(item.id)}
                  className='p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded'
                  title='Remove'
                >
                  <X className='w-3.5 h-3.5 text-zinc-500' />
                </button>
              )}
            </div>
          </div>
          <div className='h-2 w-full bg-zinc-200 dark:bg-zinc-700 rounded overflow-hidden'>
            <div
              className={`h-full transition-all ${
                item.status === 'complete' ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${item.progress}%` }}
            />
          </div>
          {item.status === 'error' && <div className='text-red-500 mt-1'>{item.error}</div>}
        </div>
      ))}
    </div>
  );
}
