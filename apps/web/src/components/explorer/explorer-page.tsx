'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRightLeft, Download, LayoutGrid, RefreshCw, SortAsc, Trash } from 'lucide-react';
import {
  ClientRegistry,
  ContentEntry,
  contentTreeStore,
  ContentTreeViewModel,
  FileEntry,
  FolderContentNode,
  FolderEntry,
  renameFile,
  renameFolder,
  trashFileApi,
  trashFilesApi,
  trashFolderApi,
  trashFoldersApi,
} from '@agam-space/client';
import { EmptyFolder } from '@/components/empty-states/empty-folder';
import { NewFolderDialog } from '@/components/folder/new-folder-dialog';
import { ExplorerItem } from '@/components/explorer/explorer-item';
import { ExplorerSkeleton } from '@/components/explorer/explorer-skeleton';
import { toast } from 'sonner';
import { FileUploadButton } from '@/components/upload/file-upload-button';
import { useExplorerRefreshStore } from '@/store/explorer-refresh-store';
import { FileDropZone } from '@/components/upload/file-drop-zone';
import { useUploadStore } from '@/store/upload-store';
import { FilePreviewModal } from '@/components/file-preview/file-preview-modal';
import { MoveDialog } from '@/components/explorer/move-dialog';
import { ExplorerBreadcrumb } from '@/components/explorer/explorer-breadcrumb';
import { WebUploadService } from '@/services/web-upload-files.service';
import { WebDownloadFilesService } from '@/services/web-download-files.service';
import { ExplorerPageService } from '@/services/explorer-page.service';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePreferencesStore } from '@/store/preferences.store';
import { logger } from '@/lib/logger';
import type { SortKey } from '@agam-space/client';

function mapSortKey(uiSortKey: 'name' | 'size' | 'modified' | 'created'): SortKey {
  if (uiSortKey === 'modified') return 'date-modified';
  if (uiSortKey === 'created') return 'date-created';
  return uiSortKey;
}

type ExplorerState = {
  entries: ContentEntry[];
  folders: FolderEntry[];
  files: FileEntry[];
  viewModel: ContentTreeViewModel;
  currentParent: FolderEntry;
};

export function ExplorerPage({ folderId }: { folderId: string }) {
  const contentTreeManager = ClientRegistry.getContentTreeManager();
  const [explorerState, setExplorerState] = useState<ExplorerState | null>(null);

  const [loading, setLoading] = useState(true);
  const [node, setNode] = useState<FolderContentNode | null>(null);

  // const [view, setView] = useState<'grid' | 'list'>('grid');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedEntries, setSelectedEntries] = useState<ContentEntry[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [previewingFile, setPreviewingFile] = useState<FileEntry | null>(null);

  const [moveDialogOpen, setMoveDialogOpen] = useState(false);

  const addUpload = useUploadStore(s => s.addUpload);

  const explorerPrefs = usePreferencesStore(s => s.explorer);
  const setExplorerView = usePreferencesStore(s => s.setExplorerView);
  const setExplorerSortBy = usePreferencesStore(s => s.setExplorerSortBy);
  const setExplorerSortDir = usePreferencesStore(s => s.setExplorerSortDir);
  const setExplorerGroupFolders = usePreferencesStore(s => s.setExplorerGroupFolders);

  function toggleSelection(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const loadFolderState = useCallback(
    async (folderId: string) => {
      const sortParams = {
        key: mapSortKey(explorerPrefs.sortBy),
        direction: explorerPrefs.sortDir,
      };
      logger.debug(
        'ExplorerPage',
        'Loading folder with sort:',
        sortParams,
        'groupFolders:',
        explorerPrefs.groupFolders
      );

      const result = await contentTreeManager.getOrFetch(
        folderId,
        sortParams,
        explorerPrefs.groupFolders
      );
      logger.debug('ExplorerPage', `Loaded entries: ${result?.entries.length} items`);

      setExplorerState(result);
    },
    [contentTreeManager, explorerPrefs.sortBy, explorerPrefs.sortDir, explorerPrefs.groupFolders]
  );

  const refresh = useCallback(
    (newEntry?: ContentEntry) => {
      setLoading(true);

      logger.debug('Explorer', `Refreshing folder state for: ${folderId}`);

      if (newEntry) {
        contentTreeManager.addItem(newEntry, folderId);
      } else {
        logger.debug('Explorer', `Evicting folder data for: ${folderId}`);
        contentTreeManager.store.evictFolderData(folderId);
      }

      loadFolderState(folderId).finally(() => setLoading(false));
    },
    [folderId, loadFolderState, contentTreeManager]
  );

  const handleTrash = async (id: string, isFolder: boolean) => {
    try {
      if (isFolder) {
        await trashFolderApi(id);
      } else {
        await trashFileApi(id);
      }
      toast.success(`${isFolder ? 'Folder' : 'File'} moved to trash.`);
      refresh();
    } catch (e) {
      console.error(e);
      toast.error(`Failed to move ${isFolder ? 'folder' : 'file'} to trash`);
    }
  };

  const getSelectedEntries = (): ContentEntry[] => {
    if (selectedIds.size === 0) return [];
    return explorerState?.entries.filter(i => selectedIds.has(i.id)) || [];
  };

  const isSelectionContainsFolders = () => {
    return getSelectedEntries().some(entry => entry.isFolder);
  };

  const handleBatchTrash = async () => {
    const selected = explorerState?.entries?.filter(i => selectedIds.has(i.id)) || [];

    const fileIds = selected.filter(i => !i.isFolder).map(i => i.id);
    const folderIds = selected.filter(i => i.isFolder).map(i => i.id);

    try {
      const [fileResult, folderResult] = await Promise.all([
        fileIds.length > 0 ? trashFilesApi(fileIds) : Promise.resolve({ failedIds: [] }),
        folderIds.length > 0 ? trashFoldersApi(folderIds) : Promise.resolve({ failedIds: [] }),
      ]);

      const failed = (fileResult.failedIds?.length ?? 0) + (folderResult.failedIds?.length ?? 0);

      if (failed) {
        toast.error(`Failed to trash ${failed} item(s)`);
      } else {
        toast.success(`${fileIds.length + folderIds.length} item(s) moved to Trash`);
      }

      clearSelection();
      refresh();
    } catch (err) {
      toast.error('Something went wrong');
    }
  };

  const handleMove = async (targetId: string | null) => {
    await ExplorerPageService.handleMove(selectedEntries, targetId, folderId);
    setMoveDialogOpen(false);
    refresh();
  };

  useEffect(() => {
    setLoading(true);

    const folderKey = folderId ?? 'root';
    const hadPendingRefresh = useExplorerRefreshStore
      .getState()
      .getAndConsumeRefreshFlag(folderKey);

    if (hadPendingRefresh) {
      logger.debug('Explorer', `Found pending refresh flag on mount for folder: ${folderKey}`);
      refresh();
    } else {
      loadFolderState(folderId).finally(() => setLoading(false));
    }
  }, [folderId, loadFolderState, refresh]);

  useEffect(() => {
    const unsubscribe = contentTreeStore.subscribeToFolder(folderId, updatedNode => {
      setNode(null);
      setTimeout(() => {
        setNode(updatedNode);
      }, 10);
    });

    return () => unsubscribe();
  }, [folderId]);

  useEffect(() => {
    const folderKey = folderId ?? 'root';
    const unsub = useExplorerRefreshStore.subscribe(
      state => state.refreshFlags[folderKey],
      shouldRefresh => {
        if (shouldRefresh) {
          useExplorerRefreshStore.getState().getAndConsumeRefreshFlag(folderKey);
          refresh();
        }
      }
    );

    return () => {
      unsub();
    };
  }, [folderId, refresh]);

  const { entries: contentEntries } = explorerState ?? {};

  if (loading || !explorerState) {
    return <ExplorerSkeleton view={explorerPrefs.view} />;
  }

  function handleItemClick(e: React.MouseEvent, id: string, index: number) {
    const isShift = e.shiftKey;
    const isMeta = e.metaKey || e.ctrlKey;

    if (isShift && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const idsToSelect = contentEntries?.slice(start, end + 1).map(entry => entry.id);

      setSelectedIds(prev => {
        const next = new Set(prev);
        idsToSelect?.forEach(id => next.add(id));
        return next;
      });
    } else if (isMeta) {
      toggleSelection(id); // toggles on Ctrl/Cmd
      setLastSelectedIndex(index);
    } else {
      if (selectedIds.has(id)) {
        // Already selected → deselect
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setLastSelectedIndex(null);
      } else {
        // Select only this
        setSelectedIds(new Set([id]));
        setLastSelectedIndex(index);
      }
    }
  }

  const handleDroppedFiles = async (files: Map<string, File[]>) => {
    await WebUploadService.uploadFilesInFolder(files, folderId);

    const folderKey = folderId ?? 'root';
    useExplorerRefreshStore.getState().triggerRefreshForFolder(folderKey);
  };

  const getEntryById = (id: string): FileEntry | FolderEntry | null => {
    return explorerState.entries?.find(entry => entry.id === id) || null;
  };

  const checkIfNameExists = (id: string, isFolder: boolean, newName: string): boolean => {
    const entries = isFolder ? explorerState.folders : explorerState.files;
    const exists = entries.some(entry => {
      if (entry.id === id) return false;
      return entry.name.toLowerCase().trim() === newName.toLowerCase().trim();
    });
    console.log(
      `Checking if name "${newName}" exists for ${isFolder ? 'folder' : 'file'}: ${exists}`
    );
    return exists;
  };

  const handleRename = async (id: string, isFolder: boolean, newName: string) => {
    try {
      const entry = getEntryById(id);
      if (!entry) {
        return {
          success: false,
          message: 'Entry not found',
        };
      }

      let updatedEntry: ContentEntry;
      if (isFolder) {
        updatedEntry = await renameFolder(entry as FolderEntry, newName);
      } else {
        updatedEntry = await renameFile(entry as FileEntry, newName);
      }
      console.log(`Renamed ${isFolder ? 'folder' : 'file'} ${id} to ${newName}`);

      //contentTreeManager.store.upsertItem(updatedEntry);
      refresh(updatedEntry);

      // const updatedNode = contentTreeStore.updateEntryForPage(updatedEntry, 'name', 'asc', 1);
      // if (updatedNode) {
      //   setNode(updatedNode);
      //   // Update breadcrumb if necessary
      //   const updatedBreadcrumb = breadcrumb.map((b) => {
      //     if (b.id === id) {
      //       return { ...b, name: newName };
      //     }
      //     return b;
      //   });
      //   setBreadcrumb(updatedBreadcrumb);
      // }

      toast.success('Renamed successfully');
    } catch (err) {
      console.error(err);
      toast.error('Rename failed');
    }
  };

  const handleBatchDownload = () => {
    console.log('Download selected:', selectedIds);
    const selectedFiles =
      (explorerState.entries?.filter(i => selectedIds.has(i.id) && !i.isFolder) as FileEntry[]) ||
      [];
    WebDownloadFilesService.enqueueFilesForDownload(selectedFiles);
    clearSelection();
  };

  return (
    <FileDropZone onDropFiles={handleDroppedFiles}>
      <div className='flex flex-col h-full'>
        <ExplorerBreadcrumb currentFolderId={folderId} />

        {/* 🛠️ Action Bar */}
        <div className='flex justify-between items-center px-4 py-2 border-b bg-background'>
          <div className='text-sm text-muted-foreground'>
            {selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : `${contentEntries?.length ?? 0} items`}
          </div>

          <div className='flex gap-2'>
            {selectedIds.size > 0 ? (
              <>
                {/* Selection-specific actions */}
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={handleBatchDownload}
                  title='Download selected'
                  disabled={isSelectionContainsFolders()}
                >
                  <Download className='w-5 h-5' />
                </Button>

                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => setMoveDialogOpen(true)}
                  title='Move selected'
                >
                  <ArrowRightLeft className='w-5 h-5' />
                </Button>
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={handleBatchTrash}
                  title='Trash selected'
                >
                  <Trash className='w-5 h-5 text-red-500' />
                </Button>
                {/* Add download, move, etc. here */}
              </>
            ) : (
              <>
                {/* General controls */}
                {/* Sort dropdown - only show in grid view, list view uses column headers */}
                {explorerPrefs.view === 'grid' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-8 inline-flex items-center gap-2 leading-none'
                        title='Sort'
                      >
                        <SortAsc className='w-4 h-4 mr-1 shrink-0' />
                        <span className='text-sm'>
                          {explorerPrefs.sortBy === 'name'
                            ? 'Name'
                            : explorerPrefs.sortBy === 'size'
                              ? 'Size'
                              : explorerPrefs.sortBy === 'modified'
                                ? 'Modified'
                                : 'Created'}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align='end' sideOffset={6} className='z-50 w-48'>
                      {/* Sort By Section */}
                      <div className='px-2 py-1.5 text-xs font-semibold text-muted-foreground'>
                        Sort by
                      </div>
                      <DropdownMenuItem
                        onClick={() => setExplorerSortBy('name')}
                        className={
                          explorerPrefs.sortBy === 'name' ? 'bg-accent text-accent-foreground' : ''
                        }
                      >
                        Name
                        {explorerPrefs.sortBy === 'name' && (
                          <span className='ml-auto text-primary'>✓</span>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setExplorerSortBy('size')}
                        className={
                          explorerPrefs.sortBy === 'size' ? 'bg-accent text-accent-foreground' : ''
                        }
                      >
                        Size
                        {explorerPrefs.sortBy === 'size' && (
                          <span className='ml-auto text-primary'>✓</span>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setExplorerSortBy('modified')}
                        className={
                          explorerPrefs.sortBy === 'modified'
                            ? 'bg-accent text-accent-foreground'
                            : ''
                        }
                      >
                        Modified
                        {explorerPrefs.sortBy === 'modified' && (
                          <span className='ml-auto text-primary'>✓</span>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setExplorerSortBy('created')}
                        className={
                          explorerPrefs.sortBy === 'created'
                            ? 'bg-accent text-accent-foreground'
                            : ''
                        }
                      >
                        Created
                        {explorerPrefs.sortBy === 'created' && (
                          <span className='ml-auto text-primary'>✓</span>
                        )}
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      {/* Sort Direction Section */}
                      <div className='px-2 py-1.5 text-xs font-semibold text-muted-foreground'>
                        Sort direction
                      </div>
                      <DropdownMenuItem
                        onClick={() => setExplorerSortDir('asc')}
                        className={
                          explorerPrefs.sortDir === 'asc' ? 'bg-accent text-accent-foreground' : ''
                        }
                      >
                        A → Z
                        {explorerPrefs.sortDir === 'asc' && (
                          <span className='ml-auto text-primary'>✓</span>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setExplorerSortDir('desc')}
                        className={
                          explorerPrefs.sortDir === 'desc' ? 'bg-accent text-accent-foreground' : ''
                        }
                      >
                        Z → A
                        {explorerPrefs.sortDir === 'desc' && (
                          <span className='ml-auto text-primary'>✓</span>
                        )}
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      {/* Group Folders Section */}
                      <div className='px-2 py-1.5 text-xs font-semibold text-muted-foreground'>
                        Display
                      </div>
                      <DropdownMenuItem
                        onClick={() => setExplorerGroupFolders(true)}
                        className={
                          explorerPrefs.groupFolders ? 'bg-accent text-accent-foreground' : ''
                        }
                      >
                        Folders first
                        {explorerPrefs.groupFolders && (
                          <span className='ml-auto text-primary'>✓</span>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setExplorerGroupFolders(false)}
                        className={
                          !explorerPrefs.groupFolders ? 'bg-accent text-accent-foreground' : ''
                        }
                      >
                        Mix folders & files
                        {!explorerPrefs.groupFolders && (
                          <span className='ml-auto text-primary'>✓</span>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <Button variant='ghost' size='icon' onClick={() => refresh()} title='Refresh'>
                  <RefreshCw className='w-5 h-5' />
                </Button>
                <FileUploadButton
                  uploadManager={ClientRegistry.getUploadManager()}
                  parentFolderId={folderId}
                />
                <NewFolderDialog parentId={folderId} onSuccessAction={refresh} />
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => setExplorerView(explorerPrefs.view === 'grid' ? 'list' : 'grid')}
                  title={
                    explorerPrefs.view === 'grid' ? 'Switch to list view' : 'Switch to grid view'
                  }
                >
                  <LayoutGrid className='w-5 h-5' />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* 📂 Main content */}
        <main
          className='flex-1 overflow-y-auto bg-background'
          onClick={() => {
            clearSelection();
          }}
        >
          {contentEntries?.length === 0 ? (
            <EmptyFolder parentId={folderId} onSuccessAction={refresh} />
          ) : explorerPrefs.view === 'grid' ? (
            <div className='p-4 space-y-2'>
              <div className='grid [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] gap-4'>
                {contentEntries?.map((entry, index) => (
                  <ExplorerItem
                    key={entry.id}
                    entry={entry}
                    view='grid'
                    href={entry.isFolder ? `/explorer/${entry.id}` : undefined}
                    selected={selectedIds.has(entry.id)}
                    multiSelect
                    onClick={e => handleItemClick(e, entry.id, index)}
                    onDoubleClick={
                      !entry.isFolder ? () => setPreviewingFile(entry as FileEntry) : undefined
                    }
                    onTrash={() => handleTrash(entry.id, entry.isFolder)}
                    checkIfNameExists={checkIfNameExists}
                    onRename={handleRename}
                    onMove={item => {
                      selectedIds.add(item.id);
                      setSelectedEntries(getSelectedEntries());
                      setMoveDialogOpen(true);
                    }}
                    onRecomputeSize={
                      entry.isFolder
                        ? async folder => {
                            // TODO: Implement folder size recomputation
                            console.log('Recompute size for folder:', folder.id);
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* ✅ list view header row */}
              <div className='flex items-center h-12 px-4 pr-8 text-sm text-muted-foreground font-medium border-b bg-muted/40'>
                <div className='w-5' />

                {/* Name column - sortable */}
                <button
                  className='flex-1 min-w-0 pl-2 text-left hover:text-foreground transition-colors flex items-center gap-1'
                  onClick={() => {
                    if (explorerPrefs.sortBy === 'name') {
                      setExplorerSortDir(explorerPrefs.sortDir === 'asc' ? 'desc' : 'asc');
                    } else {
                      setExplorerSortBy('name');
                      setExplorerSortDir('asc');
                    }
                  }}
                >
                  Name
                  {explorerPrefs.sortBy === 'name' && (
                    <span className='text-xs'>{explorerPrefs.sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>

                {/* Size column - sortable */}
                <button
                  className='w-24 sm:w-32 md:w-40 lg:w-48 xl:w-56 text-right pr-6 hover:text-foreground transition-colors flex items-center justify-end gap-1'
                  onClick={() => {
                    if (explorerPrefs.sortBy === 'size') {
                      setExplorerSortDir(explorerPrefs.sortDir === 'asc' ? 'desc' : 'asc');
                    } else {
                      setExplorerSortBy('size');
                      setExplorerSortDir('asc');
                    }
                  }}
                >
                  Size
                  {explorerPrefs.sortBy === 'size' && (
                    <span className='text-xs'>{explorerPrefs.sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>

                {/* Modified column - sortable */}
                <button
                  className='hidden sm:flex sm:w-40 md:w-52 lg:w-64 xl:w-72 text-right pr-6 hover:text-foreground transition-colors items-center justify-end gap-1'
                  onClick={() => {
                    if (explorerPrefs.sortBy === 'modified') {
                      setExplorerSortDir(explorerPrefs.sortDir === 'asc' ? 'desc' : 'asc');
                    } else {
                      setExplorerSortBy('modified');
                      setExplorerSortDir('asc');
                    }
                  }}
                >
                  Modified
                  {explorerPrefs.sortBy === 'modified' && (
                    <span className='text-xs'>{explorerPrefs.sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>

                {/* Actions column - not sortable */}
                <div className='w-12 sm:w-16 md:w-20 lg:w-24 text-center'></div>
              </div>

              {/* list view items */}
              <div className='divide-y'>
                {contentEntries?.map((entry, index) => (
                  <ExplorerItem
                    key={entry.id}
                    entry={entry}
                    view='list'
                    href={entry.isFolder ? `/explorer/${entry.id}` : undefined}
                    selected={selectedIds.has(entry.id)}
                    multiSelect
                    onClick={e => handleItemClick(e, entry.id, index)}
                    onDoubleClick={
                      !entry.isFolder ? () => setPreviewingFile(entry as FileEntry) : undefined
                    }
                    onTrash={() => handleTrash(entry.id, entry.isFolder)}
                    onContextOpen={() => {
                      selectedIds.add(entry.id);
                      setSelectedEntries(getSelectedEntries());
                    }}
                    onContextClose={() => {
                      selectedIds.delete(entry.id);
                      setSelectedEntries(getSelectedEntries());
                    }}
                    checkIfNameExists={checkIfNameExists}
                    onRename={handleRename}
                    onMove={item => {
                      selectedIds.add(item.id);
                      setSelectedEntries(getSelectedEntries());
                      setMoveDialogOpen(true);
                    }}
                    onRecomputeSize={
                      entry.isFolder
                        ? async folder => {
                            // TODO: Implement folder size recomputation
                            console.log('Recompute size for folder:', folder.id);
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
            </>
          )}
        </main>

        <FilePreviewModal file={previewingFile} onClose={() => setPreviewingFile(null)} />
      </div>

      <MoveDialog
        open={moveDialogOpen}
        folderId={folderId}
        entries={selectedEntries}
        onClose={() => setMoveDialogOpen(false)}
        handleMove={handleMove}
      />
    </FileDropZone>
  );
}
