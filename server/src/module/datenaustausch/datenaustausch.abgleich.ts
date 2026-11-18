import { newId } from '../../kern/ids';
import { ID } from './datenaustausch.paket';
import type { Detail, Zaehler } from './datenaustausch.service';

// Import: Bezüge der eingespielten Druckteile (Kategorien, Einsatzbereiche, Materialien, Farbrollen) zuordnen.
// Vorhandene Einträge bleiben, wie sie sind; was fehlt, wird ergänzt. Nichts wird geändert oder gelöscht.

export const lc = (s: string) => s.trim().toLocaleLowerCase('de-DE');

/**
 * Ergänzt eine Stammdatenliste um die gebrauchten Einträge aus dem Paket. Gleicher Schlüssel (meist der Name) = derselbe
 * Eintrag; mit `perId` zählt auch die gleiche ID (Farbrollen – Druckteile verweisen per ID darauf, sonst per Name). Gibt die neue Liste und die Zuordnung Paket-ID → ID hier zurück.
 */
export function ergaenze<T extends { id: string }>(
  bestehend: T[],
  gebraucht: T[],
  o: { schluessel: (e: T) => string; perId?: boolean; z: Zaehler; bereich: string; name: (e: T) => string; details: Detail[] },
) {
  const liste = bestehend.map((e) => ({ ...e }));
  const nachId = new Map(liste.map((e) => [e.id, e]));
  const nachSchluessel = new Map(liste.map((e) => [o.schluessel(e), e]));
  const map = new Map<string, string>();
  const gezaehlt = new Set<string>();
  for (const e of gebraucht) {
    const key = o.schluessel(e);
    const vorhanden = nachSchluessel.get(key) ?? (o.perId ? nachId.get(e.id) : undefined);
    if (vorhanden) {
      map.set(e.id, vorhanden.id);
      if (!gezaehlt.has(vorhanden.id)) o.z.unveraendert++;
      gezaehlt.add(vorhanden.id);
      continue;
    }
    const id = ID.test(e.id) && !nachId.has(e.id) ? e.id : newId();
    const eintrag = { ...e, id };
    liste.push(eintrag);
    nachId.set(id, eintrag);
    nachSchluessel.set(key, eintrag);
    map.set(e.id, id);
    gezaehlt.add(id);
    o.z.neu++;
    o.details.push({ status: 'neu', bereich: o.bereich, name: o.name(e) });
  }
  return { liste, map };
}
