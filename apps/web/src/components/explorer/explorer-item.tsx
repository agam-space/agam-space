'use client';

import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import {
  Folder,
  MoreVertical,
  ExternalLink,
  Download,
  Pencil,
  FolderInput,
  RefreshCw,
  Trash2,
  RotateCcw,
  X,
  Share2,
} from 'lucide-react';
import { ClientRegistry, ContentEntry, FileEntry } from '@agam-space/client';
import { getFileIconV2 } from '@/lib/file-mime-icon';
import { formatBytes } from '@/utils/file';
import { toast } from 'sonner';
import { useDownloadStore } from '@/store/download-store';
import { useState } from 'react';
import { RenameDialog } from '@/components/explorer/rename-dialog';
import { CreatePublicShareDialog } from '@/components/explorer/create-public-share-dialog';

type ExplorerItemProps = {
  entry: ContentEntry;
  view: 'grid' | 'list';
  href?: string;
  selected?: boolean;
  multiSelect?: boolean;
  isTrashView?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onTrash?: (id: string, isFolder: boolean) => void;
  onRestore?: () => void;
  onDeletePermanent?: () => void;
  onDoubleClick?: () => void;
  checkIfNameExists?: (id: string, isFolder: boolean, newName: string) => boolean;
  onRename?: (id: string, isFolder: boolean, newName: string) => void;
  onMove?: (entry: ContentEntry) => void;
  onContextOpen?: () => void;
  onContextClose?: () => void;
  onRecomputeSize?: (entry: ContentEntry) => Promise<void> | void;
};

export function ExplorerItem({
  entry,
  view,
  href,
  // setSelectedId,
  onTrash,
  multiSelect = false,
  selected = false,
  // onToggleSelect,
  isTrashView = false,
  onRestore,
  onDeletePermanent,
  onClick = () => {},
  onDoubleClick,
  checkIfNameExists,
  onRename = () => {},
  onMove = () => {},
  onContextOpen = () => {},
  onContextClose = () => {},
  onRecomputeSize = async () => {},
}: ExplorerItemProps) {
  const router = useRouter();
  const contextMenuTriggerRef = useRef<HTMLDivElement>(null);

  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);

  const triggerContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Programmatically trigger the context menu
    const syntheticEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: e.clientX,
      clientY: e.clientY,
    });

    contextMenuTriggerRef.current?.dispatchEvent(syntheticEvent);
  };

  const icon = entry.isFolder ? (
    <Folder className={cn(view === 'grid' ? 'w-6 h-6' : 'w-5 h-5', 'text-yellow-500')} />
  ) : (
    getFileIconV2(entry.mime, entry.name)
  );

  const fileSizeText = !entry.isFolder && entry.size ? formatBytes(entry.size) : null;

  const handleDownload = async () => {
    try {
      const fileEntry = entry as FileEntry;
      const item = ClientRegistry.getDownloadManager().enqueue(fileEntry);

      useDownloadStore.getState().addDownload({
        id: item.id,
        fileName: fileEntry.name,
        totalBytes: fileEntry.size,
        downloadedBytes: 0,
        progress: 0,
        status: 'pending',
      });
    } catch (err) {
      console.error(err);
      toast.error('Download failed');
    }
  };

  const content =
    view === 'grid' ? (
      <div
        onClick={e => {
          e.preventDefault(); // ✅ stop browser default
          e.stopPropagation(); // ✅ prevent bubbling
          onClick?.(e);
        }}
        className={cn(
          'select-none transition-all duration-150 cursor-pointer',
          view === 'grid'
            ? 'relative flex flex-col items-center justify-center gap-2 h-[104px] p-4 border rounded-lg hover:shadow-sm'
            : 'flex items-center h-9 px-4 text-sm',
          selected
            ? 'bg-primary/10 border border-primary text-primary'
            : 'bg-muted/50 hover:bg-muted'
        )}
      >
        <button
          className='absolute top-1 right-1 p-1 rounded hover:bg-muted-foreground/20 transition-colors'
          onClick={triggerContextMenu}
          aria-label='More actions'
        >
          <MoreVertical className='w-4 h-4 text-muted-foreground' />
        </button>
        {icon}
        <div
          title={entry.name}
          className='truncate w-full text-center font-medium text-sm text-foreground'
        >
          {entry.name}
        </div>
        {!entry.isFolder && entry.size && (
          <span className='text-[10px] text-muted-foreground'>{formatBytes(entry.size)}</span>
        )}
      </div>
    ) : (
      <div
        className={cn(
          'select-none transition-colors duration-100 cursor-pointer flex items-center h-12 px-4 pr-8 text-sm',
          selected
            ? 'bg-primary/10 border border-primary text-primary'
            : 'bg-muted/50 hover:bg-muted'
        )}
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          onClick?.(e);
        }}
      >
        {/* column 1: icon */}
        <div className='w-5 flex-shrink-0'>{icon}</div>

        {/* column 2: name */}
        <div title={entry.name} className='flex-1 min-w-0 pl-2 truncate'>
          {entry.name}
        </div>

        {/* column 3: size */}
        <div className='w-24 sm:w-32 md:w-40 lg:w-48 xl:w-56 text-right text-muted-foreground pr-6'>
          {!entry.isFolder && entry.size ? formatBytes(entry.size) : ''}
        </div>

        {/* column 4: modified */}
        <div className='hidden sm:block sm:w-40 md:w-52 lg:w-64 xl:w-72 text-right text-muted-foreground text-xs pr-6'>
          {entry.updatedAt ? formatDate(entry.updatedAt) : ''}
        </div>

        {/* column 5: actions */}
        <div className='w-12 sm:w-16 md:w-20 lg:w-24 flex justify-center'>
          <button
            className='p-1 rounded hover:bg-muted-foreground/20 transition-colors'
            onClick={triggerContextMenu}
          >
            <MoreVertical className='w-4 h-4 text-muted-foreground' />
          </button>
        </div>
      </div>
    );

  return (
    <>
      <ContextMenu
        onOpenChange={open => {
          if (open) {
            onContextOpen?.(); // Notify parent
          } else {
            onContextClose?.();
          }
        }}
      >
        <ContextMenuTrigger asChild>
          <div
            ref={contextMenuTriggerRef}
            onDoubleClick={() => {
              if (entry.isFolder && href) router.push(href);
              else if (!entry.isFolder) onDoubleClick?.();
            }}
            className='cursor-pointer'
          >
            {content}
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className='w-48'>
          {isTrashView ? (
            <>
              <ContextMenuItem onClick={onRestore}>
                <RotateCcw className='w-4 h-4 mr-2' />
                Restore
              </ContextMenuItem>
              <ContextMenuItem onClick={onDeletePermanent} className='text-destructive'>
                <X className='w-4 h-4 mr-2' />
                Delete permanently
              </ContextMenuItem>
            </>
          ) : (
            <>
              {entry.isFolder && (
                <ContextMenuItem onClick={() => href && window.open(href, '_blank')}>
                  <ExternalLink className='w-4 h-4 mr-2' />
                  Open in New Tab
                </ContextMenuItem>
              )}
              {!entry.isFolder && (
                <ContextMenuItem onClick={handleDownload}>
                  <Download className='w-4 h-4 mr-2' />
                  Download
                </ContextMenuItem>
              )}
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => setShowRenameDialog(true)}>
                <Pencil className='w-4 h-4 mr-2' />
                Rename
              </ContextMenuItem>
              <ContextMenuItem onClick={() => setShowShareDialog(true)}>
                <Share2 className='w-4 h-4 mr-2' />
                Public Share
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onMove(entry)}>
                <FolderInput className='w-4 h-4 mr-2' />
                Move
              </ContextMenuItem>
              {entry.isFolder && (
                <ContextMenuItem onClick={() => onRecomputeSize(entry)}>
                  <RefreshCw className='w-4 h-4 mr-2' />
                  Refresh size
                </ContextMenuItem>
              )}
              <ContextMenuItem
                onClick={() => onTrash?.(entry.id, entry.isFolder)}
                className='text-destructive'
              >
                <Trash2 className='w-4 h-4 mr-2' />
                Trash
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      <RenameDialog
        open={showRenameDialog}
        entryId={entry.id}
        isFolder={entry.isFolder}
        currentName={entry.name}
        onClose={() => setShowRenameDialog(false)}
        onRename={onRename}
        checkNameExists={checkIfNameExists ?? (() => true)}
      />
      <CreatePublicShareDialog
        open={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        itemId={entry.id}
        itemName={entry.name}
        itemType={entry.isFolder ? 'folder' : 'file'}
      />
    </>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}
