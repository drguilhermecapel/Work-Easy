// localStorage and sessionStorage wrapped so that they never throw. Private
// windows, blocked site data and a full quota make the browser throw or hide
// the storage; the caller then gets null/false and the screen keeps working
// without it. Use it only for per-device conveniences (an unsent draft, a
// remembered tab). State that must survive or be shared belongs on the server.

export type StorageKind = 'local' | 'session';

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): boolean;
  getJson<T>(key: string): T | null;
  setJson(key: string, value: unknown): boolean;
}

const resolveStorage = (kind: StorageKind): Storage | null => {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

export const createKeyValueStore = (kind: StorageKind): KeyValueStore => {
  const get = (key: string): string | null => {
    try {
      return resolveStorage(kind)?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };

  const set = (key: string, value: string): boolean => {
    try {
      const storage = resolveStorage(kind);
      if (!storage) return false;
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };

  const remove = (key: string): boolean => {
    try {
      const storage = resolveStorage(kind);
      if (!storage) return false;
      storage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  };

  return {
    get,
    set,
    remove,
    getJson<T>(key: string): T | null {
      const raw = get(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        // A value written by another version of the app, or edited by hand
        return null;
      }
    },
    setJson(key: string, value: unknown): boolean {
      try {
        return set(key, JSON.stringify(value));
      } catch {
        // Circular or BigInt values cannot be stored as JSON
        return false;
      }
    },
  };
};

export const localStore: KeyValueStore = createKeyValueStore('local');
export const sessionStore: KeyValueStore = createKeyValueStore('session');
