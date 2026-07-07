'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEffect, useMemo, useState } from 'react';
import { UserStatus, UsersWithQuotaArray } from '@agam-space/shared-types';
import { fetchUsers, formatBytes } from '@agam-space/client';
import { formatLastSeen } from '@/utils/date-formatter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MoreHorizontal } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { AdminService } from '@/services/admin.service';
import { toast } from 'sonner';

export function AdminUserList() {
  const [users, setUsers] = useState<UsersWithQuotaArray>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentUser = useAuth(state => state.user);

  const [quotaDialogOpen, setQuotaDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [quotaValue, setQuotaValue] = useState('');
  const [quotaUnit, setQuotaUnit] = useState<'MB' | 'GB'>('GB');
  const [isUpdatingQuota, setIsUpdatingQuota] = useState(false);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchUsers();
        setUsers(data ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load users');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const StatusBadge = ({ status }: { status: 'active' | 'disabled' | 'deleted' }) => {
    const map: Record<typeof status, { text: string; classes: string }> = {
      active: { text: 'Active', classes: 'bg-emerald-100 text-emerald-700' },
      disabled: { text: 'Disabled', classes: 'bg-amber-100 text-amber-700' },
      deleted: { text: 'Deleted', classes: 'bg-red-100 text-red-700' },
    };

    const { text, classes } = map[status];
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}
      >
        {text}
      </span>
    );
  };

  const changeUserStatus = async (userId: string, status: UserStatus) => {
    try {
      await AdminService.updateUserStatus(userId, status);
      toast.success(`User status updated to ${status}`);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to change user status';
      toast.error(message);
      setError(message);
    }
  };

  const openQuotaDialog = (userId: string, currentQuotaBytes: number) => {
    setSelectedUserId(userId);
    const quotaGB = currentQuotaBytes / 1_000_000_000;
    if (quotaGB >= 1) {
      setQuotaValue(quotaGB.toFixed(2));
      setQuotaUnit('GB');
    } else {
      const quotaMB = currentQuotaBytes / 1_000_000;
      setQuotaValue(quotaMB.toFixed(2));
      setQuotaUnit('MB');
    }
    setQuotaDialogOpen(true);
  };

  const handleQuotaUpdate = async () => {
    if (!selectedUserId) return;

    const valueNum = parseFloat(quotaValue);
    if (isNaN(valueNum) || valueNum < 0) {
      toast.error('Please enter a valid quota value');
      return;
    }

    const bytesMultiplier = quotaUnit === 'GB' ? 1_000_000_000 : 1_000_000;
    const totalStorageQuota = Math.floor(valueNum * bytesMultiplier);

    setIsUpdatingQuota(true);
    try {
      await AdminService.updateUserQuota(selectedUserId, totalStorageQuota);
      toast.success('User quota updated successfully');
      setQuotaDialogOpen(false);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update quota';
      toast.error(message);
    } finally {
      setIsUpdatingQuota(false);
    }
  };

  return (
    <div>
      <div className='mb-4 flex items-center justify-between gap-2'>
        <h2 className='text-xl font-semibold'>User Management</h2>
        <Button onClick={load} disabled={loading} size='sm' variant='secondary'>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      <div className='border rounded-xl overflow-x-auto'>
        {error ? (
          <div className='p-4 text-sm text-red-600 bg-red-50'>{error}</div>
        ) : (
          <table className='w-full text-sm min-w-[720px]'>
            <thead className='bg-muted text-muted-foreground'>
              <tr>
                <th className='text-left px-4 py-2'>Username</th>
                <th className='text-left px-4 py-2'>Email</th>
                <th className='text-left px-4 py-2'>Role</th>
                <th className='text-left px-4 py-2'>Status</th>
                <th className='text-left px-4 py-2'>Quota</th>
                <th className='text-left px-4 py-2'>Last Login</th>
                <th className='text-left px-4 py-2'>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td className='px-4 py-6 text-muted-foreground' colSpan={7}>
                    Loading users…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td className='px-4 py-6 text-muted-foreground' colSpan={7}>
                    No users found
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} className='border-t hover:bg-muted/20'>
                    <td className='px-4 py-2'>
                      {user.username} {currentUser?.id === user.id ? '(You) ' : ''}{' '}
                    </td>
                    <td className='px-4 py-2'>{user.email}</td>
                    <td className='px-4 py-2 capitalize'>{user.role}</td>
                    <td className='px-4 py-2 space-x-2'>
                      <StatusBadge status={user.status as 'active' | 'disabled' | 'deleted'} />
                    </td>
                    <td className='px-4 py-2'>
                      {user.quota ? (
                        <span
                          onClick={() =>
                            openQuotaDialog(user.id, user.quota?.totalStorageQuota || 0)
                          }
                          className='text-blue-600 dark:text-blue-400 hover:underline cursor-pointer'
                          title='Click to edit quota'
                        >
                          {formatBytes(user.quota.usedStorage)} /{' '}
                          {formatBytes(user.quota.totalStorageQuota)}
                        </span>
                      ) : (
                        <span className='text-muted-foreground'>No quota</span>
                      )}
                    </td>
                    <td className='px-4 py-2'>
                      {(() => {
                        const { relative, exact } = formatLastSeen(user.lastLoginAt, 'en');
                        return (
                          <span title={exact ?? undefined} className='whitespace-nowrap'>
                            {relative}
                          </span>
                        );
                      })()}
                    </td>
                    <td className='px-4 py-2'>
                      {user.status === 'deleted' || currentUser?.id === user.id ? (
                        <div className='flex items-center justify-center h-8 w-8'>
                          <span className='text-muted-foreground'></span>
                        </div>
                      ) : (
                        <div className='flex items-center gap-1'>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant='ghost'
                                size='icon'
                                className='h-8 w-8'
                                aria-label='Actions'
                              >
                                <MoreHorizontal className='h-4 w-4' />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align='end' className='w-44'>
                              {user.status === 'active' ? (
                                <DropdownMenuItem
                                  onClick={() => changeUserStatus(user.id, UserStatus.DISABLED)}
                                >
                                  Disable
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => changeUserStatus(user.id, UserStatus.ACTIVE)}
                                >
                                  Enable
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className='text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400'
                                onClick={() => changeUserStatus(user.id, UserStatus.DELETED)}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={quotaDialogOpen} onOpenChange={setQuotaDialogOpen}>
        <DialogContent className='bg-background'>
          <DialogHeader>
            <DialogTitle>Edit User Quota</DialogTitle>
            <DialogDescription>Set the storage quota for this user.</DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-4'>
            <div className='space-y-2'>
              <Label htmlFor='quota'>Quota</Label>
              <div className='flex gap-2'>
                <Input
                  id='quota'
                  type='number'
                  value={quotaValue}
                  onChange={e => setQuotaValue(e.target.value)}
                  placeholder='Enter quota'
                  min='0'
                  step='0.01'
                  className='flex-1'
                />
                <Select
                  value={quotaUnit}
                  onValueChange={(val: string) => setQuotaUnit(val as 'MB' | 'GB')}
                >
                  <SelectTrigger className='w-24'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position='popper' sideOffset={4}>
                    <SelectItem value='MB'>MB</SelectItem>
                    <SelectItem value='GB'>GB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setQuotaDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleQuotaUpdate} disabled={isUpdatingQuota}>
              {isUpdatingQuota ? 'Updating...' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
