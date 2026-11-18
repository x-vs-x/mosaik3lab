// Gemeinsame Auswahl einer Anfrage: Stückzahl(en) mit Farben, Größe und Personalisierung. Die Druckteil-Seite und das
// Anfrage-Fenster teilen sich diesen einen Zustand (useAnfrageAuswahl) – was man auf der Seite wählt, steht im Fenster
// vorbelegt, und „Weitere Stückzahl“ im Fenster hängt an dieselbe Auswahl an. Reine Regeln, ohne Browser testbar
// (client/test/druckteilSeite.test.ts).
import { EGAL_FARBE, EGAL_FARBE_NAME } from '@mosaik3lab/shared/werte/anfragen';
import type { TeilFarbe } from '@mosaik3lab/shared/werte/farbgruppen';
import { aufAngeboteneFarben, initialColorChoice, itemColorAreas, type AreaColors } from '../../lib/colors';
import type { Item, MasterData, RequestTemplate } from '../../lib/types';

/** Eine Zeile „Anzahl + Farbe je Farbbereich“ – mehrere Zeilen = mehrere Farben in einer Anfrage. */
export interface ColorRowValue {
  quantity: number;
  colors: Record<string, string>;
}

export interface AnfrageAuswahl {
  /** Zeile 1 = Anzahl + Farbe von der Seite; weitere Zeilen = „Weitere Stückzahl“ aus dem Fenster. */
  rows: ColorRowValue[];
  size: string;
  custom: Record<string, string>;
}

export interface Farbbereiche {
  /** Bereiche mit vorrätigen Farben. */
  areas: AreaColors[];
  /** Bereiche mit hinterlegten, aber derzeit keinen vorrätigen Farben. */
  emptyAreas: AreaColors[];
  /** Mehrere Farbbereiche („Farbe je Teil“). */
  multiColor: boolean;
}

export function farbbereiche(item: Pick<Item, 'colors' | 'colorAreas'>, md: MasterData): Farbbereiche {
  const alle = itemColorAreas(item, md).filter((a) => a.area.colors.length > 0);
  return {
    areas: alle.filter((a) => a.filaments.length > 0),
    emptyAreas: alle.filter((a) => a.filaments.length === 0),
    multiColor: alle.length > 1,
  };
}

/** Schlüssel der Fehlermeldung einer Farbe wie beim Server: `color…`, ab der zweiten Zeile `variants.<n>.color…`. */
export const farbFehlerSchluessel = (multiColor: boolean) => (areaId: string, row = 0) =>
  (row ? `variants.${row}.` : '') + (multiColor ? `color.${areaId}` : 'color');

/** Ausgangszustand: aus „Erneut anfragen“/„Bearbeiten“ (`template`) oder leer; Bereiche mit nur einer Farbe sind gewählt. */
export function startAuswahl(areas: AreaColors[], sizes: string[], md: MasterData, template?: RequestTemplate): AnfrageAuswahl {
  const basis = initialColorChoice(areas);
  const zeile = (quantity: number, colors: Record<string, string>) => ({ quantity, colors: { ...basis, ...aufAngeboteneFarben(areas, colors, md) } });
  return {
    rows: template?.variants?.length ? template.variants.map((v) => zeile(v.quantity, v.colors)) : [zeile(template?.quantity ?? 1, template?.colors ?? {})],
    size: template?.size || (sizes.length === 1 ? sizes[0] : ''),
    custom: template?.personalization ?? {},
  };
}

/**
 * Bereiche mit genau einer vorrätigen Farbe nachträglich vorwählen (die Farbrollen können nach dem Druckteil geladen sein).
 * Ändert sich nichts, kommt dasselbe Objekt zurück (kein unnötiges Neuzeichnen).
 */
export function ergaenzeEinzelfarben(a: AnfrageAuswahl, areas: AreaColors[]): AnfrageAuswahl {
  const einzeln = initialColorChoice(areas);
  const fehlt = (r: ColorRowValue) => Object.keys(einzeln).some((id) => !r.colors[id]);
  if (!a.rows.some(fehlt)) return a;
  return { ...a, rows: a.rows.map((r) => (fehlt(r) ? { ...r, colors: { ...einzeln, ...r.colors } } : r)) };
}

export const gesamtStueck = (a: Pick<AnfrageAuswahl, 'rows'>) => a.rows.reduce((n, r) => n + r.quantity, 0);

/**
 * „Weitere Stückzahl“: neue Zeile mit 1 Stück. Mehrteilig übernimmt sie die Farben der letzten Zeile (man ändert nur, was
 * abweicht), einfarbig startet sie leer (bzw. mit der einzigen Farbe).
 */
export function weitereStueckzahl(a: AnfrageAuswahl, areas: AreaColors[], multiColor: boolean): AnfrageAuswahl {
  const letzte = a.rows[a.rows.length - 1];
  return { ...a, rows: [...a.rows, { quantity: 1, colors: multiColor ? { ...letzte.colors } : initialColorChoice(areas) }] };
}

export function entferneStueckzahl(a: AnfrageAuswahl, index: number): AnfrageAuswahl {
  if (index <= 0 || a.rows.length <= 1) return a;
  return { ...a, rows: a.rows.filter((_, i) => i !== index) };
}

/** Zeile `index` ändern (z. B. Anzahl oder Farben von der Seite). */
export function setzeZeile(a: AnfrageAuswahl, index: number, zeile: Partial<ColorRowValue>): AnfrageAuswahl {
  return { ...a, rows: a.rows.map((r, i) => (i === index ? { ...r, ...zeile } : r)) };
}

/** Farben einer Zeile als Liste für die Anzeige (FarbZusammenfassung); Teile ohne Wahl fallen weg. */
export function teilFarben(areas: AreaColors[], colors: Record<string, string>): TeilFarbe[] {
  return areas.flatMap(({ area, filaments }) => {
    const id = colors[area.id];
    if (!id) return [];
    if (id === EGAL_FARBE) return [{ areaId: area.id, area: area.name, colorId: EGAL_FARBE, color: EGAL_FARBE_NAME, colorHex: '' }];
    const f = filaments.find((x) => x.id === id);
    return f ? [{ areaId: area.id, area: area.name, colorId: f.id, color: f.colorName, colorHex: f.hex }] : [];
  });
}
