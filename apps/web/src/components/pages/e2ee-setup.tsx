'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setupCmkWithPassword } from '@/lib/e2ee';
import { useE2eeKeys } from '@/store/e2ee-keys.store';
import { downloadBlobAsFile } from '@agam-space/client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

export default function E2eeSetupPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  const initialKeysRef = useRef(useE2eeKeys.getState().e2eeKeys);
  const fetchErrorRef = useRef(useE2eeKeys.getState().fetchError);

  const copyTimeout = useRef<NodeJS.Timeout | null>(null);

  const clipboardSupported = !!navigator.clipboard?.writeText;

  const handleCopy = () => {
    if (!clipboardSupported) {
      console.warn('Clipboard API not supported');
      return;
    }

    navigator.clipboard
      .writeText(recoveryKey)
      .then(() => {
        setCopied(true);

        if (copyTimeout.current) {
          clearTimeout(copyTimeout.current);
        }

        copyTimeout.current = setTimeout(() => {
          setCopied(false);
        }, 1500);
      })
      .catch(err => {
        console.error('Copy failed:', err);
      });
  };

  const handleDownload = () => {
    const content = `Agam Space recovery key\n\n${recoveryKey}\n\nKeep this somewhere safe and offline. Anyone with this key and access to your account can reset your master password. If you lose both your master password and this key, your files cannot be recovered.\n`;
    downloadBlobAsFile(new Blob([content], { type: 'text/plain' }), 'agam-space-recovery-key.txt');
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    if (password !== confirm) {
      setError('Passwords do not match');
      setSubmitting(false);
      return;
    }

    try {
      const { recoveryKey } = await setupCmkWithPassword(password);
      setRecoveryKey(recoveryKey);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (fetchErrorRef.current) {
    return (
      <div className='min-h-screen flex items-center justify-center px-4'>
        <div className='w-full max-w-md space-y-6'>
          <div className='text-center space-y-3'>
            <div className='text-red-600 text-5xl mb-2'>⚠</div>
            <h1 className='text-2xl font-semibold'>Unable to Load Encryption Settings</h1>
            <p className='text-muted-foreground'>{fetchErrorRef.current}</p>
          </div>
          <div className='flex flex-col gap-3'>
            <Button onClick={() => window.location.reload()} size='lg' className='w-full'>
              Refresh Page
            </Button>
            <Button variant='outline' onClick={() => router.replace('/login')} className='w-full'>
              Back to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (initialKeysRef.current?.encCmkWithPassword) {
    return (
      <div className='min-h-screen flex items-center justify-center px-4'>
        <div className='w-full max-w-md space-y-6'>
          <div className='text-center space-y-3'>
            <div className='text-green-600 text-5xl mb-2'>✓</div>
            <h1 className='text-2xl font-semibold'>You're All Set</h1>
            <p className='text-muted-foreground'>
              Your encryption is already configured. You can start uploading files or manage your
              settings.
            </p>
          </div>
          <div className='flex flex-col gap-3'>
            <Button onClick={() => router.replace('/explorer')} size='lg'>
              Go to Files
            </Button>
            <Button variant='outline' onClick={() => router.replace('/settings/encryption')}>
              Security Settings
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen flex items-center justify-center px-4'>
      <div className='w-full max-w-md space-y-6'>
        <div className='text-center space-y-2'>
          <div className='text-4xl mb-2'>🔐</div>
          <h1 className='text-2xl font-semibold'>Secure Your Files</h1>
          <p className='text-sm text-muted-foreground'>
            Create a master password to encrypt all your files end-to-end.
          </p>
        </div>

        {!recoveryKey && (
          <>
            <div className='border rounded-lg p-4 bg-muted/50'>
              <p className='text-sm text-muted-foreground leading-relaxed'>
                <span className='font-medium text-foreground'>Your master password</span> encrypts
                all files. Make it strong and unique. We cannot recover it if forgotten. This is
                separate from your login password.
              </p>
            </div>

            <form onSubmit={handleSubmit} className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='password'>Master Password</Label>
                <Input
                  id='password'
                  type='password'
                  autoComplete='off'
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder='Enter a strong passphrase or password'
                  required
                  minLength={6}
                />
                <p className='text-xs text-muted-foreground'>
                  Recommended: 12+ characters or a memorable passphrase
                </p>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='confirm'>Confirm Master Password</Label>
                <Input
                  id='confirm'
                  type='password'
                  autoComplete='off'
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder='Re-enter your passphrase or password'
                  required
                />
              </div>

              <Button className='w-full' type='submit' disabled={submitting}>
                {submitting ? 'Setting up encryption...' : 'Continue'}
              </Button>

              {error && (
                <div className='text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded p-3 text-center'>
                  {error}
                </div>
              )}
            </form>
          </>
        )}
        {recoveryKey && (
          <div className='space-y-6 border p-6 rounded-md bg-muted'>
            <div className='space-y-2 text-center'>
              <div className='text-green-600 text-4xl mb-2'>✓</div>
              <h2 className='text-xl font-semibold'>Encryption Enabled</h2>
              <p className='text-muted-foreground'>
                Save your recovery key to regain access if you forget your master password.
              </p>
            </div>

            <div className='space-y-3'>
              <Label className='text-base'>Recovery Key</Label>
              <div className='flex items-center gap-2'>
                <Input
                  value={recoveryKey}
                  readOnly
                  className='font-mono bg-background text-foreground'
                />
                {clipboardSupported && (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={handleCopy}
                    className='shrink-0'
                  >
                    {copied ? '✓' : 'Copy'}
                  </Button>
                )}
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={handleDownload}
                  className='shrink-0'
                >
                  Download
                </Button>
              </div>
            </div>

            <div className='flex items-start gap-3 p-3 rounded border bg-background'>
              <input
                type='checkbox'
                id='ack'
                checked={acknowledged}
                onChange={e => setAcknowledged(e.target.checked)}
                className='mt-0.5'
              />
              <label htmlFor='ack' className='text-sm cursor-pointer'>
                I’ve saved my recovery key securely
              </label>
            </div>

            <Button
              className='w-full'
              onClick={() => router.replace('/explorer')}
              disabled={!acknowledged}
            >
              Continue
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
