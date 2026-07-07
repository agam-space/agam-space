'use client';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, ChevronRight, Folder, Home } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ClientRegistry, ContentEntry, FolderEntry } from '@agam-space/client';
import { cn } from '@/lib/utils';

export type nullish = null | undefined;
const isRoot = (id: string | nullish) => !id || id === 'root';

interface MoveDialogProps {
  open: boolean;
  folderId?: string | null;
  entries: ContentEntry[];
  onClose: () => void;
  handleMove: (targetId: string | null) => void;
}

export function MoveDialog({ open, folderId, entries, onClose, handleMove }: MoveDialogProps) {
  const ROOT_ID = null;
  const selectedFolderIds = new Set(entries.filter(e => e.isFolder).map(e => e.id));
  const sourceFolderId = isRoot(folderId) ? ROOT_ID : (folderId as string);

  const [currentFolderId, setCurrentFolderId] = useState<string | nullish>(sourceFolderId);
  // Single source of truth for both breadcrumb display and "go up" navigation.
  const [breadcrumb, setBreadcrumb] = useState<FolderEntry[]>([]);
  const [subfolders, setSubfolders] = useState<FolderEntry[]>([]);
  // Explicit override when picking a subfolder without navigating into it; null = target is wherever we're browsing.
  const [selectedSubfolder, setSelectedSubfolder] = useState<FolderEntry | null>(null);
  const [wasOpened, setWasOpened] = useState(false);

  const currentLocationName = isRoot(currentFolderId)
    ? 'Root'
    : (breadcrumb.at(-1)?.name ?? 'this folder');
  const effectiveTargetId = selectedSubfolder ? selectedSubfolder.id : (currentFolderId ?? ROOT_ID);
  const effectiveTargetName = selectedSubfolder ? selectedSubfolder.name : currentLocationName;
  const isEffectiveTargetSameAsSource = effectiveTargetId === sourceFolderId;

  const navigateTo = (id: string | null) => {
    setCurrentFolderId(id);
    setSelectedSubfolder(null);
  };

  const goUp = () => {
    if (isRoot(currentFolderId)) return;
    // breadcrumb's last entry is the current folder itself; the one before it is the parent.
    const parent = breadcrumb.length >= 2 ? breadcrumb[breadcrumb.length - 2] : null;
    navigateTo(parent ? parent.id : ROOT_ID);
  };

  const loadSubfolders = useCallback(async (id: string | null) => {
    const subs = await ClientRegistry.getContentTreeManager().getFolders(id ?? 'root');
    setSubfolders(subs);
  }, []);

  useEffect(() => {
    if (open) {
      if (!wasOpened) {
        setCurrentFolderId(sourceFolderId);
        setSelectedSubfolder(null);
        setWasOpened(true);
      }
    } else {
      setWasOpened(false); // Reset on dialog close
    }
  }, [open, sourceFolderId, wasOpened]);

  useEffect(() => {
    if (open) {
      loadSubfolders(currentFolderId ?? null);
    }
  }, [currentFolderId, open, loadSubfolders]);

  useEffect(() => {
    if (!open) return;

    if (isRoot(currentFolderId)) {
      setBreadcrumb([]);
      return;
    }

    ClientRegistry.getContentTreeManager()
      .loadAncestorsPath(currentFolderId!, 10)
      .then(setBreadcrumb)
      .catch(() => setBreadcrumb([]));
  }, [currentFolderId, open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='bg-background'>
        <DialogHeader>
          <DialogTitle>Move selected items</DialogTitle>
        </DialogHeader>

        {/* Breadcrumb - unambiguous single source of truth for "where am I" */}
        <div className='flex items-center flex-wrap gap-1 text-sm text-muted-foreground border rounded-md px-2 py-1.5 bg-muted/20'>
          <button
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted transition-colors',
              isRoot(currentFolderId) && 'bg-muted font-medium text-foreground'
            )}
            onClick={() => navigateTo(ROOT_ID)}
          >
            <Home className='w-3.5 h-3.5' />
            Root
          </button>
          {breadcrumb.map((folder, index) => (
            <div key={folder.id} className='flex items-center gap-1'>
              <ChevronRight className='w-3.5 h-3.5 shrink-0' />
              <button
                className={cn(
                  'px-1.5 py-0.5 rounded hover:bg-muted transition-colors truncate max-w-[140px]',
                  index === breadcrumb.length - 1 && 'bg-muted font-medium text-foreground'
                )}
                onClick={() => navigateTo(folder.id)}
                title={folder.name}
              >
                {folder.name}
              </button>
            </div>
          ))}
        </div>

        <div className='max-h-64 overflow-y-auto space-y-1'>
          <div className='bg-muted/30 rounded-md border max-h-64 overflow-y-auto space-y-1 p-2'>
            {!isRoot(currentFolderId) && (
              <button
                className='w-full text-left px-2 py-1 hover:bg-muted rounded text-sm'
                onClick={goUp}
              >
                <ChevronRight className='inline w-4 h-4 mr-2 rotate-180' />
                ..
              </button>
            )}
            {/* Explicit option to target the folder currently being browsed, including Root. */}
            <div
              className={cn(
                'flex items-center justify-between w-full text-left px-3 py-2 rounded-md cursor-pointer text-sm transition-colors',
                !selectedSubfolder ? 'bg-muted font-medium' : 'hover:bg-accent'
              )}
              onClick={() => setSelectedSubfolder(null)}
            >
              <span className='flex items-center'>
                {isRoot(currentFolderId) ? (
                  <Home className='inline w-4 h-4 mr-2' />
                ) : (
                  <Folder className='inline w-4 h-4 mr-2' />
                )}
                {currentLocationName}
              </span>
              {!selectedSubfolder && <Check className='w-4 h-4 text-primary' />}
            </div>
            {subfolders
              .filter(folder => !selectedFolderIds.has(folder.id))
              .map(folder => (
                <div
                  key={folder.id}
                  className={cn(
                    'flex items-center justify-between w-full text-left px-3 py-2 rounded-md cursor-pointer text-sm transition-colors',
                    selectedSubfolder?.id === folder.id ? 'bg-muted font-medium' : 'hover:bg-accent'
                  )}
                  onClick={() => setSelectedSubfolder(folder)}
                  onDoubleClick={() => navigateTo(folder.id)}
                >
                  <span className='flex items-center'>
                    <Folder className='inline w-4 h-4 mr-2' />
                    {folder.name}
                  </span>
                  {selectedSubfolder?.id === folder.id && (
                    <Check className='w-4 h-4 text-primary' />
                  )}
                </div>
              ))}
            {subfolders.length === 0 && (
              <p className='px-2 py-1 text-xs text-muted-foreground'>No subfolders here.</p>
            )}
          </div>
        </div>

        <DialogFooter className='pt-2'>
          <Button variant='outline' onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => handleMove(effectiveTargetId)}
            disabled={isEffectiveTargetSameAsSource}
            title={isEffectiveTargetSameAsSource ? 'Items are already in this folder' : undefined}
          >
            Move to {effectiveTargetName}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
