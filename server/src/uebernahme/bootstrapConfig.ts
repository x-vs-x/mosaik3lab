import fs from 'node:fs';
import path from 'node:path';

/**
 * Früher in der Verwaltung einstellbare Ablagepfade (mosaik3lab.config.json in der Projektwurzel).
 * Pfade stellt heute nur der Server-Manager ein (STORAGE_DIR, ABLAGE_DIR); die Datei wird nur noch gelesen,
 * damit die einmalige Übernahme alte Daten und Uploads an ihrem bisherigen Ort findet.
 */
export interface PathConfig {
  dataDir?: string;
  imagesDir?: string;
  modelsDir?: string;
  videosDir?: string;
}

export function configFilePath(rootDir: string) {
  return path.join(rootDir, 'mosaik3lab.config.json');
}

export function readPathConfig(rootDir: string): PathConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(configFilePath(rootDir), 'utf8')) as PathConfig;
    const clean = (p?: unknown) => (typeof p === 'string' && p.trim() ? p.trim() : undefined);
    return { dataDir: clean(raw.dataDir), imagesDir: clean(raw.imagesDir), modelsDir: clean(raw.modelsDir), videosDir: clean(raw.videosDir) };
  } catch {
    return {};
  }
}

/**
 * Nach der Übernahme in Datenbank und Ablage werden die alten Pfade nicht mehr gebraucht: Datei sichern
 * (mosaik3lab.config.json.vor-ablage-umzug-<zeit>.bak) und entfernen. Pfade stellt nur noch der Server-Manager ein.
 */
export function retirePathConfig(rootDir: string): string | undefined {
  const file = configFilePath(rootDir);
  if (!fs.existsSync(file)) return undefined;
  // Zeitstempel hier selbst (stamp() aus kern/db ginge nicht: config.ts lädt diese Datei, kern/db wiederum config.ts).
  const backup = `${file}.vor-ablage-umzug-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
  fs.copyFileSync(file, backup);
  fs.rmSync(file);
  console.log(`[Übernahme] Frühere Ablagepfade aus ${file} entfernt (Pfade stellt jetzt der Server-Manager ein). Sicherung: ${backup}`);
  return backup;
}
