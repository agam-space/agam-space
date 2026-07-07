import { z } from 'zod';

// client config

export const ServerConfigSchema = z.object({
  upload: z.object({
    chunkSize: z.number(),
    maxFileSize: z.number(),
    maxConcurrency: z.number().default(1),
  }),
  features: z.object({
    publicSharing: z.boolean().default(false),
    encryptedTags: z.boolean().default(false),
    fileVersioning: z.boolean().default(false),
    externalApiAccess: z.boolean().default(false),
  }),
  security: z.object({
    sessionTimeout: z.string(),
  }),
  sso: z.object({
    enabled: z.boolean().default(false),
    autoCreateUser: z.boolean().default(false),
  }),
  account: z.object({
    allowNewSignup: z.boolean().default(true),
    defaultUserStorageQuota: z.number().int().min(1),
  }),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

// server info

export const ServerInfoSchema = z.object({
  version: z.string(),
  timestamp: z.string(),
  environment: z.string(),
});

export type ServerInfo = z.infer<typeof ServerInfoSchema>;
