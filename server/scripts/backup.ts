// Sichert Datenbank (konsistent per VACUUM INTO), Dateiablage und bisherige JSON-Daten nach
// <Datenwurzel>\backups\storage-<Zeitstempel>\{mosaik3lab.db, ablage, data} (Standard C:\Mosaik3LAB\backups).
// Im Dauerbetrieb übernimmt das der Server-Manager.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataRoot, loadConfig, type AppConfig } from '../src/config';
import { backupDatabase } from './db-backup';

export async function createBackup(config: Pick<AppConfig, 'dbFile' | 'ablageDir' | 'dataDir'>): Promise<string | undefined> {
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = await createBackup(loadConfig());
  console.log(target ? `Sicherung erstellt: ${target}` : 'Keine Daten vorhanden – nichts zu sichern.');
}
