import { LRUCache } from 'lru-cache';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class MemoryKeyStore<K extends {}, V extends {}> {
  private cache: LRUCache<K, V>;

  constructor(
    max: number = 100,
    ttlMs?: number,
    updateAgeOnGet: boolean = false,
    updateAgeOnHas: boolean = false
  ) {
    this.cache = new LRUCache<K, V>({
      max,
      ttl: ttlMs ?? 0,
      updateAgeOnGet,
      updateAgeOnHas,
    });
  }

  get(key: K): V | null {
    return this.cache.get(key) ?? null;
  }

  set(key: K, value: V) {
    this.cache.set(key, value);
  }

  delete(key: K) {
    this.cache.delete(key);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  forEach(callback: (value: V, key: K) => void) {
    this.cache.forEach(callback);
  }

  clear() {
    this.cache.clear();
  }
}
