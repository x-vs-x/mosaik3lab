import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

/** Lädt Daten von der API und stellt Lade-/Fehlerzustand bereit. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [loading, setLoading] = useState(path !== null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (path === null) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await api<T>(path);
      if (id === requestId.current) {
        setData(result);
        setError(undefined);
      }
    } catch (err) {
      if (id === requestId.current) setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, setData, error, loading, reload: load };
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Mosaik³LAB` : 'Mosaik³LAB';
  }, [title]);
}

export function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
