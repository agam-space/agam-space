import { getSodium } from './utils/sodium-loader';
import { EFF_WORDLIST } from './utils/wordlist';

/**
 * Generate a human-readable fingerprint from an Ed25519 public key
 * using the EFF short wordlist (4 words with unique 3-char prefixes)
 *
 * @param publicKey - Ed25519 public key
 * @returns Fingerprint string: "word1-word2-word3-word4"
 */
export async function generateFingerprint(publicKey: Uint8Array): Promise<string> {
  const sodium = await getSodium();

  const hash = sodium.crypto_generichash(32, publicKey, null);

  // Extract 4 10-bit indices from the first 40 bits (5 bytes)
  const hashArray = new Uint8Array(hash);
  const indices: number[] = [];

  // Bits 0-9: First word index
  indices.push((hashArray[0] << 2) | (hashArray[1] >> 6));

  // Bits 10-19: Second word index
  indices.push(((hashArray[1] & 0x3f) << 4) | (hashArray[2] >> 4));

  // Bits 20-29: Third word index
  indices.push(((hashArray[2] & 0x0f) << 6) | (hashArray[3] >> 2));

  // Bits 30-39: Fourth word index
  indices.push(((hashArray[3] & 0x03) << 8) | hashArray[4]);

  // Map indices to words (modulo 1296 to fit in wordlist)
  const words = indices.map(index => EFF_WORDLIST[index % EFF_WORDLIST.length]);
  return words.join('-');
}
