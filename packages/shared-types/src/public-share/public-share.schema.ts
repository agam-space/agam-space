import { z } from 'zod';

import { BASE64_REGEX, datetimeSchema, UlidSchema } from '../common.schema';

export const PublicShareSchema = z.object({
  id: z.string().min(1).max(50),
  ownerId: UlidSchema,
  itemId: UlidSchema,
  itemType: z.enum(['folder', 'file']),
  serverShareKey: z.string().min(32).max(64).regex(BASE64_REGEX, 'Invalid base64 encoded key'),
  wrappedItemKey: z
    .string()
    .min(43)
    .max(200)
    .regex(BASE64_REGEX, 'Invalid base64 encoded wrapped key'),
  salt: z.string().min(16).max(43).regex(BASE64_REGEX, 'Invalid base64 encoded salt (16 bytes)'),
  passwordHash: z.string().min(32).max(200).optional(),
  expiresAt: datetimeSchema.nullable().optional(),
  createdAt: datetimeSchema,
  updatedAt: datetimeSchema,
});

export const PublicShareExternalDetailsSchema = PublicShareSchema.pick({
  id: true,
  itemId: true,
  itemType: true,
  expiresAt: true,
}).extend({
  requiredPassword: z.boolean().default(false),
});

export const PublicShareDetailsSchema = PublicShareSchema.pick({
  id: true,
  ownerId: true,
  itemId: true,
  itemType: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  requiredPassword: z.boolean().default(false),
});

export const PublicShareKeysSchema = PublicShareSchema.pick({
  serverShareKey: true,
  wrappedItemKey: true,
  salt: true,
}).extend({
  accessToken: z.string().min(10).max(200),
  expiresAt: datetimeSchema,
});

export const CreatePublicShareSchema = PublicShareSchema.pick({
  itemId: true,
  itemType: true,
  serverShareKey: true,
  wrappedItemKey: true,
  salt: true,
  expiresAt: true,
}).extend({
  password: z.string().min(4).max(100).optional(),
});

export const PublicShareResponseSchema = z.object({
  id: z.string(),
});

export const GetPublicShareKeyDetailsSchema = z.object({
  password: z.string().min(4).max(100).optional(),
});

export type PublicShare = z.infer<typeof PublicShareSchema>;
export type CreatePublicShare = z.infer<typeof CreatePublicShareSchema>;
export type PublicShareResponse = z.infer<typeof PublicShareResponseSchema>;
export type GetPublicShareKeyDetails = z.infer<typeof GetPublicShareKeyDetailsSchema>;
export type PublicShareKeys = z.infer<typeof PublicShareKeysSchema>;
export type PublicShareDetails = z.infer<typeof PublicShareDetailsSchema>;
export type PublicShareExternalDetails = z.infer<typeof PublicShareExternalDetailsSchema>;
