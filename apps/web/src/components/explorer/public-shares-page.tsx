'use client';

import { useEffect, useState } from 'react';
import { getFileDecrypted, getFolderInfo, PublicShareService } from '@agam-space/client';
import { Button } from '@/components/ui/button';
import { FileText, Folder, Loader2, Lock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { PublicShareDetails } from '@agam-space/shared-types';

export interface PublicSharesPageEntry extends PublicShareDetails {
  itemName: string;
}

export function PublicSharesPage() {
  const [shares, setShares] = useState<PublicSharesPageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadShares = async () => {
    try {
      setLoading(true);
      const data = await PublicShareService.listShares();

      const sharesWithNames: PublicSharesPageEntry[] = [];
      for (const share of data) {
        let itemName = 'Unknown';

        try {
          if (share.itemType === 'file') {
            const fileEntry = await getFileDecrypted(share.itemId);
            itemName = fileEntry.name;
          } else if (share.itemType === 'folder') {
            const folderEntry = await getFolderInfo(share.itemId);
            itemName = folderEntry.name;
          }

          sharesWithNames.push({
            ...share,
            itemName,
          });
        } catch (error) {
          console.warn(`Failed to load item name for share ${share.id}:`, error);
        }
      }

      setShares(sharesWithNames);
    } catch (error) {
      console.error('Failed to load shares:', error);
      toast.error('Failed to load public shares');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShares();
  }, []);

  const handleRevoke = async (shareId: string) => {
    try {
      setRevokingId(shareId);
      await PublicShareService.revokeShare(shareId);
      toast.success('Share revoked successfully');
      await loadShares(); // Reload list
    } catch (error) {
      console.error('Failed to revoke share:', error);
      toast.error('Failed to revoke share');
    } finally {
      setRevokingId(null);
    }
  };

  const formatExpiry = (expiresAt?: Date | string | null) => {
    if (!expiresAt) return 'Never';
    const date = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
    const now = new Date();
    if (date < now) return 'Expired';
    return `Expires ${formatDistanceToNow(date, { addSuffix: true })}`;
  };

  if (loading) {
    return (
      <div className='h-full flex items-center justify-center'>
        <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
      </div>
    );
  }

  return (
    <div className='h-full flex flex-col'>
      <div className='flex items-center justify-between p-6 border-b'>
        <div>
          <h2 className='text-xl font-semibold'>Public Shares</h2>
          <p className='text-sm text-muted-foreground mt-1'>
            Manage your publicly shared folders and files
          </p>
        </div>
        <Button onClick={loadShares} disabled={loading} size='sm' variant='secondary'>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      <div className='flex-1 overflow-auto p-6'>
        {shares.length === 0 ? (
          <div className='border rounded-xl p-12 text-center text-muted-foreground'>
            <p className='text-lg font-medium'>No public shares yet</p>
            <p className='text-sm mt-2'>
              Right-click any file or folder in the explorer and select &quot;Share&quot; to create
              one
            </p>
          </div>
        ) : (
          <div className='border rounded-xl overflow-hidden'>
            <table className='w-full text-sm'>
              <thead className='bg-muted text-muted-foreground'>
                <tr>
                  <th className='text-left px-4 py-2'>Name</th>
                  <th className='text-left px-4 py-2'>Type</th>
                  <th className='text-left px-4 py-2'>Protection</th>
                  <th className='text-left px-4 py-2'>Share ID</th>
                  <th className='text-left px-4 py-2'>Created</th>
                  <th className='text-left px-4 py-2'>Expires</th>
                  <th className='text-left px-4 py-2'>Action</th>
                </tr>
              </thead>
              <tbody>
                {shares.map(share => (
                  <tr key={share.id} className='border-t hover:bg-accent/50'>
                    <td className='px-4 py-3'>
                      <div className='flex items-center gap-2'>
                        {share.itemType === 'folder' ? (
                          <Folder className='h-4 w-4 text-yellow-500 flex-shrink-0' />
                        ) : (
                          <FileText className='h-4 w-4 text-blue-500 flex-shrink-0' />
                        )}
                        <span className='truncate font-medium'>{share.itemName}</span>
                      </div>
                    </td>
                    <td className='px-4 py-3'>
                      <span className='capitalize text-muted-foreground'>{share.itemType}</span>
                    </td>
                    <td className='px-4 py-3'>
                      {share.requiredPassword ? (
                        <span className='inline-flex items-center gap-1 text-xs font-medium text-foreground bg-muted px-2 py-0.5 rounded'>
                          <Lock className='h-3 w-3' />
                          Password
                        </span>
                      ) : (
                        <span className='text-xs text-muted-foreground'>Link only</span>
                      )}
                    </td>
                    <td className='px-4 py-3'>
                      <code className='text-xs font-mono bg-muted px-2 py-0.5 rounded'>
                        {share.id}
                      </code>
                    </td>
                    <td className='px-4 py-3 text-muted-foreground'>
                      {formatDistanceToNow(new Date(share.createdAt), { addSuffix: true })}
                    </td>
                    <td className='px-4 py-3 text-muted-foreground'>
                      {formatExpiry(share.expiresAt)}
                    </td>
                    <td className='px-4 py-3'>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => handleRevoke(share.id)}
                        disabled={revokingId === share.id}
                        className='h-8 text-destructive hover:text-destructive hover:bg-destructive/10'
                        title='Revoke share'
                      >
                        {revokingId === share.id ? (
                          <Loader2 className='h-4 w-4 animate-spin' />
                        ) : (
                          <>
                            <Trash2 className='h-4 w-4 mr-1' />
                            Revoke
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
