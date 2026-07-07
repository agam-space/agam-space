'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@radix-ui/react-label';
import { Input } from '@/components/ui/input';
import {
  getPublicShareMetadataApi,
  getPublicShareKeysApi,
  PublicShareContentManager,
  ContentEntry,
  ApiClientError,
  FileEntry,
  FolderEntry,
} from '@agam-space/client';
import type { PublicShareExternalDetails, PublicShareKeys } from '@agam-space/shared-types';
import { PublicShareLoaderService } from '@/services/public-share-loader.service';
import { logger } from '@/lib/logger';
import { PublicShareFilePreview } from '@/components/public-share/public-share-file-preview';
import { PublicShareFolderExplorer } from '@/components/public-share/public-share-folder-explorer';

interface PublicSharePageProps {
  shareId: string;
  clientKey: string | null;
}

type ShareState = 'loading' | 'error' | 'password-required' | 'decrypting' | 'ready';

export function PublicSharePage({ shareId, clientKey }: PublicSharePageProps) {
  const [state, setState] = useState<ShareState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [metadata, setMetadata] = useState<PublicShareExternalDetails | null>(null);
  const [_contentManager, setContentManager] = useState<PublicShareContentManager | null>(null);
  const [shareKeys, setShareKeys] = useState<{ accessToken: string; fileKey: Uint8Array } | null>(
    null
  );
  const [rootItemName, setRootItemName] = useState<string>('Shared Folder');
  const [decryptedContent, setDecryptedContent] = useState<{
    folders: ContentEntry[];
    files: ContentEntry[];
  } | null>(null);

  useEffect(() => {
    initializeShare();
  }, [shareId, clientKey]);

  const initializeShare = async () => {
    setState('loading');
    setError(null);

    // Validate shareId
    if (!shareId || shareId.trim() === '') {
      setError('Invalid share link. The share ID is missing.');
      setState('error');
      return;
    }

    // Validate clientKey
    if (!clientKey || clientKey.trim() === '') {
      setError(
        'Invalid share link. The encryption key is missing from the URL. Make sure you copied the complete link.'
      );
      setState('error');
      return;
    }

    logger.debug(
      'PublicSharePage',
      'Initializing share with ID:',
      shareId,
      'and clientKey:',
      clientKey
    );

    try {
      const shareMetadata = await getPublicShareMetadataApi(shareId);
      setMetadata(shareMetadata);

      if (shareMetadata.requiredPassword) {
        setState('password-required');
        return;
      }

      await loadShareContent(shareMetadata, undefined);
    } catch (err) {
      handleLoadError(err);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password.trim()) {
      setPasswordError('Please enter a password');
      return;
    }

    setIsSubmitting(true);
    setPasswordError(null);

    try {
      await loadShareContent(metadata!, password);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 403) {
          setPasswordError('Incorrect password. Please try again.');
        } else if (err.status === 429) {
          setPasswordError('Too many incorrect attempts. Please wait and try again later.');
        } else {
          setPasswordError('Unable to verify password. Please try again.');
        }
      } else if (err instanceof Error && err.message.includes('decrypt')) {
        setPasswordError('Failed to decrypt. The password may be incorrect.');
      } else {
        setPasswordError('Unable to verify password. Please try again.');
      }
      setState('password-required');
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadShareContent = async (shareMetadata: PublicShareExternalDetails, pwd?: string) => {
    setState('decrypting');

    try {
      const keys: PublicShareKeys = await getPublicShareKeysApi(shareId, pwd);

      let itemKey: Uint8Array;
      try {
        itemKey = await PublicShareLoaderService.decryptShareItemKey(
          keys.serverShareKey,
          clientKey!,
          keys.salt,
          keys.wrappedItemKey,
          pwd
        );
      } catch (decryptError: unknown) {
        logger.error('PublicSharePage', 'Error during item key decryption', decryptError);
        throw new Error(
          'Failed to decrypt share keys, check if url is copied completely or password is correct',
          { cause: decryptError }
        );
      }

      const manager = new PublicShareContentManager(
        shareId,
        keys.accessToken,
        shareMetadata.itemId,
        itemKey
      );
      setContentManager(manager);
      setShareKeys({ accessToken: keys.accessToken, fileKey: itemKey });

      const content = await manager.getOrFetch('root');

      if (shareMetadata.itemType === 'folder') {
        try {
          const folderName = await manager.getRootFolderName();
          setRootItemName(folderName || 'Shared Folder');
        } catch (err) {
          logger.error('PublicSharePage', 'Failed to decrypt folder name', err);
          setRootItemName('Shared Folder');
        }
      }

      setDecryptedContent({
        folders: content.folders,
        files: content.files,
      });
      setState('ready');
      logger.debug('PublicSharePage', 'Share loaded successfully');
    } catch (err) {
      logger.error('PublicSharePage', 'Error in loadShareContent', err);
      if (pwd) {
        throw err;
      } else {
        handleLoadError(err);
      }
    }
  };

  const handleLoadError = (err: unknown) => {
    let errorMessage = 'Unable to load this share. Please try again.';

    if (err instanceof ApiClientError) {
      if (err.status === 404) {
        errorMessage = 'This share does not exist or is no longer available.';
      } else if (err.status === 410) {
        errorMessage = 'This share has expired.';
      } else {
        errorMessage = err.message || 'Unable to load this share.';
      }
    } else if (err instanceof Error) {
      errorMessage = err.message;
    }

    setError(errorMessage);
    setState('error');
  };

  if (state === 'loading') {
    return (
      <div className='min-h-screen flex items-center justify-center bg-background'>
        <div className='text-center space-y-4'>
          <Loader2 className='h-12 w-12 animate-spin text-primary mx-auto' />
          <p className='text-muted-foreground'>Loading share...</p>
        </div>
      </div>
    );
  }

  if (state === 'decrypting') {
    return (
      <div className='min-h-screen flex items-center justify-center bg-background'>
        <div className='text-center space-y-4'>
          <Loader2 className='h-12 w-12 animate-spin text-primary mx-auto' />
          <p className='text-muted-foreground'>Decrypting content...</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className='min-h-screen flex items-center justify-center bg-background p-4'>
        <div className='max-w-md w-full text-center space-y-4'>
          <AlertCircle className='h-16 w-16 text-destructive mx-auto' />
          <h1 className='text-2xl font-bold'>Share Not Available</h1>
          <p className='text-muted-foreground'>{error}</p>
          <Button variant='outline' onClick={() => (window.location.href = '/')}>
            Go to Home
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'password-required') {
    return (
      <div className='min-h-screen flex items-center justify-center bg-background p-4'>
        <div className='max-w-md w-full space-y-6'>
          <div className='text-center space-y-2'>
            <Lock className='h-12 w-12 text-primary mx-auto' />
            <h1 className='text-2xl font-bold'>Enter Password</h1>
            <p className='text-sm text-muted-foreground'>This share is password protected</p>
          </div>

          <form onSubmit={handlePasswordSubmit} className='space-y-4' autoComplete='off'>
            <div className='space-y-2'>
              <Label htmlFor='password'>Password</Label>
              <Input
                id='password'
                name='share-password'
                type='password'
                placeholder='Enter password'
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={isSubmitting}
                autoFocus
                autoComplete='off'
                data-1p-ignore
                data-lpignore='true'
                data-form-type='other'
              />
              {passwordError && <p className='text-sm text-destructive'>{passwordError}</p>}
            </div>

            <Button type='submit' className='w-full' disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Verifying...
                </>
              ) : (
                'Unlock'
              )}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      {metadata?.itemType === 'file' && decryptedContent?.files[0] && shareKeys ? (
        <PublicShareFilePreview
          fileEntry={decryptedContent.files[0] as FileEntry}
          shareId={shareId}
          accessToken={shareKeys.accessToken}
          fileKey={shareKeys.fileKey}
        />
      ) : (
        _contentManager &&
        shareKeys &&
        decryptedContent && (
          <PublicShareFolderExplorer
            contentManager={_contentManager}
            shareId={shareId}
            accessToken={shareKeys.accessToken}
            rootItemName={rootItemName}
            initialContent={{
              folders: decryptedContent.folders as FolderEntry[],
              files: decryptedContent.files as FileEntry[],
            }}
          />
        )
      )}
    </>
  );
}
