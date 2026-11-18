// Katalog: Listen, Grenzen und kleine Hilfen ohne zod – auch für den Client (hält zod aus dem Haupt-Chunk).
// Die Schemas stehen in ../katalog.ts und exportieren alles von hier wieder.

/** Art eines Druckteils. */
export const ITEM_KINDS = ['hilfsmittel', 'lehrmittel', 'beides'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const ITEM_KIND_LABELS: Record<ItemKind, string> = { hilfsmittel: 'Hilfsmittel', lehrmittel: 'Lehrmittel', beides: 'Hilfs- und Lehrmittel' };

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'select'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** Höchstlänge einer Angabe in Personalisierungsfeldern. */
export const MAX_CUSTOM_VALUE_LENGTH = 200;

/**
 * Höchstzahl Farbbereiche („Teile“) je Druckteil. 20 passt zum Export-Format seit 1.6.3 (bis 20 je Druckteil) und zur
 * Anfrage (colorMapSchema, bis 20). Versionen bis 1.8.0 überspringen beim Import Druckteile mit mehr als 8 Teilen.
 */
export const MAX_COLOR_AREAS = 20;
/** Schutzgrenze für Kategorien je Druckteil (die erste ist die Hauptkategorie). */
export const MAX_ITEM_CATEGORIES = 20;
/** Höchstzahl Personalisierungsfelder je Druckteil. */
export const MAX_CUSTOM_FIELDS = 10;

/** Schutzgrenze für Link-Knöpfe je Druckteil (praktisch beliebig viele). */
export const MAX_ITEM_LINKS = 50;

type Rolle = { brand: string; line: string };
/** Gruppe „Linie“ einer Farbrolle, z. B. „Bambu Lab PLA Basic“ (leer = ohne Marke und Linie). */
export const linieVon = (f: Rolle) => [f.brand, f.line].map((s) => s.trim()).filter(Boolean).join(' ');
/** Materialart einer Farbrolle aus dem ersten Wort der Linie, z. B. „PLA“ aus „PLA Basic“ (leer = ohne Linie). */
export const materialartVon = (f: Rolle) => (f.line.trim().split(/\s+/)[0] ?? '').toLocaleUpperCase('de-DE');
export const gruppeLinie = (f: Rolle) => `linie:${linieVon(f)}`;
export const gruppeArt = (art: string) => `art:${art}`;
/** Gehört die Farbrolle zu einer der Gruppen eines Farbbereichs? */
export function inGruppen(f: Rolle, gruppen: readonly string[] | undefined) {
  if (!gruppen?.length) return false;
  const linie = linieVon(f);
  const art = materialartVon(f);
  return gruppen.some((g) => (!!linie && g === `linie:${linie}`) || (!!art && g === `art:${art}`));
}
