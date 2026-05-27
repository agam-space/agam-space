import { blake3Hash, blake3HashWithEncoding } from '../../src';

describe('hasher', () => {
  describe('blake3Hash', () => {
    it('should hash string input', () => {
      const input = 'test-string';
      const hash = blake3Hash(input);

      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32);
    });

    it('should hash Uint8Array input', () => {
      const input = new TextEncoder().encode('test-string');
      const hash = blake3Hash(input);

      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32);
    });

    it('should produce same hash for string and Uint8Array of same content', () => {
      const str = 'test-string';
      const bytes = new TextEncoder().encode(str);

      const hashFromString = blake3Hash(str);
      const hashFromBytes = blake3Hash(bytes);

      expect(hashFromString).toEqual(hashFromBytes);
    });

    it('should respect custom length parameter', () => {
      const input = 'test-string';
      const hash = blake3Hash(input, 16);

      expect(hash.length).toBe(16);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = blake3Hash('input1');
      const hash2 = blake3Hash('input2');

      expect(hash1).not.toEqual(hash2);
    });
  });

  describe('blake3HashWithEncoding', () => {
    it('should return hex encoded hash by default', () => {
      const input = 'test-string';
      const hash = blake3HashWithEncoding(input);

      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return hex encoded hash when specified', () => {
      const input = 'test-string';
      const hash = blake3HashWithEncoding(input, 'hex');

      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return base64 encoded hash when specified', () => {
      const input = 'test-string';
      const hash = blake3HashWithEncoding(input, 'base64');

      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should work with Uint8Array input', () => {
      const input = new TextEncoder().encode('test-string');
      const hash = blake3HashWithEncoding(input);

      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce same encoded hash for string and Uint8Array of same content', () => {
      const str = 'test-string';
      const bytes = new TextEncoder().encode(str);

      const hashFromString = blake3HashWithEncoding(str, 'hex');
      const hashFromBytes = blake3HashWithEncoding(bytes, 'hex');

      expect(hashFromString).toBe(hashFromBytes);
    });

    it('should throw for unsupported output format', () => {
      expect(() => blake3HashWithEncoding('test', 'binary' as never)).toThrow(
        'Unsupported output format'
      );
    });
  });
});
