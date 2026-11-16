import { BAMBU_KATALOG, filamentAusKatalog, katalogEintrag } from '../../domain/bambuKatalog';
import { isRequiredStatus } from '../../domain/orderStatuses';
import { filamentLabel, newId, type Filament, type MasterData } from '../../domain/settings';
import type { Item } from '../../domain/types';
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

/** Eine ganze Liste speichern: keine Dubletten, verwendete Einträge nicht löschen, Umbenennungen in Druckteile übernehmen. */
export async function saveList(storage: Storage, list: MasterDataList, entries: unknown) {
  const incoming = masterDataSchemas[list].parse(entries) as Entry[];
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
  // Farbrollen werden per ID referenziert – Umbenennungen brauchen keine Kaskade.
  const renamed =
    list !== 'filaments'
      ? next
          .map((n) => ({ from: current.find((c) => c.id === n.id)?.name, to: n.name ?? '' }))
          .filter((r): r is { from: string; to: string } => !!r.from && r.from !== r.to)
      : [];

  // Gelöschte Einträge dürfen nicht mehr verwendet werden (Zählung per SQL)
  for (const r of removed) {
    const usedBy = storage.masterData.countItemsUsing(list, list === 'filaments' ? r.id : (r.name ?? ''));
    if (usedBy > 0) {
      throw conflict(`${label} „${displayName(list, r)}“ wird noch von ${usedBy} Druckteil(en) verwendet und kann nicht gelöscht werden.`);
    }
  }
  // Betroffene Druckteile vor dem Speichern bestimmen (danach tragen sie schon den neuen Namen).
  const renamedItems = [...new Set(renamed.flatMap((r) => storage.masterData.itemIdsUsing(list, r.from)))];

  const saved = await storage.settings.update((s) => ({ ...s, masterData: { ...s.masterData, [list]: next } as MasterData }));

  // Umbenennungen in den Druckteilen nachziehen
  for (const id of renamedItems) await storage.items.update(id, (c) => renameIn(c, list, renamed));
  return saved.masterData;
}

function renameIn(item: Item, list: MasterDataList, renamed: { from: string; to: string }[]): Item {
  const map = (v: string) => renamed.find((r) => r.from === v)?.to ?? v;
  if (list === 'categories') return { ...item, category: map(item.category) };
  if (list === 'materials') return { ...item, material: map(item.material) };
  if (list === 'useAreas') return { ...item, useAreas: item.useAreas.map(map) };
  return item;
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
