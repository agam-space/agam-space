'use client';

import { useUploadStore } from '@/store/upload-store';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useExplorerRefreshStore } from '@/store/explorer-refresh-store';
import { formatBytes } from '@/utils/file';

export function UploadTray({ onAllUploadsComplete }: { onAllUploadsComplete?: () => void }) {
  const uploads = useUploadStore(s => s.uploads);
  const updateUpload = useUploadStore(s => s.updateUpload);
  const removeUpload = useUploadStore(s => s.removeUpload);
  const clearCompletedAndFailed = useUploadStore(s => s.clearCompletedAndFailed);

  const dismissalTimerRef = useRef<NodeJS.Timeout | null>(null);

  const allFinished =
    uploads.length > 0 && uploads.every(u => u.status === 'complete' || u.status === 'error');

  const { triggerRefreshForFolder } = useExplorerRefreshStore.getState();

  // Define visibility variables first, before useEffect hooks that depend on them
  const inProgress = uploads.filter(u => u.status === 'uploading' || u.status === 'encrypting');
  const errors = uploads.filter(u => u.status === 'error');

  // Smart visibility: limit items shown to prevent screen overflow
  const hasInProgress = inProgress.length > 0;
  const MAX_IN_PROGRESS_VISIBLE = 4; // Show max 4 active uploads
  const MAX_COMPLETED_VISIBLE = hasInProgress ? 2 : 4; // Show 2 during upload, 4 when all done

  const visibleInProgress = inProgress.slice(0, MAX_IN_PROGRESS_VISIBLE); // Show first N in progress
  const recentCompleted = uploads
    .filter(u => u.status === 'complete' && !u.dismissed)
    .slice(-MAX_COMPLETED_VISIBLE); // Show last N completed

  const visible = [...visibleInProgress, ...errors, ...recentCompleted];

  useEffect(() => {
    if (hasInProgress) {
      if (dismissalTimerRef.current) {
        clearTimeout(dismissalTimerRef.current);
        dismissalTimerRef.current = null;
      }
    }
    // If all uploads are finished, start a single timer to dismiss everything
    else if (allFinished) {
      if (!dismissalTimerRef.current) {
        console.log(
          '✅ All uploads finished! Starting 3s dismissal timer. Showing',
          recentCompleted.length,
          'completed items'
        );
        dismissalTimerRef.current = setTimeout(() => {
          uploads.forEach(u => {
            if ((u.status === 'complete' || u.status === 'error') && !u.dismissed) {
              updateUpload(u.id, { dismissed: true });
            }
          });
          dismissalTimerRef.current = null;
        }, 3000); // 3 seconds after all complete
      }
    }

    return () => {
      if (dismissalTimerRef.current) {
        clearTimeout(dismissalTimerRef.current);
        dismissalTimerRef.current = null;
      }
    };
  }, [allFinished, uploads, updateUpload, hasInProgress]);

  // Trigger onAllUploadsComplete callback when all uploads finish
  useEffect(() => {
    if (allFinished) {
      console.log('All uploads finished, triggering callback');
      onAllUploadsComplete?.();
    }
  }, [allFinished, onAllUploadsComplete]);

  // Smart folder refresh: refresh each folder as soon as all its uploads complete
  const refreshedFolders = useRef<Set<string>>(new Set());

  useEffect(() => {
    const uploadsByFolder: Record<string, typeof uploads> = {};
    uploads.forEach(u => {
      const folderId = u.parentFolderId ?? 'root';
      if (!uploadsByFolder[folderId]) uploadsByFolder[folderId] = [];
      uploadsByFolder[folderId].push(u);
    });

    Object.entries(uploadsByFolder).forEach(([folderId, folderUploads]) => {
      const allDone = folderUploads.every(u => u.status === 'complete' || u.status === 'error');

      if (allDone && !refreshedFolders.current.has(folderId)) {
        refreshedFolders.current.add(folderId);
        triggerRefreshForFolder(folderId);
        console.log(`🔄 Triggered refresh for folder: ${folderId}`);
      }

      if (!allDone && refreshedFolders.current.has(folderId)) {
        refreshedFolders.current.delete(folderId);
      }
    });

    if (uploads.length === 0) {
      refreshedFolders.current.clear();
    }
  }, [uploads, triggerRefreshForFolder]);

  useEffect(() => {
    if (uploads.length > 0) {
      console.log('📤 Upload Tray State:', {
        totalUploads: uploads.length,
        inProgress: inProgress.length,
        visibleInProgress: visibleInProgress.length,
        completed: uploads.filter(u => u.status === 'complete' && !u.dismissed).length,
        recentCompleted: recentCompleted.length,
        visible: visible.length,
        allFinished,
        hasInProgress,
      });
    }
  }, [
    uploads.length,
    inProgress.length,
    visibleInProgress.length,
    recentCompleted.length,
    visible.length,
    allFinished,
    hasInProgress,
  ]);

  if (visible.length === 0) return null;

  const hasCompletedOrFailed = uploads.some(u => u.status === 'complete' || u.status === 'error');

  return (
    <div className='pointer-events-auto w-full max-w-md rounded-xl bg-card text-card-foreground shadow-lg border border-border p-4 space-y-3'>
      <h4 className='text-sm font-semibold flex justify-between items-center'>
        <span>Uploads</span>
        <div className='flex items-center gap-2'>
          {inProgress.length > 0 && (
            <span className='text-xs font-normal text-muted-foreground'>
              {inProgress.length} in progress
            </span>
          )}
          {hasCompletedOrFailed && (
            <button
              onClick={clearCompletedAndFailed}
              className='text-xs font-normal text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent'
              title='Clear completed and failed uploads'
            >
              Clear
            </button>
          )}
        </div>
      </h4>
      {visible.map(item => (
        <div
          key={item.id}
          className={`text-xs rounded border px-3 py-2 ${
            item.status === 'error'
              ? 'bg-red-50 border-red-300 text-red-700 dark:bg-red-950 dark:border-red-800'
              : ''
          }`}
        >
          <div className='flex justify-between items-center mb-1'>
            <span className='truncate max-w-[65%]'>{item.fileName}</span>
            <div className='flex items-center gap-1 text-muted-foreground text-[11px]'>
              <span>
                {item.status === 'complete'
                  ? 'Uploaded'
                  : item.status === 'error'
                    ? ''
                    : `${formatBytes(item.uploadedBytes)} / ${formatBytes(item.totalBytes)}`}
              </span>
              {(item.status === 'complete' || item.status === 'error') && (
                <button
                  onClick={() => removeUpload(item.id)}
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
                item.status === 'complete'
                  ? 'bg-green-500'
                  : item.status === 'error'
                    ? 'bg-red-500'
                    : 'bg-blue-500'
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
