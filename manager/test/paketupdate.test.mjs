// Tests für das Update per Installer-Paket (lib/paketupdate.mjs): Downgrade verweigert, Rückfall ohne und mit
// Schema-Änderung (Datenbank aus einer echten Sicherung zurückgespielt). Keine Dienste – Start/Stopp/Health sind ersetzt.
// Testdaten liegen unter C:\Entwicklung\_testdaten\manager-paketupdate (nicht im Temp-Verzeichnis).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const TESTROOT = path.resolve(import.meta.dirname, '..', '..', '..', '_testdaten', 'manager-paketupdate');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'run-')));
const storage = path.join(tmp, 'storage');
const backups = path.join(tmp, 'backups');
process.env.MANAGER_CONFIG = path.join(tmp, 'manager.config.json');
process.env.MOSAIK3LAB_QUIET = '1';
fs.writeFileSync(process.env.MANAGER_CONFIG, JSON.stringify({ paths: { dataDir: storage, ablageDir: path.join(tmp, 'ablage'), backupDir: backups, logDir: path.join(tmp, 'logs') }, backup: { keep: 10, encrypt: false } }));

const pu = await import('../lib/paketupdate.mjs');
const upd = await import('../lib/releases.mjs');
const schema = await import('../lib/schema.mjs');
const { createBackup } = await import('../lib/backup.mjs');
const { removeTree } = await import('../lib/setup.mjs');

after(() => removeTree(tmp));

const dbFile = path.join(storage, 'mosaik3lab.db');
const sql = (q, write = false) => {
  const db = new DatabaseSync(dbFile, { readOnly: !write });
  try {
    return write ? db.exec(q) : db.prepare(q).all();
  } finally {
    db.close();
  }
};
/** Programmversion mit Migrationen 001 … n (nur die Dateien, die der Manager liest). */
function release(root, id, n) {
  const dir = path.join(root, 'releases', id, 'server', 'src', 'storage', 'sqlite', 'migrations');
  fs.mkdirSync(dir, { recursive: true });
  for (let v = 1; v <= n; v++) fs.writeFileSync(path.join(dir, `${String(v).padStart(3, '0')}_x.sql`), '-- test');
  return path.join(root, 'releases', id);
}
/** Ersatz für Dienste: zählt Aufrufe, Health wählbar. */
const fakeOps = (healthy, restoreDb) => {
  const calls = [];
  return { calls, stop: async () => calls.push('stop'), start: async () => calls.push('start'), healthy: async () => (calls.push('health'), healthy), restoreDb: restoreDb ?? (async () => calls.push('restore')) };
};

fs.mkdirSync(storage, { recursive: true });
sql("CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT, eingespielt_am TEXT); INSERT INTO schema_version (version) VALUES (1), (2); CREATE TABLE person (name TEXT); INSERT INTO person VALUES ('Ada'), ('Bob');", true);

test('Downgrade: älteres Paket wird vor jeder Änderung abgelehnt, gleiches und neueres erlaubt', async () => {
  const root = path.join(tmp, 'dg');
  await assert.rejects(() => pu.refuseDowngrade(dbFile, release(root, 'alt', 1), '0.9.0-alt'), (err) => {
    assert.match(err.message, /Downgrade verweigert.*0\.9\.0-alt.*Schema 1.*Schema 2.*nichts verändert/);
    assert.ok(err.hint);
    return true;
  });
  assert.equal(await pu.refuseDowngrade(dbFile, release(root, 'gleich', 2), 'gleich'), 2, 'gleiche Version = Reparatur, erlaubt');
  assert.equal(await pu.refuseDowngrade(dbFile, release(root, 'neu', 3), 'neu'), 2);
  assert.equal(await pu.refuseDowngrade(path.join(tmp, 'keine.db'), release(root, 'alt2', 1), 'x'), null, 'ohne Datenbank: Neueinrichtung');
});

test('Rückfall bei fehlender Health: vorige Version aktiv, kaputte entfernt, Datenbank bleibt (Schema gleich)', async () => {
  const root = path.join(tmp, 'rb1');
  release(root, 'v1', 2);
  release(root, 'v2', 2);
  upd.switchCurrent(root, 'v1');
  upd.switchCurrent(root, 'v2');
  const ops = fakeOps(true);
  const r = await pu.rollBack({ programRoot: root, previous: 'v1', failed: 'v2', backupId: 'mosaik3lab-x', schemaBefore: 2, dbFile }, ops);
  assert.equal(upd.currentRelease(root).id, 'v1');
  assert.ok(!fs.existsSync(path.join(root, 'releases', 'v2')), 'kaputte Version ist nicht mehr auswählbar');
  assert.deepEqual(ops.calls, ['stop', 'start', 'health'], 'ohne Schema-Änderung keine Wiederherstellung');
  assert.equal(r.healthy, true);
  assert.match(r.data, /Daten unverändert/);
  assert.equal(upd.previousRelease(root), null);
  // auch die vorige Version antwortet nicht → gemeldet, nicht verschwiegen
  release(root, 'v3', 2);
  upd.switchCurrent(root, 'v3');
  assert.equal((await pu.rollBack({ programRoot: root, previous: 'v1', failed: 'v3', backupId: null, schemaBefore: 2, dbFile }, fakeOps(false))).healthy, false);
});

test('Rückfall mit Schema-Änderung: Datenbank aus der Sicherung von vor dem Update zurückgespielt', async () => {
  const root = path.join(tmp, 'rb2');
  release(root, 'v1', 2);
  release(root, 'v2', 3);
  upd.switchCurrent(root, 'v1');
  const before = sql('SELECT name FROM person ORDER BY name');
  const { id } = await createBackup('vor Update'); // echte Sicherung (wie „cli backup run“ der installierten Version)
  upd.switchCurrent(root, 'v2');
  sql("CREATE TABLE neu_3 (x); INSERT INTO schema_version (version) VALUES (3); DELETE FROM person WHERE name = 'Bob';", true); // neue Version migriert und schreibt, dann scheitert sie
  assert.equal(await schema.dbSchemaVersion(dbFile), 3);
  const ops = fakeOps(true, (bid) => pu.restoreDbFrom({ backupDir: backups, id: bid, keyFile: path.join(tmp, 'gibt-es-nicht.key'), dataDir: storage, ablageDir: path.join(tmp, 'ablage') }));
  const r = await pu.rollBack({ programRoot: root, previous: 'v1', failed: 'v2', backupId: id, schemaBefore: 2, dbFile }, ops);
  assert.equal(upd.currentRelease(root).id, 'v1');
  assert.equal(await schema.dbSchemaVersion(dbFile), 2, 'altes Schema zurück');
  assert.deepEqual(sql('SELECT name FROM person ORDER BY name'), before, 'Daten wie vor dem Update');
  assert.equal(sql("SELECT name FROM sqlite_master WHERE name = 'neu_3'").length, 0);
  assert.match(r.data, new RegExp(`Sicherung ${id}.*Schema 3 → 2`));

  // Schema geändert, aber keine Sicherung → Fehler (die IT bekommt eine klare Meldung statt einer stillen alten Version)
  release(root, 'v4', 3);
  upd.switchCurrent(root, 'v4');
  sql('INSERT INTO schema_version (version) VALUES (3);', true);
  await assert.rejects(() => pu.rollBack({ programRoot: root, previous: 'v1', failed: 'v4', backupId: null, schemaBefore: 2, dbFile }, fakeOps(true)), /keine Sicherung/);
});

test('Sicherung mit der installierten Version scheitert → klare Meldung, nichts umgestellt', async () => {
  const root = path.join(tmp, 'bk');
  release(root, 'v1', 2); // ohne manager/cli.mjs
  upd.switchCurrent(root, 'v1');
  await assert.rejects(() => pu.backupWithInstalled(root), /Sicherung vor dem Update fehlgeschlagen.*nichts umgestellt/);
});

test('Versionsvergleich (SemVer): älteres Paket abgelehnt, gleiche Version = Reparatur, neuere = Update', () => {
  assert.deepEqual(pu.parseVersion('1.2.3-dev.abc1234'), [1, 2, 3]);
  assert.equal(pu.parseVersion('kaputt'), null);
  assert.equal(pu.compareVersions('1.0.0', '0.1.0'), 1);
  assert.equal(pu.compareVersions('1.9.0', '1.10.0'), -1, 'zahlenweise, nicht als Text');
  assert.equal(pu.compareVersions('1.0.0-abc1234', '1.0.0-def5678'), 0, 'Commit-Zusatz zählt nicht');
  assert.equal(pu.compareVersions('1.0.0', null), null);
  // installiert → Paket
  assert.doesNotThrow(() => pu.refuseOlderVersion(null, '1.0.0'), 'Neuinstallation');
  assert.doesNotThrow(() => pu.refuseOlderVersion('0.1.0-e56b448', '1.0.0'), 'Update von alter Release-ID');
  assert.doesNotThrow(() => pu.refuseOlderVersion('1.0.0', '1.0.0'), 'gleiche Version');
  assert.doesNotThrow(() => pu.refuseOlderVersion('1.0.0', '1.0.1'));
  assert.throws(() => pu.refuseOlderVersion('1.2.0', '1.1.9'), /Älteres Paket abgelehnt: Installiert ist Version 1\.2\.0, dieses Paket ist Version 1\.1\.9/);
  assert.throws(() => pu.refuseOlderVersion('2.0.0', '1.10.0'), /abgelehnt/);
  assert.doesNotThrow(() => pu.refuseOlderVersion('1.2.0', '1.1.9', { allowOlder: true }), 'bewusst zurück (--aeltere-version)');
});
