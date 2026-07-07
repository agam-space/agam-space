'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type ExplorerPrefs = {
  view: 'grid' | 'list';
  sortBy: 'name' | 'size' | 'modified' | 'created';
  sortDir: 'asc' | 'desc';
  groupFolders: boolean; // true = folders first, false = mixed with files
};

type TrashPrefs = {
  view: 'grid' | 'list';
  sortBy: 'name' | 'size' | 'modified';
  sortDir: 'asc' | 'desc';
  groupFolders: boolean;
};

type SecurityPrefs = {
  sessionAutoUnlock: boolean;
  clearDeviceDataOnLogout: boolean;
};

type Preferences = {
  explorer: ExplorerPrefs;
  trash: TrashPrefs;
  security: SecurityPrefs;
};

type Actions = {
  setExplorerView: (v: ExplorerPrefs['view']) => void;
  setExplorerSortBy: (v: ExplorerPrefs['sortBy']) => void;
  setExplorerSortDir: (v: ExplorerPrefs['sortDir']) => void;
  setExplorerGroupFolders: (v: boolean) => void;
  setExplorerPrefs: (p: Partial<ExplorerPrefs>) => void;
  setTrashView: (v: TrashPrefs['view']) => void;
  setTrashSortBy: (v: TrashPrefs['sortBy']) => void;
  setTrashSortDir: (v: TrashPrefs['sortDir']) => void;
  setTrashGroupFolders: (v: boolean) => void;
  setSessionAutoUnlock: (enabled: boolean) => void;
  setClearDeviceDataOnLogout: (enabled: boolean) => void;
};

const DEFAULT_PREFS: Preferences = {
  explorer: { view: 'grid', sortBy: 'name', sortDir: 'asc', groupFolders: true },
  trash: { view: 'grid', sortBy: 'name', sortDir: 'asc', groupFolders: true },
  security: { sessionAutoUnlock: false, clearDeviceDataOnLogout: false },
};

const PREFERENCES_STORAGE_KEY = 'preferences';

/** Read persisted security prefs synchronously (avoids zustand rehydrate race). */
export function getPersistedSessionAutoUnlock(): boolean {
  if (typeof window === 'undefined') return DEFAULT_PREFS.security.sessionAutoUnlock;

  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS.security.sessionAutoUnlock;

    const parsed = JSON.parse(raw) as { state?: Partial<Preferences> };
    return parsed.state?.security?.sessionAutoUnlock ?? DEFAULT_PREFS.security.sessionAutoUnlock;
  } catch {
    return DEFAULT_PREFS.security.sessionAutoUnlock;
  }
}

export const usePreferencesStore = create<Preferences & Actions>()(
  persist(
    set => ({
      ...DEFAULT_PREFS,
      setExplorerView: view => set(s => ({ explorer: { ...s.explorer, view } })),
      setExplorerSortBy: sortBy => set(s => ({ explorer: { ...s.explorer, sortBy } })),
      setExplorerSortDir: sortDir => set(s => ({ explorer: { ...s.explorer, sortDir } })),
      setExplorerGroupFolders: groupFolders =>
        set(s => ({ explorer: { ...s.explorer, groupFolders } })),
      setExplorerPrefs: p => set(s => ({ explorer: { ...s.explorer, ...p } })),
      setTrashView: view => set(s => ({ trash: { ...s.trash, view } })),
      setTrashSortBy: sortBy => set(s => ({ trash: { ...s.trash, sortBy } })),
      setTrashSortDir: sortDir => set(s => ({ trash: { ...s.trash, sortDir } })),
      setTrashGroupFolders: groupFolders => set(s => ({ trash: { ...s.trash, groupFolders } })),
      setSessionAutoUnlock: sessionAutoUnlock =>
        set(s => ({ security: { ...s.security, sessionAutoUnlock } })),
      setClearDeviceDataOnLogout: clearDeviceDataOnLogout =>
        set(s => ({ security: { ...s.security, clearDeviceDataOnLogout } })),
    }),
    {
      name: PREFERENCES_STORAGE_KEY,
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: s => ({ explorer: s.explorer, trash: s.trash, security: s.security }),
      migrate: (persistedState: any, version: number) => {
        // Migrate from v1 to v2: add groupFolders property
        if (version === 1) {
          return {
            ...persistedState,
            explorer: {
              ...persistedState.explorer,
              groupFolders: true,
            },
          };
        }
        // Migrate from v2 to v3: add clearDeviceDataOnLogout property
        if (version === 2) {
          return {
            ...persistedState,
            security: {
              ...persistedState.security,
              clearDeviceDataOnLogout: false,
            },
          };
        }
        // Migrate from v3 to v4: add trash preferences
        if (version === 3) {
          return {
            ...persistedState,
            trash: DEFAULT_PREFS.trash,
          };
        }
        return persistedState;
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<Preferences>;
        return {
          ...currentState,
          explorer: {
            ...DEFAULT_PREFS.explorer,
            ...persisted?.explorer,
          },
          trash: {
            ...DEFAULT_PREFS.trash,
            ...persisted?.trash,
          },
          security: {
            ...DEFAULT_PREFS.security,
            ...persisted?.security,
          },
        };
      },
    }
  )
);
