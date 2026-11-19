// Betriebs-, Mail- und Manager-Einstellungen direkt in der SQLite-Datenbank der App (eingebautes node:sqlite).
// Tabelle betrieb_einstellung (Migration 006 der App; der Manager legt sie bei Bedarf selbst an, falls die App noch
// nie lief). Kurze Transaktionen, WAL und Wartezeit bei Sperren, damit App und Manager gleichzeitig zugreifen können.
// Bereiche: 'betrieb' (Ports, Netzfreigabe, Pfade, Backup-Zeitplan, Portal und Zertifikat, Session-Geheimnis),
//           'mail' (SMTP, Empfänger), 'manager' (Manager-Port, Passwort-Hash).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DB_NAME = 'mosaik3lab.db';
export const BEREICHE = ['betrieb', 'mail', 'manager'];
// Gleich wie server/src/storage/sqlite/migrations/006_betrieb_einstellung.sql (Test: abgleich-app.test.mjs)
export const TABLE = `CREATE TABLE IF NOT EXISTS betrieb_einstellung (
  bereich       TEXT NOT NULL CHECK (bereich IN ('betrieb', 'mail', 'manager')),
  schluessel    TEXT NOT NULL,
  wert          TEXT NOT NULL,
  geheim        INTEGER NOT NULL DEFAULT 0,
  geaendert_am  TEXT NOT NULL,
  PRIMARY KEY (bereich, schluessel)
)`;

export const dbFileOf = (dataDir) => path.join(dataDir, DB_NAME);

function open(file, { write = false } = {}) {
  if (write) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file, { readOnly: !write });
  db.exec('PRAGMA busy_timeout = 5000');
  if (write) {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec(TABLE);
  }
  return db;
}

/** Alle Einstellungen { betrieb: {…}, mail: {…}, manager: {…} }; null, wenn es die Datenbank noch nicht gibt. */
export function readAll(file) {
  if (!fs.existsSync(file)) return null;
  const out = { betrieb: {}, mail: {}, manager: {} };
  const db = open(file);
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'betrieb_einstellung'").get()) return out;
    for (const r of db.prepare('SELECT bereich, schluessel, wert FROM betrieb_einstellung').all()) {
      try {
        out[r.bereich][r.schluessel] = JSON.parse(r.wert);
      } catch {
        /* unlesbarer Wert → wie nicht vorhanden */
      }
    }
    return out;
  } finally {
    db.close();
  }
}

export const readBereich = (file, bereich) => readAll(file)?.[bereich] ?? {};

/**
 * Werte eines Bereichs schreiben (eine kurze Transaktion). entries: { schluessel: wert }; secrets: Schlüssel, die als
 * geheim markiert werden. Wert undefined löscht den Schlüssel. replace: alle anderen Schlüssel des Bereichs entfernen.
 */
export function writeBereich(file, bereich, entries, { secrets = [], replace = false } = {}) {
  if (!BEREICHE.includes(bereich)) throw new Error(`Unbekannter Bereich: ${bereich}`);
  const db = open(file, { write: true });
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (replace) db.prepare('DELETE FROM betrieb_einstellung WHERE bereich = ?').run(bereich);
      const up = db.prepare(`INSERT INTO betrieb_einstellung (bereich, schluessel, wert, geheim, geaendert_am) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (bereich, schluessel) DO UPDATE SET wert = excluded.wert, geheim = excluded.geheim, geaendert_am = excluded.geaendert_am`);
      const del = db.prepare('DELETE FROM betrieb_einstellung WHERE bereich = ? AND schluessel = ?');
      const now = new Date().toISOString();
      for (const [k, v] of Object.entries(entries)) {
        if (v === undefined) del.run(bereich, k);
        else up.run(bereich, k, JSON.stringify(v), secrets.includes(k) ? 1 : 0, now);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } finally {
    db.close();
  }
}

/** Nur anlegen, wenn es den Schlüssel noch nicht gibt; true = angelegt. */
export function writeIfNew(file, bereich, schluessel, wert, geheim = false) {
  const db = open(file, { write: true });
  try {
    const r = db.prepare('INSERT OR IGNORE INTO betrieb_einstellung (bereich, schluessel, wert, geheim, geaendert_am) VALUES (?, ?, ?, ?, ?)').run(bereich, schluessel, JSON.stringify(wert), geheim ? 1 : 0, new Date().toISOString());
    return Number(r.changes) > 0;
  } finally {
    db.close();
  }
}

/** Änderungskennung für den Zwischenspeicher: Datenbank + WAL. */
export function stamp(file) {
  return [file, `${file}-wal`].map((f) => {
    try {
      const s = fs.statSync(f);
      return `${s.mtimeMs}:${s.size}`;
    } catch {
      return '-';
    }
  }).join('|');
}
