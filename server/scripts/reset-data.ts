// Setzt alle Daten auf die Beispieldaten zurück.
// Vorher wird automatisch eine Sicherung im Ordner backups/ angelegt (Datenbank, Ablage, JSON-Altdaten).
// In der Ablage werden nur die Ordner der festen Objekttypen entfernt.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataRoot, loadConfig, type AppConfig } from '../src/config';
import { OBJEKTTYPEN } from '../src/kern/objekttypen';
import { seedIfEmpty } from '../src/seed/seed';
import { createSqliteStorage } from '../src/storage';
import { LEGACY_FILES } from '../src/uebernahme/legacyJson';
import { backupDatabase } from './db-backup';

const config = loadConfig();

/**
 * Sicherung vor dem Zurücksetzen: Datenbank (konsistent per VACUUM INTO), Ablage und bisherige JSON-Daten nach
 * <Datenwurzel>/backups/storage-<Zeitstempel>/{mosaik3lab.db, ablage, data}. Regelmäßige Sicherungen macht der Server-Manager
 * (npm run backup → manager/cli.mjs backup run).
 */
async function createBackup(config: Pick<AppConfig, 'dbFile' | 'ablageDir' | 'dataDir'>): Promise<string | undefined> {
  if (!existsSync(config.dbFile) && !existsSync(config.dataDir)) return undefined;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = path.join(dataRoot(), 'backups', `storage-${stamp}`);
  await fs.mkdir(target, { recursive: true });
  if (existsSync(config.dbFile)) backupDatabase(config.dbFile, path.join(target, 'mosaik3lab.db'));
  if (existsSync(config.ablageDir)) await fs.cp(config.ablageDir, path.join(target, 'ablage'), { recursive: true });
  // Bisherige JSON-Dateien (Sicherung der Übernahme) – ohne Sperrdatei, Sitzungen und Zwischendateien.
  if (existsSync(config.dataDir)) {
    await fs.cp(config.dataDir, path.join(target, 'data'), {
      recursive: true,
      filter: (src) => !/(\.lock|\.tmp|sessions\.json(\.bak)?)$/.test(src),
    });
  }
  return target;
}

if (!process.argv.includes('--yes')) {
  console.log('Dies löscht ALLE Benutzer, Druckteile, Anfragen, Einstellungen und Dateien und legt die Beispieldaten neu an.');
  console.log('Der Server muss dafür beendet sein. Zum Bestätigen:  npm run seed:reset -- --yes');
  process.exit(1);
}

const backup = await createBackup(config);
if (backup) console.log(`Sicherung erstellt: ${backup}`);

for (const ext of ['', '-wal', '-shm']) await fs.rm(config.dbFile + ext, { force: true });
for (const typ of OBJEKTTYPEN) await fs.rm(path.join(config.ablageDir, typ), { recursive: true, force: true });
// Alte JSON-Dateien entfernen, sonst würden sie beim Start erneut übernommen (sie liegen in der Sicherung).
for (const f of LEGACY_FILES) {
  for (const suffix of ['', '.bak']) await fs.rm(path.join(config.dataDir, f + suffix), { force: true });
}

const storage = await createSqliteStorage(config);
await seedIfEmpty(storage);
await storage.close();
console.log('Fertig. Beispieldaten wurden neu angelegt.');
