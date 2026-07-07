import { MemoryKeyStore } from '../../src/keys/memory-keystore';

describe('MemoryKeyStore', () => {
  let keyStore: MemoryKeyStore<string, Uint8Array>;

  beforeEach(() => {
    keyStore = new MemoryKeyStore<string, Uint8Array>(100);
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      const key = 'test-key';
      const value = new Uint8Array([1, 2, 3, 4]);

      keyStore.set(key, value);
      const retrieved = keyStore.get(key);

      expect(retrieved).toEqual(value);
    });

    it('should return null for non-existent key', () => {
      const retrieved = keyStore.get('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should check if key exists', () => {
      const key = 'test-key';
      const value = new Uint8Array([1, 2, 3]);

      expect(keyStore.has(key)).toBe(false);

      keyStore.set(key, value);
      expect(keyStore.has(key)).toBe(true);
    });

    it('should delete keys', () => {
      const key = 'test-key';
      const value = new Uint8Array([1, 2, 3]);

      keyStore.set(key, value);
      expect(keyStore.has(key)).toBe(true);

      keyStore.delete(key);
      expect(keyStore.has(key)).toBe(false);
      expect(keyStore.get(key)).toBeNull();
    });

    it('should clear all entries', () => {
      keyStore.set('key1', new Uint8Array([1]));
      keyStore.set('key2', new Uint8Array([2]));
      keyStore.set('key3', new Uint8Array([3]));

      expect(keyStore.has('key1')).toBe(true);
      expect(keyStore.has('key2')).toBe(true);

      keyStore.clear();

      expect(keyStore.has('key1')).toBe(false);
      expect(keyStore.has('key2')).toBe(false);
      expect(keyStore.has('key3')).toBe(false);
    });
  });

  describe('LRU behavior', () => {
    it('should evict oldest entry when max size is reached', () => {
      const smallCache = new MemoryKeyStore<string, number>(3);

      smallCache.set('key1', 1);
      smallCache.set('key2', 2);
      smallCache.set('key3', 3);

      expect(smallCache.has('key1')).toBe(true);

      smallCache.set('key4', 4);

      expect(smallCache.has('key1')).toBe(false);
      expect(smallCache.has('key4')).toBe(true);
    });

    it('should handle custom max size', () => {
      const cache = new MemoryKeyStore<string, number>(2);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
    });
  });

  describe('TTL behavior', () => {
    it('should expire entries after TTL', async () => {
      const ttlCache = new MemoryKeyStore<string, number>(100, 50);

      ttlCache.set('key1', 123);
      expect(ttlCache.get('key1')).toBe(123);

      await new Promise(resolve => setTimeout(resolve, 60));

      expect(ttlCache.get('key1')).toBeNull();
    });

    it('should not expire if TTL is not set', async () => {
      const noTtlCache = new MemoryKeyStore<string, number>(100);

      noTtlCache.set('key1', 123);
      expect(noTtlCache.get('key1')).toBe(123);

      await new Promise(resolve => setTimeout(resolve, 60));

      expect(noTtlCache.get('key1')).toBe(123);
    });
  });

  describe('forEach', () => {
    it('should iterate over all entries', () => {
      keyStore.set('key1', new Uint8Array([1]));
      keyStore.set('key2', new Uint8Array([2]));
      keyStore.set('key3', new Uint8Array([3]));

      const entries: Array<[Uint8Array, string]> = [];
      keyStore.forEach((value, key) => {
        entries.push([value, key]);
      });

      expect(entries.length).toBe(3);
      expect(entries.some(([v, k]) => k === 'key1' && v[0] === 1)).toBe(true);
      expect(entries.some(([v, k]) => k === 'key2' && v[0] === 2)).toBe(true);
      expect(entries.some(([v, k]) => k === 'key3' && v[0] === 3)).toBe(true);
    });

    it('should not iterate over empty cache', () => {
      const count = jest.fn();
      keyStore.forEach(count);

      expect(count).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle overwriting existing keys', () => {
      keyStore.set('key1', new Uint8Array([1, 2, 3]));
      keyStore.set('key1', new Uint8Array([4, 5, 6]));

      const value = keyStore.get('key1');
      expect(value).toEqual(new Uint8Array([4, 5, 6]));
    });

    it('should handle deleting non-existent keys', () => {
      expect(() => keyStore.delete('non-existent')).not.toThrow();
    });

    it('should handle clearing empty cache', () => {
      expect(() => keyStore.clear()).not.toThrow();
    });
  });
});
