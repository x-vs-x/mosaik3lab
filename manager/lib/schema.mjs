// Datenbank-Schema-Version lesen – ohne die App: aus der Datenbankdatei (nur lesend) und aus den Migrationen einer Version.
// Grundlage für den Schutz beim Update: neue Version mit neuerem Schema + Fehlschlag → Datenbank aus der Sicherung zurück;
// Version mit älterem Schema als die Datenbank → Downgrade verweigern.
import fs from 'node:fs';
import path from 'node:path';

/** Schema-Version der Datenbankdatei: null = keine Datenbank, 0 = ohne Schema, sonst höchste eingespielte Version. */
export async function dbSchemaVersion(file) {
  if (!fs.existsSync(file)) return null;
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    const has = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'").get();
    if (!has) return 0;
    return db.prepare('SELECT MAX(version) AS v FROM schema_version').get().v ?? 0;
  } finally {
    db.close();
  }
}

/**
 * Dateiname einer Migration – gleich wie MIGRATION_NAME in server/src/kern/db.ts (Test: abgleich-app.test.mjs). Es zählt
 * nur, was die App auch einspielt: Mit dem früheren, lockereren Muster (NNN_*.sql) hätte der Manager z. B.
 * „024_Neue-Tabelle.sql“ mitgezählt, die App aber nie eingespielt – das Paket gälte dann als Schema 24, die Datenbank
 * bliebe auf 23, und der Schutz vor Downgrade und vor zu neuen Sicherungen rechnete mit einer falschen Zahl.
 */
export const MIGRATION_NAME = /^(\d{3})_[a-z0-9_]+\.sql$/;

/** Höchste Migrationsnummer, die eine Programmversion mitbringt (server/src/storage/sqlite/migrations/NNN_name.sql); null = unbekannt. */
export function releaseSchemaVersion(dir) {
  try {
    const nums = fs.readdirSync(path.join(dir, 'server', 'src', 'storage', 'sqlite', 'migrations')).map((f) => MIGRATION_NAME.exec(f)?.[1]).filter(Boolean).map(Number);
    return nums.length ? Math.max(...nums) : null;
  } catch {
    return null;
  }
}
