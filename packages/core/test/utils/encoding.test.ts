import {
  encodeBase58,
  decodeBase58,
  toUtf8Bytes,
  fromUtf8Bytes,
  toHex,
  fromHex,
  toBase64,
  fromBase64,
  fromBase64Url,
} from '../../src';

describe('encoding', () => {
  describe('Base58', () => {
    it('should encode and decode correctly', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const encoded = encodeBase58(data);
      const decoded = decodeBase58(encoded);

      expect(decoded).toEqual(data);
    });

    it('should handle empty array', () => {
      const data = new Uint8Array([]);
      const encoded = encodeBase58(data);
      const decoded = decodeBase58(encoded);

      expect(encoded).toBe('');
      expect(decoded).toEqual(data);
    });

    it('should produce different encodings for different inputs', () => {
      const data1 = new Uint8Array([1, 2, 3]);
      const data2 = new Uint8Array([4, 5, 6]);

      expect(encodeBase58(data1)).not.toBe(encodeBase58(data2));
    });
  });

  describe('UTF-8', () => {
    it('should convert string to bytes and back', () => {
      const str = 'Hello, World!';
      const bytes = toUtf8Bytes(str);
      const result = fromUtf8Bytes(bytes);

      expect(result).toBe(str);
    });

    it('should handle unicode characters', () => {
      const str = '你好世界 🌍';
      const bytes = toUtf8Bytes(str);
      const result = fromUtf8Bytes(bytes);

      expect(result).toBe(str);
    });

    it('should handle empty string', () => {
      const str = '';
      const bytes = toUtf8Bytes(str);
      const result = fromUtf8Bytes(bytes);

      expect(bytes.length).toBe(0);
      expect(result).toBe(str);
    });
  });

  describe('Hex', () => {
    it('should convert bytes to hex and back', () => {
      const data = new Uint8Array([0, 15, 255, 128, 64]);
      const hex = toHex(data);
      const result = fromHex(hex);

      expect(result).toEqual(data);
    });

    it('should produce lowercase hex', () => {
      const data = new Uint8Array([255, 170, 85]);
      const hex = toHex(data);

      expect(hex).toBe('ffaa55');
    });

    it('should handle empty array', () => {
      const data = new Uint8Array([]);
      const hex = toHex(data);
      const result = fromHex(hex);

      expect(hex).toBe('');
      expect(result).toEqual(data);
    });
  });

  describe('Base64', () => {
    it('should convert bytes to base64 and back', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const b64 = toBase64(data);
      const result = fromBase64(b64);

      expect(result).toEqual(data);
    });

    it('should handle empty array', () => {
      const data = new Uint8Array([]);
      const b64 = toBase64(data);
      const result = fromBase64(b64);

      expect(b64).toBe('');
      expect(result).toEqual(data);
    });

    it('should handle data requiring padding', () => {
      const data1 = new Uint8Array([1]);
      const data2 = new Uint8Array([1, 2]);
      const data3 = new Uint8Array([1, 2, 3]);

      expect(fromBase64(toBase64(data1))).toEqual(data1);
      expect(fromBase64(toBase64(data2))).toEqual(data2);
      expect(fromBase64(toBase64(data3))).toEqual(data3);
    });
  });

  describe('Base64URL', () => {
    it('should decode base64url format', () => {
      const data = new Uint8Array([255, 254, 253, 252, 251]);
      const b64 = toBase64(data);
      const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      const result = fromBase64Url(b64url);
      expect(result).toEqual(data);
    });

    it('should handle url-safe characters', () => {
      const b64url = 'SGVsbG8tV29ybGQ';
      const result = fromBase64Url(b64url);

      expect(fromUtf8Bytes(result)).toBe('Hello-World');
    });

    it('should handle missing padding', () => {
      const b64url = 'YQ';
      const result = fromBase64Url(b64url);

      expect(fromUtf8Bytes(result)).toBe('a');
    });
  });

  describe('Base64 / Base64Url (browser fallback — no Buffer)', () => {
    let savedBuffer: typeof Buffer;

    beforeAll(() => {
      savedBuffer = global.Buffer;
      // @ts-expect-error simulate browser environment where Buffer is not defined
      global.Buffer = undefined;
    });

    afterAll(() => {
      global.Buffer = savedBuffer;
    });

    it('toBase64 should use btoa fallback', () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      expect(toBase64(data)).toBe('SGVsbG8=');
    });

    it('fromBase64 should use atob fallback', () => {
      const result = fromBase64('SGVsbG8=');
      expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it('fromBase64Url should use atob fallback', () => {
      const result = fromBase64Url('SGVsbG8');
      expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it('toBase64 + fromBase64 round-trip via fallback', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
      expect(fromBase64(toBase64(data))).toEqual(data);
    });
  });
});
