// „Datenbestand übertragen“: Datenbank + Dateien eines Datenordners konsistent in einen anderen Datenordner kopieren.
// Gemeinsam benutzt von „Datenordner ändern“ (Einstellungen) und „Einrichten mit vorhandenen Daten“.
//  - Datenbank NICHT per Dateikopie, sondern über das App-Skript db:backup (VACUUM INTO, auch bei laufender App)
//  - frühere JSON-Daten (data/, uploads/, config/) werden mitkopiert (ohne Sperrdatei und Sitzungen)
//  - danach Vergleich: Zeilen je Tabelle und Dateianzahl müssen übereinstimmen, sonst Fehler (Quelle bleibt unberührt)
// Die Ablage (Bilder, Druckdateien) wird getrennt behandelt – sie hat einen eigenen Ordner (siehe saveSettings/Einrichten).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { InputError, countFiles } from './config.mjs';
import { backupDatabase } from './backup.mjs';
import { DB_NAME } from './settingsdb.mjs';

const DB = DB_NAME;
const PARTS = ['data', 'uploads', 'config'];
const SKIP = /(\.lock|sessions\.json(\.bak)?)$/;

/** Zeilen je Tabelle (nur lesend); ohne Datenbank → null. */
export function countRows(dbFile) {
  if (!fs.existsSync(dbFile)) return null;
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    const out = {};
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
      out[name] = Number(db.prepare(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`).get().n);
    }
    return out;
  } finally {
    db.close();
  }
}

export const hasData = (dir) => fs.existsSync(path.join(dir, DB)) || PARTS.some((p) => fs.existsSync(path.join(dir, p)));

/**
 * from/to: Datenordner. programDir: Programmordner mit server/ (für das Skript db:backup).
 * Das Ziel darf noch keine Datenbank haben (nichts wird überschrieben). → { tables, rows, files }
 */
export async function transferData({ from, to, programDir }) {
  if (!hasData(from)) throw new InputError(`Im Datenordner ${from} liegen keine Daten zum Übertragen.`);
  if (path.resolve(from) === path.resolve(to)) throw new InputError('Quelle und Ziel sind derselbe Ordner.');
  if (fs.existsSync(path.join(to, DB))) throw new InputError(`Im Zielordner ${to} gibt es schon eine Datenbank – es wird nichts überschrieben.`, 'Einen leeren Ordner wählen.');
  fs.mkdirSync(to, { recursive: true });
  try {
    if (fs.existsSync(path.join(from, DB))) await backupDatabase(path.join(from, DB), path.join(to, DB), programDir);
    for (const part of PARTS) {
      if (fs.existsSync(path.join(from, part))) fs.cpSync(path.join(from, part), path.join(to, part), { recursive: true, filter: (s) => !SKIP.test(s) });
    }
    // Vergleich der Anzahlen
    const a = countRows(path.join(from, DB));
    const b = countRows(path.join(to, DB));
    if (a) {
      const diff = Object.keys(a).filter((t) => a[t] !== b?.[t]);
      if (diff.length) throw new Error(`Datenbank unvollständig übertragen (Tabelle ${diff[0]}: ${a[diff[0]]} → ${b?.[diff[0]] ?? 'fehlt'}).`);
    }
    let files = 0;
    for (const part of PARTS) {
      const want = fs.existsSync(path.join(from, part)) ? countFiles(path.join(from, part)) - lockFiles(path.join(from, part)) : 0;
      const got = fs.existsSync(path.join(to, part)) ? countFiles(path.join(to, part)) : 0;
      if (want !== got) throw new Error(`Dateien in „${part}“ unvollständig übertragen (${want} → ${got}).`);
      files += got;
    }
    return { tables: a ? Object.keys(a).length : 0, rows: a ? Object.values(a).reduce((s, n) => s + n, 0) : 0, files };
  } catch (err) {
    // halb fertiges Ziel nicht liegen lassen (die Quelle wurde nie verändert)
    for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(path.join(to, f), { force: true });
    for (const part of PARTS) fs.rmSync(path.join(to, part), { recursive: true, force: true });
    throw err;
  }
}

/** Dateien, die bewusst nicht mitkopiert werden (zählen beim Vergleich nicht mit; Punkt-Dateien zählt countFiles ohnehin nicht). */
function lockFiles(dir) {
  try {
    return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith('.') && SKIP.test(e.name)).length;
  } catch {
    return 0;
  }
}
