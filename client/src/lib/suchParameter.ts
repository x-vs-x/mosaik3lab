import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Werte für Suchparameter: leer, `null` oder `undefined` löscht den Parameter. */
export type ParameterAenderung = Record<string, string | null | undefined>;

/** Neue Suchparameter aus den alten plus Änderungen (reine Funktion, ohne Browser testbar). */
export function mitParametern(params: URLSearchParams, aenderung: ParameterAenderung): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(aenderung)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return next;
}

/**
 * Filter und Suche in der Adresse (überstehen „Zurück“ und Neuladen). `setze({ q: 'stift', offen: null })` ersetzt
 * den Eintrag im Verlauf, statt für jeden Tastendruck einen neuen anzulegen.
 */
export function useSuchParameter() {
  const [params, setParams] = useSearchParams();
  const setze = useCallback(
    (aenderung: ParameterAenderung) => setParams((alt) => mitParametern(alt, aenderung), { replace: true }),
    [setParams],
  );
  return [params, setze] as const;
}
