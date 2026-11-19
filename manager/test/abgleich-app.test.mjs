// Bewusste Doppelungen zwischen Server-Manager (reines .mjs, muss vor der App laufen können) und App: Läuft eine Seite
// auseinander, schlägt dieser Test an. Nur lesend, keine Testdaten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const { TABLE } = await import('../lib/settingsdb.mjs');
const { DOMAIN_RE } = await import('../lib/admin.mjs');
const norm = (s) => s.replace(/--.*$/gm, '').replace(/\s+/g, ' ').replace(/\s*;\s*$/, '').trim();

test('Tabelle betrieb_einstellung: gleiche Definition wie Migration 006 der App', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'server', 'src', 'storage', 'sqlite', 'migrations', '006_betrieb_einstellung.sql'), 'utf8');
  const create = /CREATE TABLE IF NOT EXISTS betrieb_einstellung \([\s\S]*?\n\);/.exec(sql)?.[0];
  assert.ok(create, 'CREATE TABLE in der Migration gefunden');
  assert.equal(norm(TABLE), norm(create));
});

test('Migrationsdateien: der Manager zählt genau die Dateien, die die App einspielt (gleiches Muster wie server/src/kern/db.ts)', async () => {
  const { MIGRATION_NAME, releaseSchemaVersion } = await import('../lib/schema.mjs');
  const ts = fs.readFileSync(path.join(ROOT, 'server', 'src', 'kern', 'db.ts'), 'utf8');
  const m = /const MIGRATION_NAME = (\/.+\/);/.exec(ts);
  assert.ok(m, 'Muster in der App gefunden');
  assert.equal(String(MIGRATION_NAME), m[1]);
  // und am echten Ordner: höchste Nummer = Zahl der Dateien (lückenlos ab 001 prüft server/test/migration.test.ts)
  const dateien = fs.readdirSync(path.join(ROOT, 'server', 'src', 'storage', 'sqlite', 'migrations')).filter((f) => f.toLowerCase().endsWith('.sql'));
  assert.equal(releaseSchemaVersion(ROOT), dateien.length);
});

test('Schul-Domain: gleiche Regel wie emailDomainSchema in shared/src/einstellungen.ts', () => {
  const ts = fs.readFileSync(path.join(ROOT, 'shared', 'src', 'einstellungen.ts'), 'utf8');
  const m = /z\.string\(\)\.regex\((\/.+?\/)\s*,/.exec(ts);
  assert.ok(m, 'Regel in shared gefunden');
  assert.equal(String(DOMAIN_RE), m[1]);
});
