// client/cache/previewCache.ts

type CachedEntry = {
  data: Uint8Array;
  expiresAt: number;
};

const cache = new Map<string, CachedEntry>();

const MAX_ITEMS = 3;
const TTL_MS = 15_000; // 15 seconds

export function getPreviewCache(key: string): Uint8Array | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

export function setPreviewCache(key: string, data: Uint8Array) {
  // Remove oldest if over limit
  if (cache.size >= MAX_ITEMS) {
    const firstKey = cache.keys().next().value!;
    cache.delete(firstKey);
  }

  cache.set(key, {
    data,
    expiresAt: Date.now() + TTL_MS,
  });
}
