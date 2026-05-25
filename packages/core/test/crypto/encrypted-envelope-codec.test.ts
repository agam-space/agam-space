import { EncryptedEnvelope, EncryptedEnvelopeCodec, randomBytes } from '../../src';
import { getSodium } from '../../src';

describe('EncryptedEnvelopeCodec', () => {
  beforeAll(async () => {
    await getSodium();
  });

  it('should serialize and deserialize correctly', () => {
    for (let i = 0; i < 100; i++) {
      const mockEnvelope = getRandomEnvelope();

      const encoded = EncryptedEnvelopeCodec.serialize(mockEnvelope);
      const decoded = EncryptedEnvelopeCodec.deserialize(encoded);
      expect(decoded.v).toBe(mockEnvelope.v);
      expect(Array.from(decoded.n)).toEqual(Array.from(mockEnvelope.n));
      expect(Array.from(decoded.c)).toEqual(Array.from(mockEnvelope.c));
    }
  });

  it('should serialize to TLV and deserialize from TLV correctly', () => {
    for (let i = 0; i < 100; i++) {
      const mockEnvelope = getRandomEnvelope();
      const tlv = EncryptedEnvelopeCodec.serializeToTLV(mockEnvelope);
      const decoded = EncryptedEnvelopeCodec.deserializeFromTLV(tlv);
      expect(decoded.v).toBe(mockEnvelope.v);
      expect(Array.from(decoded.n)).toEqual(Array.from(mockEnvelope.n));
      expect(Array.from(decoded.c)).toEqual(Array.from(mockEnvelope.c));
    }
  });

  it('should throw error in serialize for invalid values', () => {
    let mockEnvelope = getRandomEnvelope();
    mockEnvelope.v = -1;
    expect(() => EncryptedEnvelopeCodec.serialize(mockEnvelope)).toThrow(
      'Too small: expected number to be >=1'
    );
    mockEnvelope = getRandomEnvelope();
    mockEnvelope.v = 256;
    expect(() => EncryptedEnvelopeCodec.serialize(mockEnvelope)).toThrow(
      'Too big: expected number to be <=255'
    );

    mockEnvelope = getRandomEnvelope();
    mockEnvelope.n = new Uint8Array(0);
    expect(() => EncryptedEnvelopeCodec.serialize(mockEnvelope)).toThrow('Nonce must not be empty');

    mockEnvelope = getRandomEnvelope();
    mockEnvelope.c = new Uint8Array(0);
    expect(() => EncryptedEnvelopeCodec.serialize(mockEnvelope)).toThrow(
      'Ciphertext must not be empty'
    );
  });

  it('should throw error in deserialize for invalid TLV buffers', () => {
    const { deserializeFromTLV } = EncryptedEnvelopeCodec;

    // 1. Buffer too short to even contain type + length (needs 5 bytes min)
    expect(() => deserializeFromTLV(new Uint8Array([0x01, 0x00]))).toThrow(
      /Missing version field|Invalid TLV length/
    );

    // 2. TLV entry with claimed length larger than actual data
    {
      const buf = new Uint8Array([
        0x01, // type
        0x00,
        0x00,
        0x00,
        0x10, // length = 16
        0x01,
        0x02, // only 2 bytes of value, missing 14
      ]);
      expect(() => deserializeFromTLV(buf)).toThrow('Invalid TLV length for type 1');
    }

    // 3. Duplicate TLV types
    {
      const v = new Uint8Array([0x01]); // version
      const tlv = new Uint8Array([
        0x01,
        0x00,
        0x00,
        0x00,
        0x01,
        v[0],
        0x01,
        0x00,
        0x00,
        0x00,
        0x01,
        v[0],
      ]);
      expect(() => deserializeFromTLV(tlv)).toThrow('Duplicate TLV field type: 1');
    }

    // 4. Missing version field
    {
      const n = new Uint8Array(24).fill(0xab);
      const c = new Uint8Array(5).fill(0xcd);
      const tlv = new Uint8Array([
        0x02,
        0x00,
        0x00,
        0x00,
        0x18,
        ...Array.from(n),
        0x03,
        0x00,
        0x00,
        0x00,
        0x05,
        ...Array.from(c),
      ]);
      expect(() => deserializeFromTLV(tlv)).toThrow('Missing version field');
    }

    // 5. Missing nonce field
    {
      const v = new Uint8Array([0x01]);
      const c = new Uint8Array(5).fill(0xcd);
      const tlv = new Uint8Array([
        0x01,
        0x00,
        0x00,
        0x00,
        0x01,
        ...Array.from(v),
        0x03,
        0x00,
        0x00,
        0x00,
        0x05,
        ...Array.from(c),
      ]);
      expect(() => deserializeFromTLV(tlv)).toThrow('Missing nonce field');
    }

    // 6. Missing ciphertext field
    {
      const v = new Uint8Array([0x01]);
      const n = new Uint8Array(24).fill(0xab);
      const tlv = new Uint8Array([
        0x01,
        0x00,
        0x00,
        0x00,
        0x01,
        ...Array.from(v),
        0x02,
        0x00,
        0x00,
        0x00,
        0x18,
        ...Array.from(n),
      ]);
      expect(() => deserializeFromTLV(tlv)).toThrow('Missing ciphertext field');
    }
  });
});

function getRandomEnvelope(): EncryptedEnvelope {
  return {
    v: 1,
    n: randomBytes(24),
    c: randomBytes(64),
  };
}
