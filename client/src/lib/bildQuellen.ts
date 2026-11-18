// Welche Fassung eines Druckteil-Bildes der Browser lädt: srcset/sizes, damit er je nach Bildschirm (Handy, Retina, PC)
// selbst die passende wählt. Der Server liefert höchstens drei Größen: Original (≤ 2000 px), „karte“ (1080 px), „mini“ (360 px).
import { imageUrl } from './api';

export type BildGroesse = 'mini' | 'karte' | 'original';

/** Breite der Fassungen in Pixeln (wie server/src/kern/bilder/groessen.ts). */
export const BILD_BREITE = { mini: 360, karte: 1080, original: 2000 } as const;

/** Übliche Anzeigebreite je Ort (CSS-Pixel) – der Browser rechnet die Pixeldichte selbst ein. */
export const STANDARD_SIZES: Record<BildGroesse, string> = {
  mini: '96px',
  // Katalogkarte (Layout.tsx/CatalogPage.tsx): Handy eine Spalte (Rand 12 px), ab 640 px zwei Spalten (Rand 24 px, Abstand
  // 20 px), ab 1024 px Seitenleiste 256 px (Rand 40 px), ab 1280 px drei Spalten mit Seitenleiste 304 px. Genau rechnen:
  // „100vw“ würde am iPhone mit dreifacher Dichte (375 → 1125 px) das Original statt der Karte (1080 px) laden.
  karte: '(min-width: 1280px) calc((100vw - 424px) / 3), (min-width: 1024px) calc(50vw - 178px), (min-width: 640px) calc(50vw - 34px), calc(100vw - 24px)',
  // Galerie der Druckteil-Seite (ItemDetailPage.tsx): ab 768 px zweispaltig, ab 1024 px einspaltig neben der Seitenleiste,
  // ab 1280 px wieder zweispaltig (1,1 : 1)
  original: '(min-width: 1280px) calc((100vw - 432px) * 0.53), (min-width: 1024px) calc(100vw - 336px), (min-width: 768px) calc(50vw - 40px), calc(100vw - 24px)',
};

export const bildUrl = (file: string, groesse: BildGroesse) => (groesse === 'original' ? imageUrl(file) : `${imageUrl(file)}?groesse=${groesse}`);

/**
 * src/srcSet/sizes für ein Bild. Angeboten werden immer mini, karte und das Original als oberste Stufe; der Browser nimmt
 * die kleinste Fassung, die für Anzeigebreite × Pixeldichte reicht (das Original nur, wenn ein Gerät mehr braucht).
 * Die Galerie („original“) bietet karte und Original.
 */
export function bildQuellen(file: string, groesse: BildGroesse, sizes = STANDARD_SIZES[groesse]) {
  const kandidaten: BildGroesse[] = groesse === 'original' ? ['karte', 'original'] : ['mini', 'karte', 'original'];
  return {
    src: bildUrl(file, groesse),
    srcSet: kandidaten.map((g) => `${bildUrl(file, g)} ${BILD_BREITE[g]}w`).join(', '),
    sizes,
  };
}
