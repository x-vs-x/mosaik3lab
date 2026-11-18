// Setzt alle Daten auf die Beispieldaten zurück.
// Vorher wird automatisch eine Sicherung im Ordner backups/ angelegt (Datenbank, Ablage, JSON-Altdaten).
// In der Ablage werden nur die Ordner der festen Objekttypen entfernt.
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../src/config';
import { OBJEKTTYPEN } from '../src/kern/objekttypen';
import { seedIfEmpty } from '../src/seed/seed';
import { createSqliteStorage } from '../src/storage';
import { LEGACY_FILES } from '../src/uebernahme/legacyJson';
import { createBackup } from './backup';

const config = loadConfig();

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
