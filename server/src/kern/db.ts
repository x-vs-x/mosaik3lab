import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT_DIR } from '../config';
import { newId } from '../domain/ids';
import { nummerText, NUMMERNKREISE, type NummerTyp } from '../domain/objekttypen';

// SQLite über das in Node eingebaute Modul node:sqlite (keine nativen npm-Module, läuft auf Windows/Linux/Raspberry Pi).
// Migrationen: server/src/storage/sqlite/migrations/NNN_name.sql (fester Ort, der Server-Manager liest sie dort),
// Stand in Tabelle schema_version. Pfad über ROOT_DIR – gleich aus src/ (tsx) und aus dem Bündel dist/ (Installer-Paket).

export type Db = DatabaseSync;
export type Row = Record<string, unknown>;

export const MIGRATIONS_DIR = path.join(ROOT_DIR, 'server', 'src', 'storage', 'sqlite', 'migrations');
const MIGRATION_NAME = /^(\d{3})_[a-z0-9_]+\.sql$/;

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export function listMigrations(dir = MIGRATIONS_DIR): Migration[] {
  return fs
    .readdirSync(dir)
    .filter((f) => MIGRATION_NAME.test(f))
    .sort()
    .map((f) => ({ version: Number(f.slice(0, 3)), name: f.replace(/\.sql$/, ''), sql: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

/** Öffnet (bzw. legt an) die Datenbank mit Fremdschlüsseln, WAL und Wartezeit bei Sperren. */
export function openDb(file: string, opts: { readOnly?: boolean } = {}): Db {
  if (!opts.readOnly) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file, { readOnly: !!opts.readOnly });
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  if (!opts.readOnly) {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
  }
  return db;
}

export function schemaVersion(db: Db): number {
  const has = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'").get();
  if (!has) return 0;
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
  return row.v ?? 0;
}

/** Führt fn in einer Transaktion aus (verschachtelt über Savepoints). Wirft fn, wird alles zurückgerollt. */
export function transaction<T>(db: Db, fn: () => T): T {
  const nested = db.isTransaction;
  const sp = `sp_${Math.random().toString(36).slice(2, 10)}`;
  db.exec(nested ? `SAVEPOINT ${sp}` : 'BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec(nested ? `RELEASE ${sp}` : 'COMMIT');
    return result;
  } catch (err) {
    db.exec(nested ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK');
    throw err;
  }
}

/** Konsistente Kopie der Datenbank (auch im laufenden Betrieb) per VACUUM INTO. Ziel darf nicht existieren. */
export function backupInto(db: Db, target: string): void {
  if (fs.existsSync(target)) throw new Error(`Die Zieldatei ${target} existiert bereits.`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  db.prepare('VACUUM INTO ?').run(target);
}

export const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-').slice(0, 19);

/**
 * Spielt ausstehende Migrationen ein – jede in einer eigenen Transaktion. Ist die Datenbank nicht neu,
 * wird vorher automatisch eine Sicherung angelegt (<sicherungsordner>/mosaik3lab-vor-schema-NNN-<zeit>.db).
 */
export function migrate(
  db: Db,
  opts: { backupDir?: string; migrations?: Migration[]; log?: (msg: string) => void } = {},
): { from: number; to: number; backup?: string } {
  const log = opts.log ?? ((m: string) => console.log(m));
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, eingespielt_am TEXT NOT NULL)',
  );
  const from = schemaVersion(db);
  const all = opts.migrations ?? listMigrations();
  const known = all.reduce((max, m) => Math.max(max, m.version), 0);
  // Datenbank aus einer neueren Version (z. B. zurückgespielte Sicherung): nicht starten statt mit unbekannten Tabellen zu laufen
  if (from > known) {
    throw new Error(
      `Die Datenbank stammt aus einer neueren Version von Mosaik³LAB (Datenbank-Stand ${from}, dieses Programm kennt ${known}). Bitte die neuere Version installieren oder eine passende Sicherung wiederherstellen.`,
    );
  }
  const pending = all.filter((m) => m.version > from);
  if (pending.length === 0) return { from, to: from };

  let backup: string | undefined;
  if (from > 0 && opts.backupDir) {
    backup = path.join(opts.backupDir, `mosaik3lab-vor-schema-${String(pending[0].version).padStart(3, '0')}-${stamp()}.db`);
    backupInto(db, backup);
    log(`[Datenbank] Sicherung vor der Migration: ${backup}`);
  }
  for (const m of pending) {
    transaction(db, () => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_version (version, name, eingespielt_am) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        new Date().toISOString(),
      );
    });
    log(`[Datenbank] Migration ${m.name} eingespielt.`);
  }
  return { from, to: pending[pending.length - 1].version, backup };
}

/** Zustand für /api/health und den Server-Manager. */
export function dbInfo(db: Db | undefined, file: string) {
  const vorhanden = fs.existsSync(file);
  let groesseBytes = 0;
  for (const ext of ['', '-wal']) {
    try {
      groesseBytes += fs.statSync(file + ext).size;
    } catch {
      /* fehlt */
    }
  }
  return { vorhanden, schemaVersion: db && db.isOpen ? schemaVersion(db) : null, groesseBytes };
}

export const bool = (v: unknown) => v === 1 || v === 1n || v === true;
export const json = <T>(v: unknown, fallback: T): T => {
  try {
    return typeof v === 'string' ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
export const str = (v: unknown) => (v == null ? '' : String(v));

// --- Kurzformen für die Repositories ------------------------------------------------------------------

export const all = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).all(...(p as never[])) as Row[];
export const one = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).get(...(p as never[])) as Row | undefined;
export const run = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).run(...(p as never[]));
export const b = (v: boolean) => (v ? 1 : 0);
/** Zählung per SQL: die Abfrage liefert eine Spalte `n`. */
export const count = (db: Db, sql: string, ...p: unknown[]) => Number(one(db, sql, ...p)?.n ?? 0);
/** Platzhalter für `IN (...)`: '?, ?, ?' */
export const marks = (n: number) => Array.from({ length: n }, () => '?').join(', ');

/**
 * Gleicht die Kindzeilen eines Datensatzes ab: vorhandene Zeilen (erkannt am Schlüssel) behalten ihre ID,
 * neue erhalten eine, nicht mehr enthaltene werden gelöscht. Gibt Schlüssel → ID zurück.
 */
export function syncRows(db: Db, table: string, parentCol: string, parentId: string, keyCol: string, rows: Record<string, unknown>[]) {
  const existing = new Map(all(db, `SELECT id, ${keyCol} AS k FROM ${table} WHERE ${parentCol} = ?`, parentId).map((r) => [str(r.k), str(r.id)]));
  const ids = new Map<string, string>();
  for (const row of rows) ids.set(String(row[keyCol]), existing.get(String(row[keyCol])) ?? newId());
  const keep = new Set(ids.values());
  for (const id of existing.values()) if (!keep.has(id)) run(db, `DELETE FROM ${table} WHERE id = ?`, id);
  for (const row of rows) {
    const cols = Object.keys(row);
    const id = ids.get(String(row[keyCol]))!;
    run(
      db,
      `INSERT INTO ${table} (id, ${parentCol}, ${cols.join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})
       ON CONFLICT (id) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}`,
      id,
      parentId,
      ...cols.map((c) => row[c]),
    );
  }
  return ids;
}

/** Nächste lesbare Nummer (Tabelle nummernkreis); überspringt Nummern, die es schon gibt. */
export function nextNumber(db: Db, typ: NummerTyp, at: Date, exists: (nummer: string) => boolean): string {
  const jahr = NUMMERNKREISE[typ].jaehrlich ? at.getFullYear() : 0;
  return transaction(db, () => {
    const row = one(db, 'SELECT id, letzte_nummer FROM nummernkreis WHERE objekttyp = ? AND jahr = ?', typ, jahr);
    let n = Number(row?.letzte_nummer ?? 0);
    let nummer: string;
    do nummer = nummerText(typ, ++n, jahr);
    while (exists(nummer));
    if (row) run(db, 'UPDATE nummernkreis SET letzte_nummer = ? WHERE id = ?', n, row.id);
    else run(db, 'INSERT INTO nummernkreis (id, objekttyp, jahr, letzte_nummer) VALUES (?, ?, ?, ?)', newId(), typ, jahr, n);
    return nummer;
  });
}
