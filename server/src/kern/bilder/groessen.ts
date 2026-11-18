// Feste Größen der Druckteil-Bilder (höchstens drei je Bild): Original, „karte“, „mini“.
// Scharf auch bei dreifacher Pixeldichte: Katalogkarte am Handy ≈ 343 CSS-px × 3 ≈ 1030 px, iPad 50vw ≈ 1024 px → 1080;
// kleine Karten (Ähnliche Druckteile) ≈ 100 CSS-px × 3 → 360.
// Die Breite steht im Ordnernamen (vorschau/karte-1080/): Ändert sich eine Größe, entsteht ein neuer Ordner, die Bildpflege
// füllt ihn und löscht den alten – es bleiben nie veraltete Vorschaubilder liegen.
// Die Breiten selbst stehen in shared/src/werte/bilder.ts (der Client braucht sie für srcset und das Verkleinern).
import os from 'node:os';
import { BILD_BREITE, JPEG_QUALITAET_ORIGINAL, VORSCHAU_GROESSEN, type VorschauGroesse } from '@mosaik3lab/shared/werte/bilder';

export { istVorschauGroesse, VORSCHAU_GROESSEN, type VorschauGroesse } from '@mosaik3lab/shared/werte/bilder';

/** Längste Kante des Originals (Galerie der Druckteil-Seite, Export). Größere Originale verkleinert der Server. */
export const ORIGINAL_MAX_KANTE = BILD_BREITE.original;
/** Ein Original ≤ 2000 px gilt ab dieser Dateigröße als „deutlich zu groß“ und wird versuchsweise neu gespeichert. */
export const ORIGINAL_ZU_GROSS_BYTES = 1536 * 1024;
/** Verkleinertes Original nur übernehmen, wenn es mindestens 20 % kleiner ist. */
export const MINDEST_ERSPARNIS = 0.2;

/** Breite und Ordner je Vorschaugröße, z. B. karte → { breite: 1080, ordner: 'karte-1080' }. */
export const VORSCHAU = Object.fromEntries(
  VORSCHAU_GROESSEN.map((g) => [g, { breite: BILD_BREITE[g], ordner: `${g}-${BILD_BREITE[g]}` }]),
) as Record<VorschauGroesse, { breite: number; ordner: string }>;

/** Ordner der Vorschaubilder in der Ablage (neben den Objekttyp-Ordnern; nie im Export, im Backup ausgenommen). */
export const VORSCHAU_ORDNER = 'vorschau';
/** Relativer Pfad eines Vorschaubilds: vorschau/<größe-breite>/<datei-id>.jpg (immer JPEG). */
export const vorschauRel = (groesse: VorschauGroesse, id: string) => `${VORSCHAU_ORDNER}/${VORSCHAU[groesse].ordner}/${id}.jpg`;
/**
 * Merker „Bild gescheitert“: vorschau/.gescheitert/<datei-id> mit dem SHA-256 des Inhalts. Übersteht Neustarts, damit ein
 * Bild, das den Rechen-Thread abstürzen lässt, nicht nach jedem Start erneut verarbeitet wird; neuer Inhalt → neuer Versuch.
 */
export const GESCHEITERT_ORDNER = '.gescheitert';
export const gescheitertRel = (id: string) => `${VORSCHAU_ORDNER}/${GESCHEITERT_ORDNER}/${id}`;

/** JPEG-Qualität (0–100): Vorschaubilder etwas stärker komprimiert als ein neu gespeichertes Original. */
export const QUALITAET_VORSCHAU = 80;
export const QUALITAET_ORIGINAL = JPEG_QUALITAET_ORIGINAL;

/**
 * Schutz gegen Speicherüberlauf: größere Bilder werden gar nicht erst dekodiert. Hängt vom Arbeitsspeicher ab – auf einem
 * kleinen Raspberry Pi (≤ 2 GB) höchstens 16 MP (≈ 4900 × 3300 px, übliche Handyfotos) und 256 MB, sonst 40 MP und 512 MB.
 */
export function speicherGrenzen(gesamtBytes = os.totalmem()) {
  const klein = gesamtBytes <= 2.2 * 1024 ** 3; // ein „2 GB“-Pi meldet etwas weniger als 2 GiB
  return klein ? { megapixel: 16, speicherMb: 256 } : { megapixel: 40, speicherMb: 512 };
}
const GRENZEN = speicherGrenzen();
export const MAX_MEGAPIXEL = GRENZEN.megapixel;
export const MAX_SPEICHER_MB = GRENZEN.speicherMb;
/** Zeitgrenze je Bild im Rechen-Thread; danach wird er beendet und neu gestartet, das Original bleibt. */
export const ZEITGRENZE_MS = 60_000;
