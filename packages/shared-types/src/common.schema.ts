import { z } from 'zod';

export const BASE64_REGEX = /^[A-Za-z0-9+/-_]*={0,2}$/;

export const UlidSchema = z
  .string()
  .length(26)
  .regex(/^[0-9A-Z]{26}$/, 'Invalid ULID format');

// Accepts an ISO datetime string or a Date (normalized to ISO on output).
// Uses preprocess rather than a `z.date()` union member so the schema stays
// representable as JSON Schema (z.date() makes zod's toJSONSchema throw, which
// breaks OpenAPI/Swagger generation when docs are enabled).
export const datetimeSchema = z.preprocess(
  val => (val instanceof Date ? val.toISOString() : val),
  z.string().datetime()
);

export const bigintSchema = z
  .union([z.string(), z.number().nonnegative()])
  .transform(val => {
    const num = typeof val === 'string' ? Number(val) : val;
    if (!Number.isFinite(num)) throw new Error('Invalid number');
    return num;
  })
  .refine(val => Number.isInteger(val) && val >= 0, {
    message: 'Value must be a non-negative integer',
  });
