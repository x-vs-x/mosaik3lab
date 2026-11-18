// Feste Fassungen der Druckteil-Bilder (ohne zod – auch für den Client): Original, „karte“, „mini“.
// Der Server legt die Vorschaubilder in genau diesen Breiten an (server/src/kern/bilder/groessen.ts), der Client gibt sie
// im srcset an (client/src/lib/bildQuellen.ts) und verkleinert Originale vor dem Hochladen auf dieselbe Kante.

/** Vorschaugrößen, die der Server erzeugt und über ?groesse=karte|mini ausliefert. */
export const VORSCHAU_GROESSEN = ['karte', 'mini'] as const;
export type VorschauGroesse = (typeof VORSCHAU_GROESSEN)[number];
/** Fassung, die eine Ansicht anfordert: eine Vorschaugröße oder das Original. */
export type BildGroesse = VorschauGroesse | 'original';

/** Breite der Fassungen in Pixeln; beim Original die längste Kante (größere Originale verkleinern Client und Server). */
export const BILD_BREITE: Record<BildGroesse, number> = { mini: 360, karte: 1080, original: 2000 };

/** JPEG-Qualität (0–100) eines neu gespeicherten bzw. vor dem Hochladen verkleinerten Originals. */
export const JPEG_QUALITAET_ORIGINAL = 85;

export const istVorschauGroesse = (v: unknown): v is VorschauGroesse =>
  typeof v === 'string' && (VORSCHAU_GROESSEN as readonly string[]).includes(v);
