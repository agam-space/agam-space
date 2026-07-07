'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

function promptUpdate(registration: ServiceWorkerRegistration) {
  toast('A new version is available', {
    id: 'sw-update-available',
    duration: Infinity,
    action: {
      label: 'Refresh',
      onClick: () => {
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      },
    },
  });
}

export function ServiceWorkerManager() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let reloadingAfterUpdate = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingAfterUpdate) return;
      reloadingAfterUpdate = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('/sw.js').then(registration => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        promptUpdate(registration);
      }

      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            promptUpdate(registration);
          }
        });
      });
    });
  }, []);

  return null;
}
