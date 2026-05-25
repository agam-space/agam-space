import { z } from 'zod';

import { datetimeSchema, UlidSchema } from '../common.schema';

// Base device schema
export const TrustedDeviceSchema = z.object({
  id: UlidSchema,
  userId: UlidSchema,
  credentialId: z.string().min(1).max(500),
  webauthnPublicKey: z.string().min(1).max(2000),
  devicePublicKey: z.string().min(1).max(2000),
  prfInput: z.string().max(1000).nullable().optional(), // PRF input for PRF-enabled devices
  unlockKey: z.string().min(1).max(1000),
  encryptedCMK: z.string().min(1).max(4000),
  deviceName: z.string().min(1).max(100),
  createdAt: datetimeSchema,
  lastUsedAt: datetimeSchema.nullable(),
  counter: z.number().int().nonnegative(),
});

export type TrustedDevice = z.infer<typeof TrustedDeviceSchema>;

export const RegisterDeviceRequestSchema = z.object({
  credentialId: z.string().min(1).max(500),
  attestationObject: z.string().min(1),
  clientDataJSON: z.string().min(1),
  devicePublicKey: z.string().min(1).max(2000),
  prfInput: z.string().max(100).optional(),
  unlockKey: z.string().min(1).max(1000),
  encryptedCMK: z.string().min(1).max(4000),
  deviceName: z.string().min(1).max(100),
  challenge: z.string().optional(),
  deviceId: UlidSchema,
});

export type RegisterDeviceRequest = z.infer<typeof RegisterDeviceRequestSchema>;

// Device register challenge request
export const RegisterChallengeRequestSchema = z.object({
  deviceName: z.string().min(1).max(100),
});

export type RegisterChallengeRequest = z.infer<typeof RegisterChallengeRequestSchema>;

// Device register challenge response
export const RegisterChallengeResponseSchema = z.object({
  deviceId: UlidSchema,
  options: z.record(z.string(), z.any()), // WebAuthn registration options
});

export type RegisterChallengeResponse = z.infer<typeof RegisterChallengeResponseSchema>;

// Device unlock challenge request
export const UnlockChallengeRequestSchema = z.object({
  deviceId: UlidSchema,
});

export type UnlockChallengeRequest = z.infer<typeof UnlockChallengeRequestSchema>;

// Device unlock challenge response
export const UnlockChallengeResponseSchema = z.object({
  options: z.record(z.string(), z.any()), // WebAuthn options
  challengeId: z.string().min(1).max(100),
  prfInput: z.string().optional(),
});

export type UnlockChallengeResponse = z.infer<typeof UnlockChallengeResponseSchema>;

// Device unlock assertion request
export const UnlockAssertionRequestSchema = z.object({
  deviceId: UlidSchema,
  challengeId: z.string().min(1).max(100),
  authenticatorData: z.string().min(1).max(2000), // base64 encoded
  clientDataJSON: z.string().min(1).max(2000), // base64 encoded
  signature: z.string().min(1).max(2000), // base64 encoded
});

export type UnlockAssertionRequest = z.infer<typeof UnlockAssertionRequestSchema>;

// Device unlock response
export const UnlockResponseSchema = z.object({
  unlockKey: z.string().min(1).max(1000), // Decrypted unlock key
});

export type UnlockResponse = z.infer<typeof UnlockResponseSchema>;

// Device info for listing (simplified)
export const DeviceInfoSchema = TrustedDeviceSchema.pick({
  id: true,
  deviceName: true,
  createdAt: true,
  lastUsedAt: true,
  credentialId: true,
  encryptedCMK: true,
  devicePublicKey: true,
}).extend({});

export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;

// Array schemas
export const DeviceInfoArraySchema = z.array(DeviceInfoSchema);
export type DeviceInfoArray = z.infer<typeof DeviceInfoArraySchema>;

// Register device response
export const RegisterDeviceResponseSchema = z.object({
  success: z.boolean(),
  deviceId: UlidSchema,
});

export type RegisterDeviceResponse = z.infer<typeof RegisterDeviceResponseSchema>;
