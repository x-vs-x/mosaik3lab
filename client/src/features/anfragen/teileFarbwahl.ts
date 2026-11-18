// Regeln der Teile-Liste im Anfrageformular (mehrfarbige Druckteile) – ohne Browser testbar (client/test/farbauswahl.test.ts).
import { EGAL_FARBE } from '@mosaik3lab/shared/werte/anfragen';
import { passtZurSuche } from '@mosaik3lab/shared/suche';
import type { AreaColors } from '../../lib/colors';
import { farbfamilie } from '../../lib/farbfamilie';
import type { Filament } from '../../lib/types';

const nameVon = (f: Pick<Filament, 'colorName'>) => f.colorName.trim().toLowerCase();

/**
 * Nächstes Teil ohne Farbe nach `abId` (danach von vorn, das aktuelle Teil zählt nicht). Ohne `abId` das erste Teil
 * ohne Farbe. `undefined` = alle Teile haben eine Farbe.
 */
export function naechstesTeilOhneFarbe(ids: readonly string[], colors: Record<string, string>, abId?: string): string | undefined {
  const start = abId ? ids.indexOf(abId) + 1 : 0;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[(start + i) % ids.length];
    if (id !== abId && !colors[id]) return id;
  }
  return undefined;
}

/** Alle Farben, die in mindestens einem Teil wählbar sind (gleichnamige einmal) – für „Eine Farbe für alle Teile“. */
export function farbenAllerTeile(teile: readonly AreaColors[]): Filament[] {
  const seen = new Set<string>();
  return teile.flatMap((t) => t.filaments).filter((f) => !seen.has(nameVon(f)) && !!seen.add(nameVon(f)));
}

/**
 * „Eine Farbe für alle Teile“: setzt die Farbe (bzw. „Farbe egal“) in jedem Teil, in dem es sie gibt – über den
 * Farbnamen, weil gleichnamige Rollen je Teil verschieden sein können. `fehlt` = Teile ohne diese Farbe (bleiben, wie sie sind).
 */
export function eineFarbeFuerAlle(teile: readonly AreaColors[], colors: Record<string, string>, wahl: string, alle: readonly Filament[]) {
  const name = wahl === EGAL_FARBE ? '' : nameVon(alle.find((f) => f.id === wahl) ?? { colorName: '' });
  const next = { ...colors };
  const fehlt: string[] = [];
  for (const { area, filaments } of teile) {
    const passend = wahl === EGAL_FARBE ? EGAL_FARBE : filaments.find((f) => nameVon(f) === name)?.id;
    if (passend) next[area.id] = passend;
    else fehlt.push(area.name);
  }
  return { colors: next, fehlt };
}

/** Schon in dieser Anfrage gewählte Farben (für einheitliche Sets), in Teile-Reihenfolge, ohne „Farbe egal“. */
export function schonGewaehlt(teile: readonly AreaColors[], colors: Record<string, string>): Filament[] {
  const alle = teile.flatMap((t) => t.filaments);
  const seen = new Set<string>();
  const result: Filament[] = [];
  for (const { area } of teile) {
    const f = alle.find((x) => x.id === colors[area.id]);
    if (f && !seen.has(nameVon(f))) {
      seen.add(nameVon(f));
      result.push(f);
    }
  }
  return result;
}

/** Suche im Farbwahl-Fenster: Farbname oder Familie („grün“ findet auch „Mistelzweig-Grün“ und die Familie Grün). */
export const farbePasst = (f: Filament, q: string) => passtZurSuche([f.colorName, farbfamilie(f.hex)], q);

/** Farbname zu einer Wahl (Filament-ID oder „Farbe egal“), leer = noch keine Farbe. */
export function gewaehlteFarbe(filaments: readonly Filament[], id: string | undefined): Filament | 'egal' | undefined {
  if (!id) return undefined;
  if (id === EGAL_FARBE) return 'egal';
  return filaments.find((f) => f.id === id);
}
