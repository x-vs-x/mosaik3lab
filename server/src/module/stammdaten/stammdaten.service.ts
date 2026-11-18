import { BAMBU_KATALOG, filamentAusKatalog, katalogEintrag } from '../../domain/bambuKatalog';
import { isRequiredStatus } from './orderStatuses';
import { filamentLabel } from '../einstellungen/einstellungen.vorgaben';
import { newId } from '../../kern/ids';
import { type Filament, type MasterData } from '@mosaik3lab/shared/stammdaten';
import type { Item } from '../../domain/types';
import { linieVon, materialartVon } from '@mosaik3lab/shared/werte/katalog';
import { badRequest, conflict, notFound } from '../../kern/errors';
import type { Storage } from '../../storage';
import { masterDataSchemas, type MasterDataList } from '@mosaik3lab/shared/stammdaten';

// Regeln für die Stammdatenlisten (Kategorien, Einsatzbereiche, Materialien, Farbrollen) und die Bestellstatus-Schalter.

const LIST_LABELS: Record<MasterDataList, string> = {
  categories: 'Kategorie',
  useAreas: 'Einsatzbereich',
  materials: 'Material',
  filaments: 'Farbrolle',
};

/** Gemeinsame Sicht auf einen Stammdateneintrag (Farbrollen haben statt `name` Marke/Linie/Farbe). */
type Entry = { id: string; name?: string } & Partial<Omit<Filament, 'id'>>;

/** Anzeigename eines Eintrags für Meldungen und die Dublettenprüfung. */
function displayName(list: MasterDataList, e: Entry) {
  if (list === 'filaments') return filamentLabel({ brand: e.brand ?? '', line: e.line ?? '', colorName: e.colorName ?? '' });
  return e.name ?? '';
}

export const isMasterDataList = (list: string): list is MasterDataList => list in masterDataSchemas;

/** Feldnamen für Meldungen wie „Zeile 8: Name fehlt“. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  color: 'Farbe',
  icon: 'Symbol',
  brand: 'Marke',
  line: 'Linie',
  colorName: 'Farbname',
  hex: 'Farbwert',
  herstellerNummer: 'Herstellernummer',
};

/**
 * Liste prüfen – Fehler mit Zeilennummer (ab 1, wie in der Oberfläche) und Feld statt nur „Bitte überprüfen …“.
 * `fields` je Zeile unter ihrem Index (ab 0), damit die Oberfläche die Zeile markieren kann.
 */
function parseEntries(list: MasterDataList, entries: unknown): Entry[] {
  const parsed = masterDataSchemas[list].safeParse(entries);
  if (parsed.success) return parsed.data as Entry[];
  const fields: Record<string, string> = {};
  const lines: string[] = [];
  for (const issue of parsed.error.issues) {
    const [index, field] = issue.path;
    if (typeof index !== 'number') {
      if (!fields._) lines.push(`Die Liste fehlt oder ist ungültig (${issue.message})`);
      fields._ ??= issue.message;
      continue;
    }
    if (fields[index]) continue; // je Zeile nur die erste Meldung
    const label = typeof field === 'string' ? (FIELD_LABELS[field] ?? field) : 'Eintrag';
    const problem = issue.message === 'Pflichtfeld' ? `${label} fehlt` : `${label}: ${issue.message}`;
    fields[index] = problem;
    lines.push(`Zeile ${index + 1}: ${problem}`);
  }
  const more = lines.length > 3 ? ` (und ${lines.length - 3} weitere)` : '';
  throw badRequest(`${lines.slice(0, 3).join('; ')}${more}.`, fields);
}

/** Eine ganze Liste speichern: keine Dubletten, verwendete Einträge nicht löschen, Farbgruppen folgen umbenannten Linien. */
export async function saveList(storage: Storage, list: MasterDataList, entries: unknown) {
  const incoming = parseEntries(list, entries);
  const label = LIST_LABELS[list];

  const current = (await storage.settings.get()).masterData[list] as Entry[];
  const katalogVon = (e: Entry) => (list === 'filaments' && e.id ? current.find((c) => c.id === e.id)?.katalogId : undefined);

  // Doppelte Namen verhindern (Katalog-Rollen sind über ihre Katalog-ID eindeutig)
  const seen = new Set<string>();
  for (const e of incoming) {
    const key = katalogVon(e) ?? displayName(list, e).toLocaleLowerCase('de-DE');
    if (seen.has(key)) throw badRequest(`${label} „${displayName(list, e)}“ ist doppelt vorhanden.`);
    seen.add(key);
  }
  if (list !== 'useAreas' && incoming.length === 0) {
    throw badRequest(`Es muss mindestens ein Eintrag (${label}) vorhanden sein.`);
  }

  const currentIds = new Set(current.map((c) => c.id));
  const next = incoming.map((e) => {
    const id = e.id && currentIds.has(e.id) ? e.id : newId();
    if (list !== 'filaments') return { ...e, id };
    // Schalter „verfügbar“ bleibt erhalten, wenn er nicht mitgeschickt wird.
    const before = current.find((c) => c.id === id);
    const available = e.available ?? before?.available ?? true;
    // Bambu-Katalog-Rollen: Marke, Linie, Namen, Nummer und Farbe sind schreibgeschützt (der Abgleich pflegt sie).
    if (before?.katalogId) return { ...before, id, available };
    return { ...e, id, available, katalogId: null, herstellerName: '', weggefallen: false };
  });

  const removed = current.filter((c) => !next.some((n) => n.id === c.id));
  // Kategorie, Material und Einsatzbereich hängen per ID am Druckteil – Umbenennen wirkt sofort, ohne Kaskade.
  // Verwendete Einträge dürfen nicht gelöscht werden (Zählung per SQL).
  if (list !== 'filaments') {
    for (const r of removed) {
      const usedBy = storage.masterData.countItemsUsing(list, r.name ?? '');
      if (usedBy > 0) {
        throw conflict(`${label} „${displayName(list, r)}“ wird noch von ${usedBy} Druckteil(en) verwendet und kann nicht gelöscht werden.`);
      }
    }
    return (await storage.settings.update((s) => ({ ...s, masterData: { ...s.masterData, [list]: next } as MasterData }))).masterData;
  }

  // Farbrollen: gelöschte verschwinden aus den Druckteilen (vor dem Löschen, wegen des Fremdschlüssels), und gewählte
  // Gruppen („linie:…“, „art:…“) folgen einer umbenannten Linie bzw. Materialart. Alles in einer Transaktion mit dem
  // Speichern der Liste – scheitert etwas, bleiben Druckteile und Farbrollen, wie sie waren.
  const weg = new Set(removed.map((r) => r.id));
  const umbenannt = gruppenNachfolger(current as Filament[], next as Filament[]);
  const betroffen = [
    ...new Set([...removed.flatMap((r) => storage.masterData.itemIdsUsing(list, r.id)), ...storage.masterData.itemIdsMitGruppen([...umbenannt.keys()])]),
  ];
  const { ergebnis } = await storage.items.updateMany(
    betroffen,
    (c) => {
      const mitGruppen = umbenannt.size ? mitNeuenGruppen(c, umbenannt) : c;
      return weg.size ? ohneFarbrollen(mitGruppen, weg) : mitGruppen;
    },
    { danach: () => storage.settings.aendere((s) => ({ ...s, masterData: { ...s.masterData, filaments: next as Filament[] } })) },
  );
  return ergebnis!.masterData;
}

/**
 * Welche Gruppen nach dem Speichern ins Leere zeigen und eindeutig weiterleben: Verschwindet eine Linie (bzw. Materialart)
 * ganz und tragen ihre bisherigen Rollen danach alle dieselbe neue, zeigt die Gruppe dorthin. Sonst (Rollen gelöscht oder
 * auf mehrere Linien verteilt) bleibt sie stehen – das Team wählt dann im Druckteil neu.
 */
export function gruppenNachfolger(vorher: Filament[], nachher: Filament[]): Map<string, string> {
  const umbenannt = new Map<string, string>();
  for (const [schluessel, gruppe] of [
    [linieVon, (v: string) => `linie:${v}`],
    [materialartVon, (v: string) => `art:${v}`],
  ] as const) {
    const neueWerte = new Set(nachher.map(schluessel).filter(Boolean));
    for (const alt of new Set(vorher.map(schluessel).filter(Boolean))) {
      if (neueWerte.has(alt)) continue;
      const ids = new Set(vorher.filter((f) => schluessel(f) === alt).map((f) => f.id));
      const nachfolger = new Set(nachher.filter((f) => ids.has(f.id)).map(schluessel));
      const [einziger] = nachfolger;
      if (nachfolger.size === 1 && einziger) umbenannt.set(gruppe(alt), gruppe(einziger));
    }
  }
  return umbenannt;
}

/** Gewählte Gruppen der Farbbereiche umschreiben (ohne Doppelte); unverändert, wenn das Druckteil keine davon nutzt. */
function mitNeuenGruppen(item: Item, umbenannt: Map<string, string>): Item {
  if (!item.colorAreas.some((a) => a.gruppen?.some((g) => umbenannt.has(g)))) return item;
  const colorAreas = item.colorAreas.map((a) => (a.gruppen?.length ? { ...a, gruppen: [...new Set(a.gruppen.map((g) => umbenannt.get(g) ?? g))] } : a));
  return { ...item, colorAreas, updatedAt: new Date().toISOString() };
}

/**
 * Gelöschte Farbrollen aus allen Farbbereichen nehmen. Bleibt ein Bereich ohne Farbe und ohne Gruppe, gilt dort
 * „Alle Farben“ – so bleibt das Druckteil bestellbar und gültig.
 */
export function ohneFarbrollen(item: Item, weg: Set<string>): Item {
  const colorAreas = item.colorAreas.map((a) => {
    if (a.alleFarben) return a;
    const colors = a.colors.filter((c) => !weg.has(c));
    return colors.length || a.gruppen?.length ? { ...a, colors } : { ...a, alleFarben: true, colors: [], gruppen: [] };
  });
  return { ...item, colorAreas, colors: [...new Set(colorAreas.flatMap((a) => a.colors))], updatedAt: new Date().toISOString() };
}

/** Bestellstatus an/aus (feste Liste). Anfragen behalten einen ausgeschalteten Status; er ist nur nicht mehr wählbar. */
export async function toggleStatus(storage: Storage, id: string, active: boolean) {
  const current = (await storage.settings.get()).masterData.orderStatuses;
  const def = current.find((s) => s.id === id);
  if (!def) throw notFound('Unbekannter Status.');
  if (!active && isRequiredStatus(id)) {
    throw badRequest(`„${def.name}“ gilt für neue Anfragen und kann nicht ausgeschaltet werden.`);
  }
  if (!active && def.phase === 'done' && !current.some((s) => s.id !== id && s.active && s.phase === 'done')) {
    throw badRequest('Mindestens ein Status für erledigte Anfragen muss eingeschaltet bleiben.');
  }
  const saved = await storage.settings.update((s) => ({
    ...s,
    masterData: { ...s.masterData, orderStatuses: s.masterData.orderStatuses.map((o) => (o.id === id ? { ...o, active } : o)) },
  }));
  return saved.masterData;
}

/** Farbrollen aus dem Bambu-Lab-Katalog übernehmen; schon vorhandene Katalogfarben werden übersprungen. */
export async function importFilaments(storage: Storage, ids: string[]) {
  const unknown = ids.filter((id) => !katalogEintrag(id) || katalogEintrag(id)?.weggefallen);
  if (unknown.length) {
    throw badRequest(`Unbekannte Farbe(n) im Bambu-Katalog: ${unknown.join(', ')}`, { ids: 'Unbekannte Farbe' });
  }
  let added = 0;
  const saved = await storage.settings.update((s) => {
    const existing = new Set(s.masterData.filaments.flatMap((f) => [f.id, f.katalogId ?? '']));
    // Reihenfolge wie im Katalog.
    const fresh = BAMBU_KATALOG.eintraege.filter((e) => ids.includes(e.id) && !existing.has(e.id)).map(filamentAusKatalog);
    added = fresh.length;
    return { ...s, masterData: { ...s.masterData, filaments: [...s.masterData.filaments, ...fresh] } };
  });
  return { masterData: saved.masterData, added };
}

/** Farbrolle als leer/verfügbar markieren. */
export async function setFilamentAvailability(storage: Storage, id: string, available: boolean) {
  if (!(await storage.settings.get()).masterData.filaments.some((f) => f.id === id)) {
    throw notFound('Farbrolle nicht gefunden.');
  }
  const saved = await storage.settings.update((s) => ({
    ...s,
    masterData: { ...s.masterData, filaments: s.masterData.filaments.map((f) => (f.id === id ? { ...f, available } : f)) },
  }));
  return saved.masterData;
}
