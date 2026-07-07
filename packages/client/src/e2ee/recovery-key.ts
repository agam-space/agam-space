import { CmkManager } from '../keys/cmk-manager';
import { UserKeysSetup, UserKeys } from '@agam-space/shared-types';
import { encodeBase58 } from '@agam-space/core';
import { decryptCmkWithPassword } from './master-password';

type RecoveryKeyInput = UserKeysSetup | UserKeys;

export async function retrieveRecoveryKey(
  masterPassword: string,
  userKeys: RecoveryKeyInput
): Promise<{
  success: boolean;
  recoveryKey?: string;
  error?: string;
}> {
  const cmk = await decryptCmkWithPassword(
    userKeys.encCmkWithPassword,
    masterPassword,
    userKeys.kdfMetadata.salt
  );

  if (!cmk) {
    return {
      success: false,
      error: 'Invalid master password',
    };
  }

  try {
    const recoveryKeyBytes = await new CmkManager().decryptRecoveryWithCmk(
      userKeys.encRecoveryWithCmk,
      cmk
    );

    const recoveryKey = encodeBase58(recoveryKeyBytes);
    return {
      success: true,
      recoveryKey,
    };
  } catch (e) {
    console.error('Failed to retrieve recovery key:', e);
    return {
      success: false,
      error: 'Failed to retrieve recovery key',
    };
  }
}

export async function validateRecoveryKey(
  recoveryKey: string,
  userKeys: RecoveryKeyInput
): Promise<boolean> {
  const recoveryKeyBytes = await decryptCmkWithRecovery(recoveryKey.trim(), userKeys);
  return !!recoveryKeyBytes;
}

export async function decryptCmkWithRecovery(
  recoveryKey: string,
  userKeys: RecoveryKeyInput
): Promise<Uint8Array | null> {
  try {
    const cmkManager = new CmkManager();
    return await cmkManager.decryptCmkWithRecoveryKey(userKeys.encCmkWithRecovery, recoveryKey);
  } catch (e) {
    console.error('Failed to decrypt CMK with recovery key:', e);
    return null;
  }
}
