// Feste Größen der Druckteil-Bilder (höchstens drei je Bild): Original, „karte“, „mini“.
// Scharf auch bei dreifacher Pixeldichte: Katalogkarte am Handy ≈ 343 CSS-px × 3 ≈ 1030 px, iPad 50vw ≈ 1024 px → 1080;
// kleine Karten (Ähnliche Druckteile) ≈ 100 CSS-px × 3 → 360.
// Die Breite steht im Ordnernamen (vorschau/karte-1080/): Ändert sich eine Größe, entsteht ein neuer Ordner, die Bildpflege
// füllt ihn und löscht den alten – es bleiben nie veraltete Vorschaubilder liegen.

export type VorschauGroesse = 'karte' | 'mini';

/** Längste Kante des Originals (Galerie der Druckteil-Seite, Export). Größere Originale verkleinert der Server. */
export const ORIGINAL_MAX_KANTE = 2000;
/** Ein Original ≤ 2000 px gilt ab dieser Dateigröße als „deutlich zu groß“ und wird versuchsweise neu gespeichert. */
export const ORIGINAL_ZU_GROSS_BYTES = 1536 * 1024;
/** Verkleinertes Original nur übernehmen, wenn es mindestens 20 % kleiner ist. */
export const MINDEST_ERSPARNIS = 0.2;

export const VORSCHAU: Record<VorschauGroesse, { breite: number; ordner: string }> = {
  karte: { breite: 1080, ordner: 'karte-1080' },
  mini: { breite: 360, ordner: 'mini-360' },
};
export const VORSCHAU_GROESSEN = Object.keys(VORSCHAU) as VorschauGroesse[];
export const istVorschauGroesse = (v: unknown): v is VorschauGroesse => typeof v === 'string' && v in VORSCHAU;

/** Ordner der Vorschaubilder in der Ablage (neben den Objekttyp-Ordnern; nie im Export, im Backup ausgenommen). */
export const VORSCHAU_ORDNER = 'vorschau';
/** Relativer Pfad eines Vorschaubilds: vorschau/<größe-breite>/<datei-id>.jpg (immer JPEG). */
export const vorschauRel = (groesse: VorschauGroesse, id: string) => `${VORSCHAU_ORDNER}/${VORSCHAU[groesse].ordner}/${id}.jpg`;

/** JPEG-Qualität (0–100): Vorschaubilder etwas stärker komprimiert als ein neu gespeichertes Original. */
export const QUALITAET_VORSCHAU = 80;
export const QUALITAET_ORIGINAL = 85;

/** Schutz gegen Speicherüberlauf: größere Bilder werden gar nicht erst dekodiert (40 MP ≈ 7300 × 5500 px). */
export const MAX_MEGAPIXEL = 40;
export const MAX_SPEICHER_MB = 512;
/** Zeitgrenze je Bild im Rechen-Thread; danach wird er beendet und neu gestartet, das Original bleibt. */
export const ZEITGRENZE_MS = 60_000;
