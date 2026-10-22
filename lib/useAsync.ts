import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppError, toAppError } from './errors';

export interface AsyncState<T> {
  data: T | undefined;
  error: AppError | null;
  loading: boolean;
  /** Runs the loader again with the same key (e.g. after a change). */
  reload: () => void;
}

interface Settled<T> {
  token: string;
  key: string;
  data?: T;
  error: AppError | null;
}

/**
 * Minimal data loader for screens: runs `load` whenever `key` changes (or on
 * `reload`), ignores stale answers and converts failures to AppError.
 * `load` may change on every render; only `key` decides when to run.
 */
export function useAsync<T>(load: () => Promise<T>, key: string): AsyncState<T> {
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });

  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>({ token: '', key: '', error: null });
  const token = `${nonce}:${key}`;

  useEffect(() => {
    let active = true;
    loadRef.current().then(
      data => active && setSettled({ token, key, data, error: null }),
      // A failed reload keeps the data already shown for this key, next to the error
      (err: unknown) =>
        active && setSettled(prev => ({ token, key, data: prev.key === key ? prev.data : undefined, error: toAppError(err) })),
    );
    return () => {
      active = false;
    };
  }, [token, key]);

  const reload = useCallback(() => setNonce(n => n + 1), []);
  const sameKey = settled.key === key;

  return {
    // While reloading the same key (and after a failed reload), keep showing the previous data
    data: sameKey ? settled.data : undefined,
    error: settled.token === token ? settled.error : null,
    loading: settled.token !== token,
    reload,
  };
}
