'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  PublicShareContentManager,
  FileEntry,
  FolderEntry,
  ContentEntry,
  formatBytes,
} from '@agam-space/client';
import { Folder, ChevronRight, Home, Loader2, Moon, Sun, Monitor, ArrowUpDown } from 'lucide-react';
import { getFileIconV2 } from '@/lib/file-mime-icon';
import { PublicShareFilePreview } from './public-share-file-preview';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ThemeService } from '@/services/theme.service';

type ThemeOption = 'light' | 'dark' | 'system';
type SortBy = 'name' | 'size' | 'modified';
type SortDirection = 'asc' | 'desc';

type Props = {
  contentManager: PublicShareContentManager;
  shareId: string;
  accessToken: string;
  rootItemName: string;
  initialContent: {
    folders: FolderEntry[];
    files: FileEntry[];
  };
};

type BreadcrumbItem = {
  id: string;
  name: string;
};

export function PublicShareFolderExplorer({
  contentManager,
  shareId,
  accessToken,
  rootItemName,
  initialContent,
}: Props) {
  const [_currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: 'root', name: rootItemName },
  ]);
  const [content, setContent] = useState(initialContent);
  const [loading, setLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const [theme, setTheme] = useState<ThemeOption>('system');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  useEffect(() => {
    setTheme(ThemeService.getCurrentTheme());
    ThemeService.applyTheme(ThemeService.getCurrentTheme());

    const unsubscribe = ThemeService.onSystemPreferenceChange(isDark => {
      document.documentElement.classList.toggle('dark', isDark);
    });

    return unsubscribe;
  }, []);

  const sortedEntries = useMemo(() => {
    const allEntries: ContentEntry[] = [...content.folders, ...content.files];

    return allEntries.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name': {
          comparison = a.name.localeCompare(b.name);
          break;
        }
        case 'size': {
          const sizeA = a.isFolder ? 0 : (a as FileEntry).size;
          const sizeB = b.isFolder ? 0 : (b as FileEntry).size;
          comparison = sizeA - sizeB;
          break;
        }
        case 'modified': {
          const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          comparison = dateA - dateB;
          break;
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [content.folders, content.files, sortBy, sortDirection]);

  const toggleSort = (newSortBy: SortBy) => {
    if (sortBy === newSortBy) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortDirection('asc');
    }
  };

  const toggleTheme = () => {
    const next = ThemeService.getNextTheme(theme);
    ThemeService.setTheme(next);
    setTheme(next);
  };

  const navigateToFolder = async (folderId: string, folderName: string) => {
    setLoading(true);
    try {
      const result = await contentManager.getOrFetch(folderId);
      setContent({ folders: result.folders, files: result.files });
      setCurrentFolderId(folderId);
      setBreadcrumbs([...breadcrumbs, { id: folderId, name: folderName }]);
    } catch (err) {
      console.error('Failed to load folder:', err);
    } finally {
      setLoading(false);
    }
  };

  const navigateToBreadcrumb = async (index: number) => {
    if (index === breadcrumbs.length - 1) return; // Already here

    const targetBreadcrumb = breadcrumbs[index];
    setLoading(true);
    try {
      const result = await contentManager.getOrFetch(
        targetBreadcrumb.id === 'root' ? undefined : targetBreadcrumb.id
      );
      setContent({ folders: result.folders, files: result.files });
      setCurrentFolderId(targetBreadcrumb.id);
      setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    } catch (err) {
      console.error('Failed to navigate:', err);
    } finally {
      setLoading(false);
    }
  };

  if (previewFile) {
    const fileKey = contentManager['keyCache'].get(previewFile.id);
    if (!fileKey) {
      console.error('File key not found for preview');
      setPreviewFile(null);
      return null;
    }

    return (
      <PublicShareFilePreview
        fileEntry={previewFile}
        shareId={shareId}
        accessToken={accessToken}
        fileKey={fileKey}
        onClose={() => setPreviewFile(null)}
      />
    );
  }

  return (
    <div className='min-h-screen bg-background flex flex-col'>
      {/* Toolbar */}
      <div className='border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
        <div className='px-6 py-3'>
          <div className='flex items-center justify-between'>
            {/* Breadcrumb */}
            <div className='flex items-center gap-2 min-w-0 flex-1'>
              {breadcrumbs.map((crumb, index) => (
                <div key={crumb.id} className='flex items-center gap-2'>
                  {index > 0 && (
                    <ChevronRight className='w-4 h-4 text-muted-foreground flex-shrink-0' />
                  )}
                  <button
                    onClick={() => navigateToBreadcrumb(index)}
                    className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors ${
                      index === breadcrumbs.length - 1
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                    disabled={index === breadcrumbs.length - 1}
                  >
                    {index === 0 && <Home className='w-4 h-4' />}
                    <span className='truncate max-w-[150px]'>{crumb.name}</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Theme toggle and sort */}
            <div className='flex items-center gap-2'>
              {/* Sort dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant='ghost' size='sm' className='gap-2'>
                    <ArrowUpDown className='w-4 h-4' />
                    <span className='hidden sm:inline'>Sort</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align='end'
                  sideOffset={6}
                  className='z-50 w-48 rounded-md border bg-white dark:bg-zinc-900 text-black dark:text-white shadow-md'
                >
                  <DropdownMenuItem
                    onClick={() => toggleSort('name')}
                    className={sortBy === 'name' ? 'bg-accent text-accent-foreground' : ''}
                  >
                    Name
                    {sortBy === 'name' && (
                      <span className='ml-auto'>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => toggleSort('size')}
                    className={sortBy === 'size' ? 'bg-accent text-accent-foreground' : ''}
                  >
                    Size
                    {sortBy === 'size' && (
                      <span className='ml-auto'>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => toggleSort('modified')}
                    className={sortBy === 'modified' ? 'bg-accent text-accent-foreground' : ''}
                  >
                    Modified
                    {sortBy === 'modified' && (
                      <span className='ml-auto'>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Theme toggle */}
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
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-auto'>
        <div className='px-6 py-6'>
          {loading ? (
            <div className='flex items-center justify-center py-12'>
              <Loader2 className='w-8 h-8 animate-spin text-muted-foreground' />
            </div>
          ) : sortedEntries.length > 0 ? (
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'>
              {sortedEntries.map(entry => (
                <button
                  key={entry.id}
                  onClick={() => {
                    if (entry.isFolder) {
                      navigateToFolder(entry.id, entry.name);
                    } else {
                      setPreviewFile(entry as FileEntry);
                    }
                  }}
                  className='group flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-all text-left'
                >
                  {entry.isFolder ? (
                    <Folder className='w-8 h-8 text-yellow-500 flex-shrink-0 group-hover:scale-110 transition-transform' />
                  ) : (
                    getFileIconV2((entry as FileEntry).mime, entry.name)
                  )}
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm font-medium truncate group-hover:text-foreground'>
                      {entry.name}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {entry.isFolder
                        ? entry.createdAt
                          ? new Date(entry.createdAt).toLocaleDateString()
                          : ''
                        : formatBytes((entry as FileEntry).size)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            /* Empty state */
            <div className='flex flex-col items-center justify-center py-12 text-center'>
              <Folder className='w-16 h-16 text-muted-foreground/50 mb-4' />
              <h3 className='text-lg font-medium mb-1'>This folder is empty</h3>
              <p className='text-sm text-muted-foreground'>
                There are no files or folders to display
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
