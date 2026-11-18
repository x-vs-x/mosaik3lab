// Installationsprotokoll (install-manifest.json): jede Systemänderung der Einrichtung – daraus weiß die Deinstallation,
// was zu entfernen ist. Ort: Verwaltungsordner der Installation (managerDir: Windows = Programmordner, sonst <Datenordner>/manager).
import fs from 'node:fs';
import path from 'node:path';
import { INSTALL, writeJsonAtomic } from './config.mjs';

let manifestTarget = null; // während der Einrichtung: Verwaltungsordner des Ziels (auch für Einträge aus services.mjs)
/** Während der Einrichtung alle Einträge in den Verwaltungsordner des Ziels schreiben; null = wieder die Installation. */
export const setManifestTarget = (dir) => (manifestTarget = dir);
export const manifestFile = (managerDir = manifestTarget ?? INSTALL?.managerDir) => (managerDir ? path.join(managerDir, 'install-manifest.json') : null);
export function readManifest(managerDir) {
  try {
    return JSON.parse(fs.readFileSync(manifestFile(managerDir), 'utf8'));
  } catch {
    return null;
  }
}
/** Eintrag hinzufügen (add=true) oder entfernen. Ohne Installation (Arbeitskopie) wird nichts protokolliert. */
export function recordManifest(entry, add = true, managerDir) {
  const file = manifestFile(managerDir);
  if (!file) return;
  const m = readManifest(managerDir) ?? { createdAt: new Date().toISOString(), entries: [] };
  const key = (e) => `${e.type}:${e.path ?? e.name}`;
  m.entries = m.entries.filter((e) => key(e) !== key(entry));
  if (add) m.entries.push({ ...entry, at: new Date().toISOString() });
  writeJsonAtomic(file, m);
}
