import { IdentityKeyManager } from './identity-key';
import { fromBase64, toBase64, toUtf8Bytes } from './utils/encoding';
import { blake3HashWithEncoding } from './utils/hasher';

function generateChallengeString(data: string, timestamp: number): string {
  return `${data}:${timestamp}`;
}

export async function generateCmkChallenge(
  payload: object,
  key: Uint8Array,
  signFunction?: (message: Uint8Array) => Promise<Uint8Array>
): Promise<{
  timestamp: number;
  signature: string;
}> {
  const timestamp = Date.now();

  const payloadHash = blake3HashWithEncoding(JSON.stringify(payload), 'base64');

  const challenge = toUtf8Bytes(generateChallengeString(payloadHash, timestamp));

  const signature = signFunction
    ? await signFunction(challenge)
    : await IdentityKeyManager.sign(challenge, key);

  return {
    timestamp,
    signature: toBase64(signature),
  };
}

export async function verifyCmkChallenge(
  payload: object,
  signature: string,
  publicKey: string,
  timestamp: number,
  maxAgeMs: number
): Promise<void> {
  if (timestamp <= 0) {
    throw new Error('Invalid timestamp. Must be a positive integer.');
  }

  const age = Date.now() - timestamp;
  if (age > maxAgeMs) {
    throw new Error('Challenge timestamp too old. Please retry with current timestamp.');
  }

  if (age < -maxAgeMs) {
    throw new Error('Challenge timestamp too far in the future.');
  }

  try {
    const payloadHash = blake3HashWithEncoding(JSON.stringify(payload), 'base64');

    const isValid = await IdentityKeyManager.verify(
      toUtf8Bytes(generateChallengeString(payloadHash, timestamp)),
      fromBase64(signature),
      fromBase64(publicKey)
    );

    if (!isValid) {
      throw new Error('Validation failed');
    }
  } catch (err) {
    throw new Error(`Invalid signature. Cannot verify key possession`, { cause: err });
  }
}
