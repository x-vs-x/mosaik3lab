// Die Ersteinrichtung ist nur offen, solange es nachweislich keinen aktiven Administrator gibt (lib/auth.mjs needsAdmin):
// keine Datenbank / keine Tabelle „benutzer“ / kein aktiver Admin → offen; Admin vorhanden oder Datenbank nicht lesbar → zu.
// Testdaten unter C:\Entwicklung\_testdaten\server-manager\ (werden gelöscht).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const TESTROOT = path.resolve(import.meta.dirname, '..', '..', '..', '_testdaten', 'server-manager');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'sperre-')));
const DB = path.join(tmp, 'storage', 'mosaik3lab.db');
fs.mkdirSync(path.dirname(DB), { recursive: true });
fs.writeFileSync(path.join(tmp, 'mosaik3lab.json'), JSON.stringify({ dataDir: path.dirname(DB), managerPort: 5199 }));
process.env.MANAGER_CONFIG = path.join(tmp, 'mosaik3lab.json');
process.env.MOSAIK3LAB_QUIET = '1';
process.env.DISABLE_DEMO_ACCOUNTS = 'true';
const { needsAdmin } = await import('../lib/auth.mjs');

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const withDb = (sql) => {
  const db = new DatabaseSync(DB);
  db.exec(sql);
  db.close();
};

test('offen nur ohne aktiven Administrator, zu bei Admin oder unlesbarer Datenbank', async () => {
  assert.equal(await needsAdmin(), true, 'keine Datenbank');
  withDb('CREATE TABLE andere (x)');
  assert.equal(await needsAdmin(), true, 'keine Tabelle benutzer (App lief noch nie)');
  withDb('CREATE TABLE benutzer (id TEXT, email TEXT, passwort_hash TEXT, rolle TEXT, aktiv INTEGER, ist_demo INTEGER)');
  assert.equal(await needsAdmin(), true, 'leere Tabelle');
  withDb("INSERT INTO benutzer VALUES ('1', 'team@schule.de', 'h', 'druckteam', 1, 0), ('2', 'alt@schule.de', 'h', 'admin', 0, 0), ('3', 'demo@schule.de', 'h', 'admin', 1, 1)");
  assert.equal(await needsAdmin(), true, 'nur Druck-Team, deaktivierter Admin und (abgeschaltetes) Demo-Konto');
  withDb("INSERT INTO benutzer VALUES ('4', 'chef@schule.de', 'h', 'admin', 1, 0)");
  assert.equal(await needsAdmin(), false, 'aktiver Administrator → zu');
  fs.rmSync(DB);
  fs.writeFileSync(DB, 'keine Datenbank, sondern Müll '.repeat(200));
  assert.equal(await needsAdmin(), false, 'beschädigte Datenbank → zu (nie versehentlich offen)');
});
