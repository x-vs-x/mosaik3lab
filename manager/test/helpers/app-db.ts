// Hilfsskript für die Manager-Tests: legt eine Datenbank der App an (alle Migrationen) und schreibt Beispieldaten:
// fachliche Einstellungen (Domains, Status-Schalter), ein Benutzerkonto samt Rechten, eine Datei-Zeile (Bild in der Ablage).
//   node --import tsx manager/test/helpers/app-db.ts <pfad/mosaik3lab.db>   (Arbeitsordner: server/)
import crypto from 'node:crypto';
import { openDb, migrate } from '../../../server/src/kern/db';

const db = openDb(process.argv[2]);
migrate(db, { log: () => {} });
const now = '2026-01-01T00:00:00.000Z';
const put = db.prepare('INSERT OR REPLACE INTO einstellung (id, schluessel, wert, geaendert_am) VALUES (?, ?, ?, ?)');
put.run('t1', 'features', JSON.stringify({ requesterTracking: true, videos: false }), now);
put.run('t2', 'orderForm', JSON.stringify({ allowedDomains: ['schule.example', 'mosaik.example'] }), now);
put.run('t3', 'statusAliases', JSON.stringify({ fertig: 'gedruckt' }), now);
db.prepare(
  "INSERT OR REPLACE INTO benutzer (id, benutzername, email, anzeigename, rolle, passwort_hash, aktiv, ist_demo, erstellt_am, geaendert_am) VALUES (?, ?, ?, ?, 'druckteam', ?, 1, 0, ?, ?)",
).run('u1', 'druck', 'druck@schule.example', 'Druck-Team', `scrypt$s$${crypto.createHash('sha256').update('x').digest('hex')}`, now, now);
db.prepare('INSERT OR REPLACE INTO benutzer_bereich (benutzer_id, bereich) VALUES (?, ?)').run('u1', 'team-druckteile');
const sha = crypto.createHash('sha256').update('BILDINHALT').digest('hex');
db.prepare(
  "INSERT OR REPLACE INTO datei (id, objekttyp, objekt_id, rolle, originalname, mime, groesse, sha256, pfad, sortierung, erstellt_am) VALUES ('d1', 'artikel', 'x', 'bild', 'f.jpg', 'image/jpeg', 10, ?, 'artikel/x/bild/f.jpg', 0, ?)",
).run(sha, now);
db.close();
