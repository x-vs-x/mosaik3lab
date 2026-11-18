// Stammdaten: Listen und kleine Hilfen ohne zod – auch für den Client. Schemas und Typen in ../stammdaten.ts.

/** Farben aus dem Schullogo (+ Grau) – der Client ordnet ihnen Stile zu (lib/constants.ts). */
export const COLOR_KEYS = ['blau', 'rot', 'gelb', 'orange', 'lila', 'gruen', 'grau'] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

/** Symbole, die für Kategorien gewählt werden können (Namen aus dem Symbolsatz des Clients). */
export const ICON_KEYS = [
  'kommunikation',
  'hand',
  'besteck',
  'buch',
  'sterne',
  'werkzeug',
  'formen',
  'puzzle',
  'stift',
  'musik',
  'herz',
  'rollstuhl',
] as const;
export type IconKey = (typeof ICON_KEYS)[number];

/** Rolle für Druck-Team und Admin, z. B. „Bambu Lab PLA Basic, Nr. 10101“ (Lehrkräfte sehen nur den Farbnamen). */
export function filamentRolle(f: { brand: string; line: string; herstellerNummer?: string }) {
  const art = [f.brand, f.line].map((s) => s.trim()).filter(Boolean).join(' ');
  const nr = f.herstellerNummer?.trim() ? `Nr. ${f.herstellerNummer.trim()}` : '';
  return [art, nr].filter(Boolean).join(', ');
}
