import { useCallback, useEffect, useRef, useState } from 'react';
import { ladeEntwurf, loescheEntwurf, raeumeAlteEntwuerfeAuf, speichereEntwurf } from './entwurfSpeicher';

const VERZOEGERUNG_MS = 500;
const VERLASSEN_FRAGE =
  'Sie haben ungespeicherte Änderungen. Seite trotzdem verlassen?\n\nIhre Eingaben bleiben als Entwurf in diesem Browser erhalten.';

let aufgeraeumt = false;

interface Optionen<T> {
  /** Erst `true`, wenn das Formular seinen Ausgangszustand hat (Datensatz geladen, Vorbelegung gesetzt). */
  ready?: boolean;
  /** `false` pausiert Speichern und Rückfrage (z. B. geschlossener Dialog). */
  enabled?: boolean;
  /** Felder, die nie gespeichert werden (Passwörter). */
  omit?: (keyof T)[];
}

/**
 * Merkt sich den Formularzustand verzögert im Browser und stellt ihn nach einem Neuladen wieder her.
 * `apply` setzt Werte ins Formular (wiederhergestellter Entwurf bzw. Ausgangszustand bei „Verwerfen“).
 * Nach erfolgreichem Speichern `clear()` aufrufen – der nächste Zustand gilt dann als neuer Ausgangszustand.
 */
export function useEntwurf<T extends object>(key: string | null, value: T, apply: (v: T) => void, opts: Optionen<T> = {}) {
  const { ready = true, enabled = true, omit } = opts;
  const stored = omit?.length ? (Object.fromEntries(Object.entries(value).filter(([k]) => !omit.includes(k as keyof T))) as T) : value;
  const json = JSON.stringify(stored);

  const [restored, setRestored] = useState<{ savedAt: number; value: T } | null>(null);
  const [startKey, setStartKey] = useState<string | null>(null);
  const [, rerender] = useState(0);
  const basis = useRef<{ json: string; value: T }>({ json, value });
  const rebase = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ key, json, stored, dirty: false });

  // Beim Öffnen (bzw. bei neuem Schlüssel) einmalig: Ausgangszustand merken, Entwurf wiederherstellen.
  useEffect(() => {
    if (!key || !ready || startKey === key) return;
    if (!aufgeraeumt) {
      aufgeraeumt = true;
      raeumeAlteEntwuerfeAuf();
    }
    basis.current = { json, value };
    const draft = ladeEntwurf<T>(key);
    if (draft && JSON.stringify(draft.value) !== json) {
      apply({ ...value, ...draft.value });
      setRestored(draft);
    } else {
      if (draft) loescheEntwurf(key);
      setRestored(null);
    }
    setStartKey(key);
  }, [key, ready, startKey, json, value, apply]);

  // Nach clear(): der erste Zustand danach ist der neue Ausgangszustand.
  useEffect(() => {
    if (!rebase.current) return;
    rebase.current = false;
    basis.current = { json, value };
  });

  const active = !!key && startKey === key && enabled;
  const dirty = active && !rebase.current && json !== basis.current.json;
  latest.current = { key, json, stored, dirty };

  useEffect(() => {
    if (!active || !key) return;
    if (!dirty) {
      loescheEntwurf(key);
      return;
    }
    timer.current = setTimeout(() => speichereEntwurf(key, latest.current.stored), VERZOEGERUNG_MS);
    return () => clearTimeout(timer.current);
  }, [active, dirty, key, json]);

  // Tab wird versteckt/geschlossen (Handy wechselt zur Kamera): sofort sichern, nicht erst nach 500 ms.
  useEffect(() => {
    if (!active) return;
    const flush = () => {
      const l = latest.current;
      if (l.key && l.dirty) speichereEntwurf(l.key, l.stored);
    };
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active]);

  useVerlassenWarnung(dirty);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    if (key) loescheEntwurf(key);
    rebase.current = true;
    setRestored(null);
    rerender((n) => n + 1);
  }, [key]);

  const discard = useCallback(() => {
    apply(basis.current.value);
    clear();
  }, [apply, clear]);

  return { restored, dirty, clear, discard };
}

/** Rückfrage bei ungespeicherten Änderungen: Tab schließen/neu laden und Klick auf einen Link innerhalb der App. */
export function useVerlassenWarnung(aktiv: boolean) {
  useEffect(() => {
    if (!aktiv) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    // BrowserRouter kennt keinen Navigations-Blocker → Link-Klicks vor React abfangen (Capture-Phase am document).
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      if (!window.confirm(VERLASSEN_FRAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [aktiv]);
}
