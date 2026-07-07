'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEffect, useMemo, useState } from 'react';
import { InviteCodeList } from '@agam-space/shared-types';
import { listInviteCodes, createInviteCode, revokeInviteCode } from '@agam-space/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Copy, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';

type DurationUnit = 'hours' | 'days';

export function AdminInviteCodes() {
  const [invites, setInvites] = useState<InviteCodeList>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [enableExpiry, setEnableExpiry] = useState(false);
  const [duration, setDuration] = useState('7');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('days');

  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [createdInviteId, setCreatedInviteId] = useState('');
  const [createdInviteUrl, setCreatedInviteUrl] = useState('');

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listInviteCodes();
        setInvites(data ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load invite codes');
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

  const calculateExpiryDate = (): Date => {
    const now = new Date();
    const durationNum = parseInt(duration) || 0;
    switch (durationUnit) {
      case 'hours':
        return new Date(now.getTime() + durationNum * 60 * 60 * 1000);
      case 'days':
        return new Date(now.getTime() + durationNum * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() + durationNum * 24 * 60 * 60 * 1000);
    }
  };

  const handleCreateInvite = async () => {
    setIsCreating(true);
    try {
      const result = await createInviteCode({
        email: email || undefined,
        maxUses: maxUses ? parseInt(maxUses) : undefined,
        expiresAt: enableExpiry ? calculateExpiryDate().toISOString() : undefined,
      });

      setCreatedInviteId(result.code);
      setCreatedInviteUrl(`${window.location.origin}${result.inviteUrl}`);
      setCreateDialogOpen(false);
      setSuccessDialogOpen(true);

      // Reset form
      setEmail('');
      setMaxUses('1');
      setEnableExpiry(false);
      setDuration('7');
      setDurationUnit('days');

      await load();
      toast.success('Invite code created successfully');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create invite code';
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeInviteCode(id);
      toast.success('Invite code revoked');
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to revoke invite code';
      toast.error(message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return 'Never';
    const d = typeof date === 'string' ? new Date(date) : date;
    return formatDistanceToNow(d, { addSuffix: true });
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center p-8'>
        <div className='text-muted-foreground'>Loading invite codes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex flex-col items-center justify-center p-8 space-y-4'>
        <div className='text-destructive'>{error}</div>
        <Button onClick={load}>Retry</Button>
      </div>
    );
  }

  return (
    <div>
      <div className='mb-4 flex items-center justify-between gap-2'>
        <h2 className='text-xl font-semibold'>Invite Codes</h2>
        {invites.length > 0 && (
          <Button onClick={() => setCreateDialogOpen(true)} size='sm'>
            <Plus className='mr-2 h-4 w-4' />
            Create Invite
          </Button>
        )}
      </div>

      {invites.length === 0 && !loading ? (
        <div className='border rounded-xl p-12 text-center'>
          <div className='mx-auto max-w-sm'>
            <h3 className='text-lg font-medium mb-2'>No invite codes yet</h3>
            <p className='text-muted-foreground mb-6'>
              Create invite codes to allow specific users to sign up for your application.
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} variant='outline'>
              <Plus className='mr-2 h-4 w-4' />
              Create Your First Invite
            </Button>
          </div>
        </div>
      ) : (
        <div className='border rounded-xl overflow-x-auto'>
          {error ? (
            <div className='p-4 text-sm text-destructive bg-destructive/10'>{error}</div>
          ) : (
            <table className='w-full text-sm min-w-[640px]'>
              <thead className='bg-muted text-muted-foreground'>
                <tr>
                  <th className='text-left px-4 py-2'>Code</th>
                  <th className='text-left px-4 py-2'>Email</th>
                  <th className='text-left px-4 py-2'>Usage</th>
                  <th className='text-left px-4 py-2'>Expires</th>
                  <th className='text-left px-4 py-2'>Created</th>
                  <th className='text-left px-4 py-2'>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className='px-4 py-6 text-muted-foreground' colSpan={6}>
                      Loading invite codes…
                    </td>
                  </tr>
                ) : (
                  invites.map(invite => (
                    <tr key={invite.id} className='border-t hover:bg-muted/20'>
                      <td className='px-4 py-2'>
                        <div className='flex items-center gap-2'>
                          <code className='font-mono bg-muted px-2 py-1 rounded'>{invite.id}</code>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-6 w-6'
                            onClick={() => copyToClipboard(invite.id)}
                          >
                            <Copy className='h-3 w-3' />
                          </Button>
                        </div>
                      </td>
                      <td className='px-4 py-2'>
                        {invite.email || <span className='text-muted-foreground'>Any user</span>}
                      </td>
                      <td className='px-4 py-2'>
                        {invite.currentUses} / {invite.maxUses}
                      </td>
                      <td className='px-4 py-2'>
                        <span className='text-muted-foreground whitespace-nowrap'>
                          {formatDate(invite.expiresAt)}
                        </span>
                      </td>
                      <td className='px-4 py-2'>
                        <span className='text-muted-foreground whitespace-nowrap'>
                          {formatDate(invite.createdAt)}
                        </span>
                      </td>
                      <td className='px-4 py-2'>
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
                            <DropdownMenuItem
                              onClick={() =>
                                copyToClipboard(
                                  `${window.location.origin}/signup?inviteCode=${invite.id}`
                                )
                              }
                            >
                              <Copy className='mr-2 h-4 w-4' />
                              Copy Invite Link
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleRevoke(invite.id)}
                              className='text-destructive'
                            >
                              <Trash2 className='mr-2 h-4 w-4' />
                              Revoke
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create Invite Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className='bg-background'>
          <DialogHeader>
            <DialogTitle>Create Invite Code</DialogTitle>
            <DialogDescription>
              Generate a new invite code to allow users to sign up
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-4'>
            <div className='space-y-2'>
              <Label htmlFor='email'>Email (Optional)</Label>
              <Input
                id='email'
                type='email'
                placeholder='user@example.com'
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
              <p className='text-xs text-muted-foreground'>
                Lock this invite to a specific email address
              </p>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='maxUses'>Max Uses</Label>
              <Input
                id='maxUses'
                type='number'
                min='1'
                max='100'
                placeholder='1'
                value={maxUses}
                onChange={e => setMaxUses(e.target.value)}
                disabled={!!email}
              />
              <p className='text-xs text-muted-foreground'>
                {email
                  ? 'Automatically set to 1 for email-specific invites'
                  : 'How many users can use this code (1-100)'}
              </p>
            </div>
            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='enable-expiry' className='cursor-pointer'>
                  Set expiration
                </Label>
                <Switch
                  id='enable-expiry'
                  checked={enableExpiry}
                  onCheckedChange={setEnableExpiry}
                />
              </div>
              {enableExpiry && (
                <div className='flex gap-2'>
                  <Input
                    type='number'
                    min='1'
                    placeholder='Duration'
                    value={duration}
                    onChange={e => setDuration(e.target.value)}
                    className='flex-1'
                  />
                  <Select
                    value={durationUnit}
                    onValueChange={(v: DurationUnit) => setDurationUnit(v)}
                  >
                    <SelectTrigger className='w-[130px]'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position='popper' sideOffset={4}>
                      <SelectItem value='hours'>Hours</SelectItem>
                      <SelectItem value='days'>Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateInvite} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent className='bg-background'>
          <DialogHeader>
            <DialogTitle>Invite Code Created!</DialogTitle>
            <DialogDescription>
              Share this link with the user to allow them to sign up
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-4'>
            <div className='space-y-2'>
              <Label>Invite Code</Label>
              <div className='flex items-center gap-2'>
                <code className='flex-1 text-sm font-mono bg-muted px-3 py-2 rounded'>
                  {createdInviteId}
                </code>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => copyToClipboard(createdInviteId)}
                >
                  <Copy className='h-4 w-4' />
                </Button>
              </div>
            </div>
            <div className='space-y-2'>
              <Label>Invite URL</Label>
              <div className='flex items-center gap-2'>
                <code className='flex-1 text-sm font-mono bg-muted px-3 py-2 rounded break-all'>
                  {createdInviteUrl}
                </code>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => copyToClipboard(createdInviteUrl)}
                >
                  <Copy className='h-4 w-4' />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSuccessDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
