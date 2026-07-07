import { CmkManager } from '../keys/cmk-manager';
import { IdentityKeyManager } from '@agam-space/core';
import { ResetCmkPasswordRequest, UserKeys, UserKeysSetup } from '@agam-space/shared-types';
import { decryptCmkWithRecovery } from './recovery-key';
import { generateCmkChallenge } from '@agam-space/core';
import { resetCmkPasswordApi } from '../api';

type UserKeysInput = UserKeysSetup | UserKeys;

export async function validateMasterPassword(
  masterPassword: string,
  userKeys: UserKeysInput
): Promise<boolean> {
  try {
    const cmk = await decryptCmkWithPassword(
      userKeys.encCmkWithPassword,
      masterPassword,
      userKeys.kdfMetadata.salt
    );
    if (!cmk) {
      return false;
    }

    return true;
  } catch (e) {
    console.error('Master password validation failed:', e);
    return false;
  }
}

export async function decryptCmkWithPassword(
  encCmkWithPassword: string,
  masterPassword: string,
  salt: string
): Promise<Uint8Array | null> {
  try {
    const cmkManager = new CmkManager();
    return await cmkManager.decryptCmkWithPassword(encCmkWithPassword, masterPassword, salt);
  } catch (e) {
    console.error('Failed to decrypt CMK with password:', e);
    return null;
  }
}

export async function resetMasterPassword(
  recoveryKey: string,
  newPassword: string,
  userKeys: UserKeysInput
): Promise<{
  success: boolean;
  userKeys?: UserKeys | null;
  error?: string;
}> {
  try {
    const cmkManager = new CmkManager();

    const cmk = await decryptCmkWithRecovery(recoveryKey, userKeys);

    if (!cmk) {
      return {
        success: false,
        error: 'Invalid recovery key',
      };
    }

    const encCmkWithPassword = await cmkManager.encryptCmkWithPassword(
      cmk,
      newPassword,
      userKeys.kdfMetadata.salt
    );

    if (!userKeys.encIdentitySeed) {
      return {
        success: false,
        error: 'User account not fully migrated. Please try again later.',
      };
    }

    const identitySeed = await cmkManager.decryptIdentitySeedWithCmk(userKeys.encIdentitySeed, cmk);
    const identityKeys = await IdentityKeyManager.generateIdentityKeys(identitySeed);
    const privateKey = identityKeys.signKey.privateKey;

    const signaturePayload = {
      encCmkWithPassword,
    };
    const signatureResult = await generateCmkChallenge(signaturePayload, privateKey);

    const request: ResetCmkPasswordRequest = {
      encCmkWithPassword,
      challengeData: {
        ...signatureResult,
      },
    };

    const updatedUserKeys = await resetCmkPasswordApi(request);
    if (!updatedUserKeys) {
      return {
        success: false,
        error: 'Failed to reset master password',
      };
    }

    return {
      success: true,
      userKeys: updatedUserKeys,
    };
  } catch (e) {
    console.error('Failed to reset master password:', e);
    return {
      success: false,
      error: 'Failed to reset master password',
    };
  }
}
