// Mehrteilige Druckteile anlegen: „gemeinsame Farbauswahl für alle Teile“ und Ausnahmen – reine Bedienung, keine neuen
// Daten. Beim Speichern steht die gemeinsame Auswahl in jedem Teil ohne eigene Auswahl; beim Laden gilt die häufigste
// Auswahl als gemeinsam. Ohne Browser testbar (client/test/farbauswahl.test.ts).
import { inGruppen, MAX_COLOR_AREAS } from '@mosaik3lab/shared/werte/katalog';
import type { ColorArea, Filament } from '../../../lib/types';
import { newId, ohneGruppen } from './itemForm';

/** Die Farbauswahl eines Teils (ohne Name und ID). */
export type Auswahl = Pick<ColorArea, 'alleFarben' | 'colors' | 'gruppen'>;

/** Auswahl ohne Rollen, die schon eine Gruppe abdeckt (der Server füllt sie beim Lesen ein). */
export function bereinigt(a: Auswahl, filaments: Filament[]): Required<Auswahl> {
  if (a.alleFarben) return { alleFarben: true, colors: [], gruppen: [] };
  const gruppen = a.gruppen ?? [];
  return { alleFarben: false, colors: ohneGruppen(a.colors, gruppen, filaments), gruppen };
}

/** Vergleichsschlüssel: gleiche Auswahl = gleicher Schlüssel (Reihenfolge egal). */
export function auswahlSchluessel(a: Auswahl, filaments: Filament[]): string {
  const b = bereinigt(a, filaments);
  return b.alleFarben ? 'alle' : `g:${[...b.gruppen].sort().join('|')};c:${[...b.colors].sort().join('|')}`;
}

/**
 * Gemeinsame Auswahl = die häufigste. Bei Gleichstand bleibt die bisherige (`bevorzugt`, Schlüssel), sonst die erste –
 * so springt „gemeinsam“ nicht um, wenn man einem von zwei Teilen eigene Farben gibt.
 */
export function gemeinsameAuswahl(areas: readonly ColorArea[], filaments: Filament[], bevorzugt?: string): Required<Auswahl> {
  const zahl = new Map<string, { n: number; a: ColorArea }>();
  for (const a of areas) {
    const key = auswahlSchluessel(a, filaments);
    const z = zahl.get(key);
    if (z) z.n++;
    else zahl.set(key, { n: 1, a });
  }
  let best: { n: number; a: ColorArea } | undefined;
  for (const [key, z] of zahl) {
    if (!best || z.n > best.n || (z.n === best.n && key === bevorzugt)) best = z;
  }
  return best ? bereinigt(best.a, filaments) : { alleFarben: true, colors: [], gruppen: [] };
}

/** Teile, die der gemeinsamen Auswahl folgen, bekommen die neue (die anderen behalten ihre eigene). */
export function setzeGemeinsame(areas: readonly ColorArea[], alt: Auswahl, neu: Auswahl, filaments: Filament[]): ColorArea[] {
  const altKey = auswahlSchluessel(alt, filaments);
  const sauber = bereinigt(neu, filaments);
  return areas.map((a) => (auswahlSchluessel(a, filaments) === altKey ? { ...a, ...sauber } : a));
}

/** Anzahl Farbrollen, die eine Auswahl abdeckt (für gleich breite Schilder „eigene: 6 Farben“). */
export function farbAnzahl(a: Auswahl, filaments: Filament[]): number {
  if (a.alleFarben) return filaments.length;
  const ids = new Set(a.colors);
  return filaments.filter((f) => ids.has(f.id) || inGruppen(f, a.gruppen)).length;
}

/** Kurzbeschreibung einer Auswahl, z. B. „Ganze Linie: Bambu Lab PLA Basic“ / „38 Farben, neue kommen automatisch dazu“. */
export function auswahlBeschreibung(a: Auswahl, filaments: Filament[]): { titel: string; text: string } {
  const n = farbAnzahl(a, filaments);
  const farben = `${n} ${n === 1 ? 'Farbe' : 'Farben'}`;
  if (a.alleFarben) return { titel: 'Alle Farben', text: `${farben}, neue kommen automatisch dazu` };
  const b = bereinigt(a, filaments);
  const namen = b.gruppen.map((g) => (g.startsWith('art:') ? `alle ${g.slice(4)}` : g.slice(6)));
  if (!namen.length) return { titel: 'Bestimmte Farben', text: farben };
  const titel = b.gruppen.length === 1 && b.gruppen[0].startsWith('linie:') ? `Ganze Linie: ${namen[0]}` : namen.join(', ');
  return { titel: b.colors.length ? `${titel} + ${b.colors.length} einzeln` : titel, text: `${farben}, neue kommen automatisch dazu` };
}

/** Teil an Position `i` um `delta` verschieben (nach oben = −1). */
export function verschiebe<T>(liste: readonly T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (j < 0 || j >= liste.length) return [...liste];
  const neu = [...liste];
  [neu[i], neu[j]] = [neu[j], neu[i]];
  return neu;
}

export const MAX_TEILNAME = 40;

/**
 * „Mehrere Teile auf einmal“: ein Teil je Zeile. Gleichnamige Teile behalten ID und Farben (Anfragen bleiben zuordenbar),
 * neue bekommen die gemeinsame Auswahl. `fehler` = verständlicher Grund, warum es so nicht geht.
 */
export function teileAusText(text: string, areas: readonly ColorArea[], gemeinsam: Auswahl): { namen: string[]; areas: ColorArea[]; fehler?: string } {
  const namen = text
    .split(/\r?\n/)
    .map((z) => z.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const vorhanden = new Map(areas.map((a) => [a.name.trim().toLocaleLowerCase('de-DE'), a]));
  const gesehen = new Set<string>();
  let fehler: string | undefined;
  for (const n of namen) {
    const key = n.toLocaleLowerCase('de-DE');
    if (n.length > MAX_TEILNAME) fehler ??= `„${n.slice(0, 30)}…“ ist zu lang (höchstens ${MAX_TEILNAME} Zeichen).`;
    if (gesehen.has(key)) fehler ??= `„${n}“ steht doppelt – jedes Teil braucht einen eigenen Namen.`;
    gesehen.add(key);
  }
  if (namen.length > MAX_COLOR_AREAS) fehler = `Höchstens ${MAX_COLOR_AREAS} Teile – ${namen.length} erkannt. Bitte ${namen.length - MAX_COLOR_AREAS} Zeilen entfernen.`;
  else if (namen.length < 2) fehler ??= 'Bitte mindestens zwei Teile eintragen, je Zeile eines.';
  const neu = namen.slice(0, MAX_COLOR_AREAS).map((name): ColorArea => {
    const alt = vorhanden.get(name.toLocaleLowerCase('de-DE'));
    return alt ? { ...alt, name } : { id: newId('teil'), name, alleFarben: gemeinsam.alleFarben, colors: [...gemeinsam.colors], gruppen: [...(gemeinsam.gruppen ?? [])] };
  });
  return { namen, areas: neu, fehler };
}
