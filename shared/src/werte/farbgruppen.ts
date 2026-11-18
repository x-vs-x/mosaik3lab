// Mehrfarbige Druckteile: Farbwahl je Teil nach Farbe bündeln – gleiche Regel für Mail, Verwaltung und „Meine Anfragen“.
// Ohne zod (auch für den Client). Ein „Teil“ ist technisch ein Farbbereich (ColorArea / OrderColorChoice).
import { EGAL_FARBE } from './anfragen';

/** Was die Bündelung von einer Farbwahl braucht (passt zu OrderColorChoice). */
export interface TeilFarbe {
  areaId: string;
  area: string;
  colorId: string;
  color: string;
  colorHex: string;
}

export interface FarbGruppe<T extends TeilFarbe = TeilFarbe> {
  /** Schlüssel der Farbe (Farbrollen-ID, bei älteren Daten ohne ID der Name). */
  schluessel: string;
  colorId: string;
  color: string;
  colorHex: string;
  /** „Farbe egal“ – das Druck-Team wählt. */
  egal: boolean;
  /** Teile in dieser Farbe, in Teile-Reihenfolge. */
  teile: T[];
}

const schluesselVon = (c: TeilFarbe) => (c.colorId === EGAL_FARBE ? EGAL_FARBE : c.colorId || c.color.trim().toLowerCase());

/**
 * Teile nach Farbe gebündelt: Reihenfolge wie das erste Auftreten (also wie in der Teile-Liste), „Farbe egal“ zuletzt.
 * So druckt das Team eine Farbrolle nach der anderen.
 */
export function nachFarbe<T extends TeilFarbe>(teile: readonly T[]): FarbGruppe<T>[] {
  const map = new Map<string, FarbGruppe<T>>();
  for (const t of teile) {
    const key = schluesselVon(t);
    const g = map.get(key);
    if (g) g.teile.push(t);
    else map.set(key, { schluessel: key, colorId: t.colorId, color: t.color, colorHex: t.colorHex, egal: key === EGAL_FARBE, teile: [t] });
  }
  const gruppen = [...map.values()];
  return [...gruppen.filter((g) => !g.egal), ...gruppen.filter((g) => g.egal)];
}

/** „1 Teil“ / „3 Teile“, „1 Farbe“ / „4 Farben“. */
export const teileText = (n: number) => `${n} ${n === 1 ? 'Teil' : 'Teile'}`;
export const farbenText = (n: number) => `${n} ${n === 1 ? 'Farbe' : 'Farben'}`;

/** Kurzfassung „10 Teile · 7 Farben“ („Farbe egal“ zählt nicht als Farbe). */
export function farbZusammenfassung(teile: readonly TeilFarbe[]): string {
  const farben = nachFarbe(teile).filter((g) => !g.egal).length;
  const egal = teile.some((t) => t.colorId === EGAL_FARBE);
  return [teileText(teile.length), farben ? farbenText(farben) : '', egal ? 'Farbe egal' : ''].filter(Boolean).join(' · ');
}

/** Teile, deren Farbe von der Vergleichs-Variante abweicht (für „abweichend: Dach, Tor“). */
export function abweichendeTeile<T extends TeilFarbe>(teile: readonly T[], vergleich: readonly TeilFarbe[]): T[] {
  const vorher = new Map(vergleich.map((c) => [c.areaId, schluesselVon(c)]));
  return teile.filter((t) => vorher.has(t.areaId) && vorher.get(t.areaId) !== schluesselVon(t));
}
