import { z } from 'zod';

export function validateOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed:\n${JSON.stringify(result.error.issues, null, 2)}`);
  }
  return result.data;
}
