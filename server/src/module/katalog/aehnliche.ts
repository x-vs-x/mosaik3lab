import type { User } from '../../domain/types';
import { all, bool, one, run, str } from '../../kern/db';
import { badRequest, notFound } from '../../kern/errors';
import { dateiName } from '../../kern/files';
import type { Storage } from '../../storage';
import type { AehnlichesTeil } from '@mosaik3lab/shared/katalog';
import { canManage } from './katalog.service';

// Ähnliche Druckteile: gegenseitige Verknüpfung A ↔ B (Tabelle artikel_aehnlich, Paar mit a < b).
// Löschen eines Druckteils räumt per Fremdschlüssel auf. Nicht Teil von Export/Import.

const paar = (x: string, y: string) => (x < y ? [x, y] : [y, x]);

/** Verknüpfte Druckteile als kleine Karten; Besucher sehen nur veröffentlichte. */
export function listAehnliche(storage: Storage, id: string, user: User | undefined): AehnlichesTeil[] {
  const { db } = storage.sqlite;
  const mitEntwuerfen = canManage(user);
  const rows = all(
    db,
    `SELECT x.id, x.nummer, x.name, x.veroeffentlicht, k.name AS kategorie,
       (SELECT d.id FROM datei d WHERE d.objekttyp = 'artikel' AND d.objekt_id = x.id AND d.rolle = 'bild' ORDER BY d.sortierung, d.erstellt_am LIMIT 1) AS bild_id,
       (SELECT d.pfad FROM datei d WHERE d.objekttyp = 'artikel' AND d.objekt_id = x.id AND d.rolle = 'bild' ORDER BY d.sortierung, d.erstellt_am LIMIT 1) AS bild_pfad
     FROM artikel_aehnlich p
     JOIN artikel x ON x.id = CASE WHEN p.a = ? THEN p.b ELSE p.a END
     LEFT JOIN kategorie k ON k.id = x.kategorie_id
     WHERE (p.a = ? OR p.b = ?) ${mitEntwuerfen ? '' : 'AND x.veroeffentlicht = 1'}`,
    id,
    id,
    id,
  );
  return rows
    .map((r) => ({
      id: str(r.id),
      number: str(r.nummer),
      name: str(r.name),
      category: str(r.kategorie),
      image: r.bild_id ? dateiName({ id: str(r.bild_id), pfad: str(r.bild_pfad) }) : '',
      published: bool(r.veroeffentlicht),
    }))
    .sort((p, q) => p.name.localeCompare(q.name, 'de'));
}

const gibtEs = (storage: Storage, id: string) => !!one(storage.sqlite.db, 'SELECT 1 FROM artikel WHERE id = ?', id);

/** Verknüpft zwei Druckteile (doppelt anlegen schadet nicht). */
export function addAehnlich(storage: Storage, id: string, andere: string, user: User) {
  if (!gibtEs(storage, id)) throw notFound('Druckteil nicht gefunden.');
  if (andere === id) throw badRequest('Ein Druckteil kann nicht mit sich selbst verknüpft werden.');
  if (!gibtEs(storage, andere)) throw badRequest('Das ähnliche Druckteil gibt es nicht (mehr).');
  run(storage.sqlite.db, 'INSERT OR IGNORE INTO artikel_aehnlich (a, b) VALUES (?, ?)', ...paar(id, andere));
  return listAehnliche(storage, id, user);
}

/** Hebt die Verknüpfung auf – auf beiden Seiten. */
export function removeAehnlich(storage: Storage, id: string, andere: string, user: User) {
  if (!gibtEs(storage, id)) throw notFound('Druckteil nicht gefunden.');
  run(storage.sqlite.db, 'DELETE FROM artikel_aehnlich WHERE a = ? AND b = ?', ...paar(id, andere));
  return listAehnliche(storage, id, user);
}
