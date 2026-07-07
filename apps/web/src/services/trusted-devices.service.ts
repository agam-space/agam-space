import {
  ApiClientError,
  decryptCmkWithPassword,
  EncryptionRegistry,
  getRegisterChallenge,
  listTrustedDevices,
  registerTrustedDevice,
  removeTrustedDevice,
  requestUnlockChallenge,
  verifyUnlockAssertion,
  deriveKeyFromSecret,
  Argon2idVersion,
} from '@agam-space/client';
import {
  PublicKeyCredentialDescriptorJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { DeviceKeyManager, EncryptedEnvelopeCodec, fromBase64, toBase64 } from '@agam-space/core';
import { toast } from 'sonner';
import { idbDeviceStore } from '@/storage/indexdb';
import { randomBytes } from '@agam-space/core';

export const TrustedDevicesService = {
  async fetchDevices() {
    return await listTrustedDevices();
  },

  async deriveDeviceUnlockKey(
    serverNonce: Uint8Array,
    deviceSeed: Uint8Array,
    salt: Uint8Array
  ): Promise<Uint8Array> {
    const combined = new Uint8Array(serverNonce.length + deviceSeed.length);
    combined.set(serverNonce, 0);
    combined.set(deviceSeed, serverNonce.length);

    const { key } = await deriveKeyFromSecret(combined, salt, Argon2idVersion.light);
    return key;
  },

  async registerDevice({
    userId,
    deviceName,
    cmk,
  }: {
    userId: string;
    deviceName: string;
    cmk: Uint8Array;
  }) {
    const { publicKey: devicePublicKey, privateKey: devicePrivateKey } =
      await DeviceKeyManager.generateDeviceKeyPair();

    const serverNonce = randomBytes(32);
    const salt = randomBytes(16);
    const prfInputBytes = randomBytes(32);

    const challengeResp = await getRegisterChallenge(deviceName);

    // Add PRF extension to options
    const options = { ...challengeResp.options } as PublicKeyCredentialCreationOptionsJSON & {
      extensions?: { prf?: any };
    };
    if (!options.extensions) {
      options.extensions = {};
    }
    options.extensions.prf = {
      eval: {
        first: prfInputBytes,
      },
    };

    const regResp = await startRegistration({
      optionsJSON: options as PublicKeyCredentialCreationOptionsJSON,
    });

    const prfResult = (regResp.clientExtensionResults as any)?.prf;
    const prfEnabled = prfResult?.enabled ?? false;
    let derivedSeed: Uint8Array;

    if (prfEnabled && prfResult?.results?.first) {
      derivedSeed = new Uint8Array(prfResult.results.first);
    } else {
      derivedSeed = randomBytes(32);
    }

    const unlockKey = await this.deriveDeviceUnlockKey(serverNonce, derivedSeed, salt);

    const envelopePriv = await EncryptionRegistry.get().encrypt(devicePrivateKey, unlockKey);
    const encryptedDevicePrivateKey = EncryptedEnvelopeCodec.serializeToTLV(envelopePriv);

    const encryptedCMKBytes = await DeviceKeyManager.encryptWithDevicePublicKey(
      cmk,
      devicePublicKey
    );
    const encryptedCMK = toBase64(encryptedCMKBytes);

    const payload = {
      credentialId: regResp.id,
      attestationObject: regResp.response.attestationObject,
      clientDataJSON: regResp.response.clientDataJSON,
      devicePublicKey: toBase64(devicePublicKey),
      prfInput: prfEnabled ? toBase64(prfInputBytes) : undefined,
      unlockKey: toBase64(serverNonce),
      encryptedCMK,
      deviceName,
      challenge: challengeResp.options.challenge,
      deviceId: challengeResp.deviceId,
    };

    const result = await registerTrustedDevice(payload);

    await idbDeviceStore.storeDeviceData(userId, {
      deviceId: result.deviceId,
      credentialId: regResp.id,
      encryptedDevicePrivateKey: toBase64(encryptedDevicePrivateKey),
      deviceSeed: prfEnabled ? '' : toBase64(derivedSeed),
      devicePublicKey: toBase64(devicePublicKey),
      salt: toBase64(salt),
      prfEnabled,
    });

    return {
      userId,
      deviceId: result.deviceId,
      credentialId: regResp.id,
    };
  },
  async removeDevice(deviceId: string, userId: string) {
    await removeTrustedDevice(deviceId);
    await idbDeviceStore.clearDeviceData(userId);
  },

  async checkAndClearDeviceDataOnLogout(userId: string, clearPreference: boolean) {
    if (!clearPreference || !userId) {
      return;
    }

    try {
      const deviceData = await idbDeviceStore.getDeviceData(userId);
      if (deviceData?.deviceId) {
        await removeTrustedDevice(deviceData.deviceId);
      }
      await idbDeviceStore.clearDeviceData(userId);
    } catch {
      // Ignore errors during logout cleanup
    }
  },

  async getDeviceData(userId: string) {
    return await idbDeviceStore.getDeviceData(userId);
  },

  async unlockWithDevice({
    userId,
    deviceId,
    encryptedCMK,
    devicePublicKey,
  }: {
    userId: string;
    deviceId: string;
    encryptedCMK: string;
    devicePublicKey: string;
  }) {
    const deviceData = await idbDeviceStore.getDeviceData(userId);
    if (!deviceData) {
      throw new Error('Device data not found');
    }

    const challengeResp = await requestUnlockChallenge(deviceId);
    const opts = challengeResp.options;
    if (!opts.challenge || !opts.rpId) {
      throw new Error('Invalid WebAuthn options from backend');
    }

    // Get prfInput from challenge if available (only for PRF-enabled devices)
    const prfInputB64 = (challengeResp as any).prfInput;
    let prfInputBytes: Uint8Array | undefined;

    if (deviceData.prfEnabled) {
      if (!prfInputB64) {
        throw new Error(
          'Device registered with PRF but server did not provide prfInput. ' +
            'This may indicate a database migration issue. Please re-register this device.'
        );
      }
      prfInputBytes = fromBase64(prfInputB64);
    }

    const options: PublicKeyCredentialRequestOptionsJSON = {
      challenge: opts.challenge,
      rpId: opts.rpId,
      userVerification: opts.userVerification,
      timeout: opts.timeout,
      allowCredentials: (opts.allowCredentials ?? []).map(
        (cred: PublicKeyCredentialDescriptorJSON) => ({
          ...cred,
          type: 'public-key' as const,
        })
      ),
    };

    // Add PRF extension if device uses it
    if (deviceData.prfEnabled && prfInputBytes) {
      (options as any).extensions = {
        prf: {
          eval: {
            first: prfInputBytes,
          },
        },
      };
    }

    const assertion = await startAuthentication({ optionsJSON: options });

    const unlockResp = await verifyUnlockAssertion({
      deviceId,
      challengeId: challengeResp.challengeId,
      authenticatorData: assertion.response.authenticatorData,
      clientDataJSON: assertion.response.clientDataJSON,
      signature: assertion.response.signature,
    });

    const { unlockKey: serverNonceB64 } = unlockResp;
    if (!serverNonceB64) {
      throw new Error('Server nonce not returned after authentication');
    }

    const serverNonce = fromBase64(serverNonceB64);

    let derivedSeed: Uint8Array;
    if (deviceData.prfEnabled) {
      const prfResult = (assertion.clientExtensionResults as any)?.prf;

      if (prfResult?.results?.first) {
        derivedSeed = new Uint8Array(prfResult.results.first);
        console.log('[TrustedDevices] Using PRF-derived seed for unlock');
      } else {
        throw new Error(
          'PRF evaluation failed - device was registered with PRF but authenticator did not return PRF output. ' +
            'This may indicate the authenticator lost PRF support. Please re-register this device.'
        );
      }
    } else {
      // Use stored client seed (backwards compatibility or non-PRF devices)
      derivedSeed = fromBase64(deviceData.deviceSeed);
      console.log('[TrustedDevices] Using stored client seed for unlock');
    }

    const fullUnlockKey = await this.deriveDeviceUnlockKey(
      serverNonce,
      derivedSeed,
      fromBase64(deviceData.salt)
    );

    const devicePrivateKey = await EncryptionRegistry.get().decrypt(
      EncryptedEnvelopeCodec.deserializeFromTLV(fromBase64(deviceData.encryptedDevicePrivateKey)),
      fullUnlockKey
    );

    return await DeviceKeyManager.decryptWithDevicePrivateKey(
      fromBase64(encryptedCMK),
      fromBase64(devicePublicKey),
      devicePrivateKey
    );
  },

  async registerDeviceWithPassword({
    userId,
    deviceName,
    password,
    e2eeKeys,
    fetchDevices,
    setModalOpen,
    setPassword,
    setDeviceName,
  }: {
    userId: string;
    deviceName: string;
    password: string;
    e2eeKeys: { encCmkWithPassword: string; kdfMetadata: { salt: string } };
    fetchDevices: () => void;
    setModalOpen: (open: boolean) => void;
    setPassword: (val: string) => void;
    setDeviceName: (val: string) => void;
  }) {
    try {
      if (!e2eeKeys) throw new Error('E2EE keys not found');
      const { encCmkWithPassword } = e2eeKeys;
      const salt = e2eeKeys.kdfMetadata?.salt;
      if (!encCmkWithPassword || !salt) throw new Error('Missing encrypted CMK or salt');
      let cmk: Uint8Array | null = null;
      try {
        cmk = await decryptCmkWithPassword(encCmkWithPassword, password, salt);
        if (!cmk) {
          toast.error(
            'Failed to unlock your master key. Please check your password and try again.'
          );
          return;
        }
      } catch {
        toast.error('Failed to unlock your master key. Please check your password and try again.');
        return;
      }
      await TrustedDevicesService.registerDevice({ userId, deviceName, cmk });
      fetchDevices();
      setModalOpen(false);
      setPassword('');
      setDeviceName('');
      toast.success('Device registered successfully!');
    } catch (err: unknown) {
      let message = 'Failed to register device';
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          message =
            'WebAuthn registration was cancelled. Please try again and complete the biometric prompt.';
        } else if (err.name === 'NotSupportedError') {
          message =
            'WebAuthn is not supported on this device or browser. Please use a compatible device.';
        } else if (err.name === 'SecurityError') {
          message =
            'WebAuthn registration failed due to security restrictions. Ensure you are on a secure (HTTPS) connection.';
        } else if (err.name === 'AbortError') {
          message = 'WebAuthn registration was aborted. Please try again.';
        } else if (err.message.includes('WebAuthn')) {
          message =
            'WebAuthn registration failed. Please check your biometric settings and try again.';
        } else if (err.message.includes('E2EE keys not found')) {
          message = 'Your encryption keys are not set up. Please log out and log back in.';
        } else {
          message = err.message;
        }
      }
      if (ApiClientError.isApiClientError(err)) {
        const apiErr = err as ApiClientError;
        if (apiErr.isConflict()) {
          message =
            'This device is already registered. If you believe this is an error, try removing the existing device first.';
        } else if (apiErr.isUnauthorized()) {
          message = 'Authentication failed. Please log out and log back in.';
        } else if (apiErr.isServerError()) {
          message = 'Server error occurred. Please try again later.';
        } else {
          message = apiErr.message;
        }
      }
      toast.error(message);
      throw new Error(message, { cause: err });
    }
  },
};
