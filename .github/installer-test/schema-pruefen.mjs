// Hilfsprüfung für den Installer-Test (nur auf dem GitHub-Runner): Datenbank-Schema der Installation = Schema der aktiven
// Version und keine Tabelle aus dem absichtlich kaputten Testpaket (ci_kaputt) – d. h. der Rückfall hat die Datenbank zurückgespielt.
//   node schema-pruefen.mjs <Programmordner>/current <Datenbankdatei>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const [current, dbFile] = process.argv.slice(2);
const { dbSchemaVersion, releaseSchemaVersion } = await import(pathToFileURL(path.join(current, 'manager', 'lib', 'schema.mjs')).href);
const db = await dbSchemaVersion(dbFile);
const rel = releaseSchemaVersion(current);
const d = new DatabaseSync(dbFile, { readOnly: true });
const kaputt = !!d.prepare("SELECT 1 FROM sqlite_master WHERE name = 'ci_kaputt'").get();
d.close();
console.log(`Datenbank-Schema ${db}, aktive Version ${rel}, Tabelle aus dem kaputten Paket: ${kaputt ? 'ja' : 'nein'}`);
process.exit(db === rel && !kaputt ? 0 : 1);
