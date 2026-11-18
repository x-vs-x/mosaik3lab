import type { User } from '../../domain/types';
import { badRequest, notFound } from '../../kern/errors';
import { dateiName } from '../../kern/files';
import type { Storage } from '../../storage';
import type { AehnlichesTeil } from '@mosaik3lab/shared/katalog';
import { siehtEntwuerfe } from './katalog.service';

// Ähnliche Druckteile: gegenseitige Verknüpfung A ↔ B (Tabelle artikel_aehnlich, SQL in katalog.repository.ts).
// Löschen eines Druckteils räumt per Fremdschlüssel auf. Export/Import: module/datenaustausch/datenaustausch.aehnliche.ts.

/** Verknüpfte Druckteile als kleine Karten; Besucher sehen nur veröffentlichte. */
export function listAehnliche(storage: Storage, id: string, user: User | undefined): AehnlichesTeil[] {
  return storage.items
    .aehnliche(id, siehtEntwuerfe(user))
    .map((r) => ({
      id: r.id,
      name: r.name,
      shortDescription: r.kurzbeschreibung,
      category: r.kategorie,
      image: r.bild ? dateiName(r.bild) : '',
      published: r.veroeffentlicht,
    }))
    .sort((p, q) => p.name.localeCompare(q.name, 'de'));
}

const gibtEs = (storage: Storage, id: string) => storage.items.istVeroeffentlicht(id) !== undefined;

/** Verknüpft zwei Druckteile (doppelt anlegen schadet nicht). */
export function addAehnlich(storage: Storage, id: string, andere: string, user: User) {
  if (!gibtEs(storage, id)) throw notFound('Druckteil nicht gefunden.');
  if (andere === id) throw badRequest('Ein Druckteil kann nicht mit sich selbst verknüpft werden.');
  if (!gibtEs(storage, andere)) throw badRequest('Das ähnliche Druckteil gibt es nicht (mehr).');
  storage.items.verknuepfe(id, andere);
  return listAehnliche(storage, id, user);
}

/** Hebt die Verknüpfung auf – auf beiden Seiten. */
export function removeAehnlich(storage: Storage, id: string, andere: string, user: User) {
  if (!gibtEs(storage, id)) throw notFound('Druckteil nicht gefunden.');
  storage.items.trenne(id, andere);
  return listAehnliche(storage, id, user);
}
