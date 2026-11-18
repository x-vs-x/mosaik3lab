// Test-Einrichtung wie nach „cli setup“: Startdatei { dataDir, managerPort } und Einstellungen in der Datenbank des
// Datenordners (Tabelle betrieb_einstellung). Vor dem Import von lib/config.mjs aufrufen (MANAGER_CONFIG = startFile).
import fs from 'node:fs';
import path from 'node:path';
import { dbFileOf, writeBereich } from '../../lib/settingsdb.mjs';

/** cfg: { manager?: { port }, app?, paths: { dataDir, … }, backup?, portal? } – nur die angegebenen Werte, sonst Standard. */
export function einrichten(startFile, { manager, ...rest }) {
  const dataDir = rest.paths.dataDir;
  const betrieb = {};
  for (const [section, values] of Object.entries(rest)) {
    for (const [key, value] of Object.entries(values)) if (`${section}.${key}` !== 'paths.dataDir') betrieb[`${section}.${key}`] = value;
  }
  writeBereich(dbFileOf(dataDir), 'betrieb', betrieb);
  if (manager?.port) writeBereich(dbFileOf(dataDir), 'manager', { 'manager.port': manager.port });
  fs.mkdirSync(path.dirname(startFile), { recursive: true });
  fs.writeFileSync(startFile, JSON.stringify({ dataDir, managerPort: manager?.port ?? 5190 }));
}
