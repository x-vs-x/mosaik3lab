// Konsistente Sicherung der Datenbank – auch während die App läuft (SQLite VACUUM INTO, keine Dateikopie).
// Für den Server-Manager:  npm run --silent db:backup -w server -- --ziel <datei> [--quelle <db-datei>]
// Ausgabe: genau eine Zeile („OK …“ bzw. „FEHLER: …“), Exit-Code 0 bzw. 1.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/config';
import { openDb, schemaVersion } from '../src/kern/db';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

export function backupDatabase(source: string, target: string): { bytes: number; schemaVersion: number } {
  if (!fs.existsSync(source)) throw new Error(`Datenbank nicht gefunden: ${source}`);
  if (fs.existsSync(target)) throw new Error(`Zieldatei existiert bereits: ${target}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const db = openDb(source, { readOnly: true });
  try {
    db.prepare('VACUUM INTO ?').run(target);
  } finally {
    db.close();
  }
  // Kopie prüfen: öffnet sie sich, ist sie intakt?
  const copy = openDb(target, { readOnly: true });
  try {
    const check = copy.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    if (check.integrity_check !== 'ok') throw new Error(`Kopie beschädigt: ${check.integrity_check}`);
    return { bytes: fs.statSync(target).size, schemaVersion: schemaVersion(copy) };
  } finally {
    copy.close();
  }
}

if (process.argv[1] && path.basename(process.argv[1]).startsWith('db-backup')) {
  try {
    const ziel = arg('--ziel');
    if (!ziel) throw new Error('Bitte --ziel <datei> angeben.');
    const quelle = path.resolve(arg('--quelle') ?? loadConfig().dbFile);
    const r = backupDatabase(quelle, path.resolve(ziel));
    console.log(`OK ${path.resolve(ziel)} (${r.bytes} Bytes, Schema ${r.schemaVersion})`);
    process.exit(0);
  } catch (err) {
    console.log(`FEHLER: ${(err as Error).message}`);
    process.exit(1);
  }
}
