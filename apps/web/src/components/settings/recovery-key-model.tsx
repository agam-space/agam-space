'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchE2eeKeys, retrieveRecoveryKey } from '@agam-space/client';
import { useE2eeKeys } from '@/store/e2ee-keys.store';
import { downloadTextFile } from '@/utils/download-text-file';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function RecoveryKeyModal({ open, onClose }: Props) {
  const [step, setStep] = useState<'password' | 'reveal'>('password');
  const [password, setPassword] = useState('');
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { e2eeKeys, setE2eeKeys } = useE2eeKeys();

  const handlePasswordSubmit = async () => {
    setLoading(true);
    setError(null);

    const keys = e2eeKeys || (await fetchE2eeKeys());
    if (!keys) {
      setError('User keys not found. Please set up E2EE keys first.');
      setLoading(false);
      return;
    }

    setE2eeKeys(keys);

    // Validate required fields are present
    if (!keys.encIdentitySeed || !keys.identityEncPubKey) {
      setError('User account not fully migrated. Please try again later.');
      setLoading(false);
      return;
    }

    const result = await retrieveRecoveryKey(password, keys);
    setLoading(false);

    if (!result.success || !result.recoveryKey) {
      setError(result.error || 'Failed to retrieve recovery key');
      return;
    }

    setRecoveryKey(result.recoveryKey);
    setStep('reveal');
  };

  const handleCopy = () => {
    if (!recoveryKey) return;
    navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!recoveryKey) return;
    downloadTextFile(
      'agam-space-recovery-key.txt',
      `Agam Space recovery key\n\n${recoveryKey}\n\nKeep this somewhere safe and offline. Anyone with this key and access to your account can reset your master password. If you lose both your master password and this key, your files cannot be recovered.\n`
    );
  };
  const resetState = () => {
    setStep('password');
    setPassword('');
    setRecoveryKey(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) {
          resetState();
          onClose();
        }
      }}
    >
      <DialogContent className='bg-background'>
        <DialogHeader>
          <DialogTitle>View Recovery Key</DialogTitle>
        </DialogHeader>

        {step === 'password' && (
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='password'>Enter Master Password</Label>
              <Input
                id='password'
                type='password'
                autoComplete='off'
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  setError(null); // clear on change
                }}
                placeholder='••••••••'
              />
              {error && <p className='text-sm text-red-500'>{error}</p>}
            </div>
            <Button onClick={handlePasswordSubmit} disabled={loading}>
              {loading ? 'Checking…' : 'Continue'}
            </Button>
          </div>
        )}

        {step === 'reveal' && (
          <div className='space-y-4'>
            <p className='text-sm text-yellow-600 font-medium'>
              ⚠️ Never share your recovery key. Store it in a secure location. If you lose it, you
              won’t be able to reset your password.
            </p>

            <div className='relative'>
              <pre className='rounded-md border bg-muted p-4 font-mono text-sm whitespace-pre-wrap break-words overflow-auto'>
                <span className='select-all'>{recoveryKey}</span>
              </pre>
              <div className='absolute top-2 right-2 flex gap-1'>
                <Button variant='outline' size='sm' onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
                <Button variant='outline' size='sm' onClick={handleDownload}>
                  Download
                </Button>
              </div>
            </div>

            <Button
              size='sm'
              onClick={() => {
                resetState();
                onClose();
              }}
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
