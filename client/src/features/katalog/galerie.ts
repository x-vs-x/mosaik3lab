/** Reine Logik der Bildgalerie (ohne React, damit testbar). */

/** Ab so vielen Pixeln waagerecht zählt eine Bewegung als Wischen. */
export const WISCH_SCHWELLE = 40;

/** Nächstes bzw. vorheriges Bild, am Ende geht es von vorn weiter. */
export function blaettern(index: number, anzahl: number, richtung: -1 | 1) {
  if (anzahl <= 0) return 0;
  return (((index + richtung) % anzahl) + anzahl) % anzahl;
}

/**
 * Wischrichtung aus der Bewegung: nach links gewischt (dx < 0) → nächstes Bild (+1), nach rechts → vorheriges (-1).
 * Überwiegend senkrechte Bewegungen sind Scrollen und zählen nicht.
 */
export function wischRichtung(dx: number, dy: number, schwelle = WISCH_SCHWELLE): -1 | 0 | 1 {
  if (Math.abs(dx) < schwelle || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}
