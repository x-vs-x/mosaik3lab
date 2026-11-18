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

/** Ein Eintrag der Galerie: ein Bild (Index in `images`, ohne Bilder 0 = Symbolbild) oder ein Video (Datei oder Link). */
export type Medium<V> = { art: 'bild'; index: number } | { art: 'video'; video: V };

/**
 * Reihenfolge der Galerie: erst alle Bilder, dann die Videos (Datei oder Link). Ohne Bilder steht vorn das Symbolbild der
 * Kategorie, die Videos folgen.
 */
export function medienListe<V extends { file?: string; url?: string }>(bilder: number, videos: readonly V[] = []): Medium<V>[] {
  const liste: Medium<V>[] = Array.from({ length: Math.max(1, bilder) }, (_, index) => ({ art: 'bild' as const, index }));
  for (const video of videos) if (video.file || video.url) liste.push({ art: 'video', video });
  return liste;
}

/** Name der fremden Seite für „Bei youtube.com ansehen“ (ohne „www.“). */
export function seitenName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || 'externer Seite';
  } catch {
    return 'externer Seite';
  }
}
