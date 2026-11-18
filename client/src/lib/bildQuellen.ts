// Welche Fassung eines Druckteil-Bildes der Browser lädt: srcset/sizes, damit er je nach Bildschirm (Handy, Retina, PC)
// selbst die passende wählt. Der Server liefert höchstens drei Größen: Original (≤ 2000 px), „karte“ (720 px), „mini“ (240 px).
import { imageUrl } from './api';

export type BildGroesse = 'mini' | 'karte' | 'original';

/** Breite der Fassungen in Pixeln (wie server/src/kern/bilder/groessen.ts). */
export const BILD_BREITE = { mini: 240, karte: 720, original: 2000 } as const;

/** Übliche Anzeigebreite je Ort (CSS-Pixel) – der Browser rechnet die Pixeldichte selbst ein. */
export const STANDARD_SIZES: Record<BildGroesse, string> = {
  mini: '96px',
  // Katalogkarte: Handy eine Spalte, ab 640 px zwei, ab 1280 px drei Spalten (max. 80rem Inhalt)
  karte: '(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw',
  // Galerie der Druckteil-Seite
  original: '(min-width: 1024px) 50vw, 100vw',
};

export const bildUrl = (file: string, groesse: BildGroesse) => (groesse === 'original' ? imageUrl(file) : `${imageUrl(file)}?groesse=${groesse}`);

/**
 * src/srcSet/sizes für ein Bild. „mini“ und „karte“ bieten nur die beiden Vorschaubilder an (nie das große Original –
 * auch nicht auf Retina-Handys), die Galerie („original“) bietet karte und Original.
 */
export function bildQuellen(file: string, groesse: BildGroesse, sizes = STANDARD_SIZES[groesse]) {
  const kandidaten: BildGroesse[] = groesse === 'original' ? ['karte', 'original'] : ['mini', 'karte'];
  return {
    src: bildUrl(file, groesse),
    srcSet: kandidaten.map((g) => `${bildUrl(file, g)} ${BILD_BREITE[g]}w`).join(', '),
    sizes,
  };
}
