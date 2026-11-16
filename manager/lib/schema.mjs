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

/** Höchste Migrationsnummer, die eine Programmversion mitbringt (server/src/storage/sqlite/migrations/NNN_*.sql); null = unbekannt. */
export function releaseSchemaVersion(dir) {
  try {
    const nums = fs.readdirSync(path.join(dir, 'server', 'src', 'storage', 'sqlite', 'migrations')).map((f) => /^(\d{3})_.*\.sql$/.exec(f)?.[1]).filter(Boolean).map(Number);
    return nums.length ? Math.max(...nums) : null;
  } catch {
    return null;
  }
}
