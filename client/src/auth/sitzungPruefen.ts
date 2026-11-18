import { isConnectionProblem, fehlerText } from '../lib/api';
import type { SessionAntwort as SessionResponse } from '@mosaik3lab/shared/konten';

// Reine Logik der Sitzungsprüfung (ohne React), damit sie sich ohne Browser testen lässt.

export type { SessionResponse };

export const ME_TIMEOUT_MS = 8000;
const PAUSEN_MS = [1000, 2500];

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * /auth/me mit Wiederholung: Netzfehler, Zeitüberschreitung und 5xx (Server startet gerade neu) heißen nicht
 * „abgemeldet“ – erst nach drei Versuchen gibt es einen Fehler. `onRetry` meldet den nächsten Versuch (für die Anzeige).
 * Auch für das Laden der Konfiguration beim Start benutzt (lib/config.tsx).
 */
export async function pruefeSitzung<T = SessionResponse>(
  holeMe: () => Promise<T>,
  { pausen = PAUSEN_MS, onRetry, pause = warte }: { pausen?: number[]; onRetry?: (versuch: number) => void; pause?: (ms: number) => Promise<unknown> } = {},
): Promise<T> {
  for (let versuch = 0; ; versuch++) {
    try {
      return await holeMe();
    } catch (err) {
      if (!isConnectionProblem(err) || versuch >= pausen.length) throw err;
      onRetry?.(versuch + 2);
      await pause(pausen[versuch]);
    }
  }
}

/** Gleichzeitige Aufrufe teilen sich einen laufenden Vorgang (z. B. mehrere 401 auf einmal → eine Prüfung). */
export function einmalig<T>(fn: () => Promise<T>) {
  let laufend: Promise<T> | undefined;
  return () => (laufend ??= fn().finally(() => (laufend = undefined)));
}

/** Verständliche Meldung, wenn die Prüfung endgültig scheitert. */
export function pruefFehlerText(err: unknown) {
  if (isConnectionProblem(err)) return 'Der Server antwortet gerade nicht. Ihre Anmeldung bleibt erhalten – bitte gleich erneut versuchen.';
  return fehlerText(err, 'Die Anmeldung konnte nicht geprüft werden.');
}
