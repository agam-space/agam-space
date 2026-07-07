'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ClientRegistry, FolderEntry } from '@agam-space/client';

type ExplorerBreadcrumbProps = {
  currentFolderId: string;
};

export function ExplorerBreadcrumb({ currentFolderId }: ExplorerBreadcrumbProps) {
  const MAX_VISIBLE_BREADCRUMB = 5;

  const contentTreeManager = ClientRegistry.getContentTreeManager();
  const [ancestors, setAncestors] = useState<FolderEntry[]>([]);

  const latestFolderIdRef = useRef(currentFolderId);
  latestFolderIdRef.current = currentFolderId;

  useEffect(() => {
    const load = async () => {
      const path = await contentTreeManager.loadAncestorsPath(currentFolderId, 5);
      // Ignore results for a folder we've since navigated away from.
      if (latestFolderIdRef.current !== currentFolderId) return;
      setAncestors(path);
    };

    load();
  }, [contentTreeManager, currentFolderId]);

  const visible = ancestors.slice(0, -1);
  const current = ancestors.at(-1)!;

  const trimmed =
    visible.length > MAX_VISIBLE_BREADCRUMB
      ? [{ id: 'ellipsis', name: '...', parentId: null }, ...visible.slice(-MAX_VISIBLE_BREADCRUMB)]
      : visible;

  return (
    <div className='px-4 py-2 border-b bg-muted/50'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/explorer'>Root</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>

          {trimmed.length > 0 &&
            trimmed.map(entry => (
              <div key={entry.id} className='flex items-center'>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {entry.id === 'ellipsis' ? (
                    <span className='text-muted-foreground'>...</span>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={`/explorer/${entry.id}`}>{entry.name}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </div>
            ))}

          {/* Show current folder (non-clickable) */}
          {current && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <span className='text-foreground font-medium'>{current.name}</span>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
