'use client';

import { fetchServerInfoApi } from '@agam-space/client';
import { useEffect, useState } from 'react';

export function useServerVersion() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    async function fetchVersion() {
      try {
        const info = await fetchServerInfoApi();
        setVersion(info.version);
      } catch {
        return;
      }
    }
    fetchVersion();
  }, []);

  return version;
}
