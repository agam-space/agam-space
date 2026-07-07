'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/store/auth';
import { useE2eeKeys } from '@/store/e2ee-keys.store';
import { AccountService } from '@/services/account.service';
import { toast } from 'sonner';
import { Copy, Check } from 'lucide-react';

export function AccountSettingsSection() {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);
  const user = useAuth(s => s.user);
  const e2eeKeys = useE2eeKeys(s => s.e2eeKeys);

  const isSSO = !!user?.oidcSubject;

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      await AccountService.changeLoginPassword(currentPassword, newPassword);
      toast.success('Login password changed successfully');
      setShowPasswordForm(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to change password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyFingerprint = async () => {
    if (!e2eeKeys?.identityFingerprint) return;

    try {
      await navigator.clipboard.writeText(e2eeKeys.identityFingerprint);
      setCopiedFingerprint(true);
      setTimeout(() => setCopiedFingerprint(false), 2000);
      toast.success('Fingerprint copied to clipboard');
    } catch {
      toast.error('Failed to copy fingerprint');
    }
  };

  return (
    <div className='space-y-6'>
      <h2 className='text-xl font-semibold'>Account Settings</h2>

      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>Your account details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='space-y-3 text-sm'>
            <div className='flex items-center'>
              <span className='text-muted-foreground w-32'>Username</span>
              <span className='font-medium'>{user?.username}</span>
            </div>

            {user?.email && (
              <div className='flex items-center'>
                <span className='text-muted-foreground w-32'>Email</span>
                <div className='flex items-center gap-2'>
                  <span className='font-medium'>{user.email}</span>
                  {user.isEmailVerified && (
                    <span className='text-sm bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-2.5 py-0.5 rounded font-medium'>
                      Verified
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className='flex items-center'>
              <span className='text-muted-foreground w-32'>Role</span>
              <span className='font-medium capitalize'>{user?.role}</span>
            </div>

            <div className='flex items-center'>
              <span className='text-muted-foreground w-32'>Login Method</span>
              {isSSO ? (
                <span className='text-sm bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2.5 py-0.5 rounded font-medium capitalize'>
                  {user?.oidcProvider ? `${user.oidcProvider} Single Sign-On` : 'Single Sign-On'}
                </span>
              ) : (
                <span className='text-sm bg-muted text-muted-foreground px-2.5 py-0.5 rounded font-medium'>
                  Password
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {e2eeKeys?.identityFingerprint && (
        <Card>
          <CardHeader>
            <CardTitle>Identity Fingerprint</CardTitle>
            <CardDescription>
              A unique identifier that represents your account identity.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 rounded-lg p-4 border border-blue-200 dark:border-blue-800'>
              <div className='space-y-3'>
                <p className='text-sm text-muted-foreground'>Your identity fingerprint:</p>
                <div className='flex items-center gap-3'>
                  <code className='text-lg font-mono font-semibold text-blue-600 dark:text-blue-300 flex-1 break-all'>
                    {e2eeKeys.identityFingerprint}
                  </code>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={handleCopyFingerprint}
                    className='flex-shrink-0'
                  >
                    {copiedFingerprint ? (
                      <Check className='h-4 w-4' />
                    ) : (
                      <Copy className='h-4 w-4' />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!isSSO && (
        <Card>
          <CardHeader>
            <CardTitle>Change Login Password</CardTitle>
            <CardDescription>
              Change your account password (not the master password used for encryption).
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {!showPasswordForm ? (
              <Button variant='outline' onClick={() => setShowPasswordForm(true)}>
                Change Login Password
              </Button>
            ) : (
              <form
                className='space-y-4 max-w-md'
                onSubmit={e => {
                  e.preventDefault();
                  handlePasswordChange();
                }}
              >
                <div className='space-y-2'>
                  <Label htmlFor='current'>Current Password</Label>
                  <Input
                    id='current'
                    type='password'
                    autoComplete='current-password'
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='new'>New Password</Label>
                  <Input
                    id='new'
                    type='password'
                    autoComplete='new-password'
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='confirm'>Confirm New Password</Label>
                  <Input
                    id='confirm'
                    type='password'
                    autoComplete='new-password'
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <div className='flex gap-2'>
                  <Button type='submit' disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => setShowPasswordForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
