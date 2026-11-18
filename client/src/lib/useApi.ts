import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

/**
 * Lädt Daten von der API und stellt Lade-/Fehlerzustand bereit. Eine neue Anfrage (anderer Pfad, reload) bricht die
 * laufende ab – auf langsamem WLAN überholt sonst eine alte Suche die neue.
 *
 * `data` bleibt beim Pfadwechsel stehen, bis die neue Antwort da ist (Katalog: Liste blendet nur ab statt zu springen).
 * `aktuell` sagt, ob `data` zum jetzigen Pfad gehört – Seiten eines einzelnen Eintrags zeigen sonst die Ladeanzeige
 * statt des vorigen Eintrags (z. B. Wechsel über „Ähnliche Druckteile“).
 */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [datenFuer, setDatenFuer] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [loading, setLoading] = useState(path !== null);
  const requestId = useRef(0);
  const laufend = useRef<AbortController | undefined>(undefined);

  const load = useCallback(async () => {
    if (path === null) return;
    const id = ++requestId.current;
    laufend.current?.abort();
    const ctrl = new AbortController();
    laufend.current = ctrl;
    setLoading(true);
    try {
      const result = await api<T>(path, { signal: ctrl.signal });
      if (id === requestId.current) {
        setData(result);
        setDatenFuer(path);
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
    // Seite verlassen oder Pfad gewechselt: alte Anfrage nicht weiterlaufen lassen.
    return () => laufend.current?.abort();
  }, [load]);

  return { data, setData, error, loading, reload: load, aktuell: datenFuer === path };
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Mosaik³LAB` : 'Mosaik³LAB';
  }, [title]);
}

/** Wert erst nach einer Tipp-Pause übernehmen (Standard 400 ms: weniger Anfragen über schwaches WLAN). */
export function useDebounced<T>(value: T, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
