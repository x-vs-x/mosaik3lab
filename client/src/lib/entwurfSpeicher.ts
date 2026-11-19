// Formular-Entwürfe im Browser (localStorage). Jeder Zugriff ist in try/catch gekapselt:
// Privatmodus, voller Speicher oder gesperrter Speicher dürfen das Formular nie stören.

const PREFIX = 'mosaik3lab:entwurf:';
export const ENTWURF_MAX_ALTER_MS = 7 * 24 * 60 * 60 * 1000;

export interface Entwurf<T> {
  savedAt: number;
  value: T;
}

/** Eindeutiger Schlüssel: Formular + Benutzer (oder „gast“) + Datensatz (oder „neu“). */
export function entwurfSchluessel(formular: string, benutzer?: string | null, datensatz?: string | null) {
  return `${PREFIX}${formular}:${benutzer || 'gast'}:${datensatz || 'neu'}`;
}

export function ladeEntwurf<T>(key: string, now = Date.now()): Entwurf<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entwurf<T>;
    if (typeof e?.savedAt !== 'number' || e.value == null || now - e.savedAt > ENTWURF_MAX_ALTER_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return e;
  } catch {
    return null;
  }
}

export function speichereEntwurf<T>(key: string, value: T, now = Date.now()) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: now, value } satisfies Entwurf<T>));
  } catch {
    // Speicher voll oder gesperrt – dann eben ohne Entwurf.
  }
}

export function loescheEntwurf(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // egal
  }
}

/** Entfernt abgelaufene Entwürfe aller Formulare (beim ersten Öffnen eines Formulars). */
export function raeumeAlteEntwuerfeAuf(now = Date.now()) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) ladeEntwurf(k, now);
    }
  } catch {
    // egal
  }
}

/**
 * Verzögertes Speichern eines Entwurfs (useEntwurf): Beim Tippen wird erst nach einer kurzen Pause geschrieben.
 * `sofort()` schreibt den ausstehenden Stand gleich – beim Schließen des Fensters und beim Verlassen der Seite, sonst fehlt,
 * was in der letzten halben Sekunde getippt wurde. `verwerfen()` bricht ab und löscht den Entwurf („Verwerfen“, nach dem
 * Absenden, Formular wieder im Ausgangszustand): Danach schreibt auch ein späteres `sofort()` nichts mehr.
 */
export function entwurfSchreiber(verzoegerungMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let offen: { key: string; value: unknown } | undefined;
  const sofort = () => {
    clearTimeout(timer);
    if (offen) speichereEntwurf(offen.key, offen.value);
    offen = undefined;
  };
  return {
    /** Neuer Stand: Wartezeit beginnt von vorn, geschrieben wird immer der letzte Stand. */
    plane(key: string, value: unknown) {
      clearTimeout(timer);
      offen = { key, value };
      timer = setTimeout(sofort, verzoegerungMs);
    },
    sofort,
    verwerfen(key?: string | null) {
      clearTimeout(timer);
      offen = undefined;
      if (key) loescheEntwurf(key);
    },
  };
}
