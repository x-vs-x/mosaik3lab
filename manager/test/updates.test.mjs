// Tests für Git-Suche, Laufzeit-Updates (Node/Git/Wrapper) und den Schutz der Datenbank beim Update.
// Testdaten liegen unter C:\Entwicklung\_testdaten\manager-updates (nicht im Temp-Verzeichnis).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { freePort } from './helpers/net.mjs';

const TESTROOT = path.resolve(import.meta.dirname, '..', '..', '..', '_testdaten', 'manager-updates');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'run-')));
const storage = path.join(tmp, 'storage');
process.env.MANAGER_CONFIG = path.join(tmp, 'manager.config.json');
process.env.MOSAIK3LAB_QUIET = '1';
fs.writeFileSync(process.env.MANAGER_CONFIG, JSON.stringify({ paths: { dataDir: storage, ablageDir: path.join(tmp, 'ablage'), backupDir: path.join(tmp, 'backups'), logDir: path.join(tmp, 'logs') }, backup: { keep: 10 } }));

const cfg = await import('../lib/config.mjs');
const upd = await import('../lib/update.mjs');
const rt = await import('../lib/runtime.mjs');
const gitlib = await import('../lib/git.mjs');
const schema = await import('../lib/schema.mjs');
const setup = await import('../lib/setup.mjs');
const { windows, linux } = await import('../platform/index.mjs');

after(() => setup.removeTree(tmp));

// ---------- Git ----------
test('Git: auch ohne PATH über Standardorte gefunden; Konfig prüft den Pfad', async () => {
  const found = await gitlib.findGit({ remember: false });
  if (!found) return; // Rechner ohne Git: nichts zu prüfen (die Meldung testet der nächste Test)
  const oldPath = process.env.PATH;
  try {
    process.env.PATH = ''; // wie ein Dienstkonto ohne Git im PATH
    const again = await gitlib.findGit({ remember: false });
    if (windows.gitCandidates().length && process.platform === 'win32' || process.platform === 'linux') assert.ok(again, 'Git wird an Standardorten gefunden');
  } finally {
    process.env.PATH = oldPath;
  }
  assert.throws(() => cfg.updateConfig({ update: { gitPath: 'git' } }), /vollständigen Pfad/);
  assert.equal(cfg.updateConfig({ update: { gitPath: found.path } }).update.gitPath, found.path);
  cfg.updateConfig({ update: { gitPath: '' } });
});

test('Git fehlt: klare Meldung mit Installationshinweis (statt leerer Fehlermeldung)', () => {
  const e = gitlib.gitMissing();
  assert.match(e.message, /Git wurde nicht gefunden/);
  assert.match(e.hint, /winget install|apt-get install/);
  assert.match(windows.gitInstall, /Git\.Git/);
  assert.match(linux.gitInstall, /apt-get install -y git/);
});

// ---------- Laufzeit ----------
test('Versionsvergleich und Laufzeit-Status (offline → unbekannt, kein Fehler)', async () => {
  assert.ok(rt.compareVersions('24.11.0', 'v24.2.9') > 0);
  assert.ok(rt.compareVersions('2.47.1', '2.47.1') === 0);
  assert.ok(rt.compareVersions('22.0.0', '24.0.0') < 0);
  const offline = await rt.runtimeStatus({ fetchJson: async () => { throw new Error('offline'); } });
  const node = offline.rows.find((r) => r.id === 'node');
  assert.equal(node.latest, null);
  assert.notEqual(node.light, 'error');
  assert.match(node.label, /unbekannt/);
  const newer = await rt.runtimeStatus({ fetchJson: async (url) => (url.includes('nodejs.org') ? [{ version: 'v99.0.0', lts: 'Foo' }] : Promise.reject(new Error('x'))) });
  assert.equal(newer.rows.find((r) => r.id === 'node').light, 'warn');
  assert.equal(await rt.latestNodeLts(async () => [{ version: 'v25.0.0', lts: false }, { version: 'v24.9.0', lts: 'Krypton' }]), '24.9.0');
});

const fakePlatform = (scripts) => ({ ...windows, runtime: { ids: windows.runtime.ids, installScript: (w) => `install ${w}`, upgradeScript: (w) => `upgrade ${w}`, backScript: (w, v) => `back ${w} ${v}`, ...scripts } });
function fakeEnv({ adminFails = false, healthy = true, versions = ['1.0.0', '2.0.0'] } = {}) {
  const calls = [];
  let v = 0;
  return {
    calls,
    platform: fakePlatform(),
    installedVersion: async () => versions[Math.min(v, versions.length - 1)],
    backup: async () => ({ id: 'mosaik3lab-test' }),
    services: { stopAll: async () => (calls.push('stop'), ['webapp']), startAll: async () => calls.push('start'), healthy: async () => healthy },
    admin: async (script) => {
      calls.push(`admin:${script}`);
      if (adminFails) throw new Error('Die Windows-Bestätigung wurde abgelehnt.');
      v++;
    },
    requestManagerRestart: () => calls.push('restart-manager'),
    healthMs: 10,
  };
}

test('Laufzeit-Update: Probelauf ändert nichts; Ablauf Sicherung → stoppen → aktualisieren → starten → prüfen', async () => {
  const dry = fakeEnv();
  const plan = await rt.updateRuntime('node', { dryRun: true, ...dry });
  assert.equal(plan.dryRun, true);
  assert.equal(plan.command, 'upgrade node');
  assert.deepEqual(dry.calls, [], 'Probelauf tut nichts');

  const env = fakeEnv();
  const steps = [];
  const r = await rt.updateRuntime('node', env, (id, st) => steps.push(`${id}:${st}`));
  assert.equal(r.ok, true);
  assert.deepEqual([r.from, r.to], ['1.0.0', '2.0.0']);
  assert.deepEqual(env.calls, ['stop', 'admin:upgrade node', 'start', 'restart-manager']);
  assert.deepEqual(steps.filter((s) => s.endsWith(':fertig')).map((s) => s.split(':')[0]), ['backup', 'stop', 'update', 'start', 'health']);

  const git = fakeEnv();
  await rt.updateRuntime('git', git);
  assert.ok(!git.calls.includes('restart-manager'), 'Git-Update braucht keinen Manager-Neustart');
});

test('Laufzeit-Update: Git fehlt → installieren; Fehler → Dienste laufen wieder, Hinweis zum Zurückgehen', async () => {
  const none = { ...fakeEnv(), installedVersion: async () => null };
  const inst = await rt.updateRuntime('git', { dryRun: true, ...none });
  assert.equal(inst.command, 'install git');

  const bad = fakeEnv({ adminFails: true });
  const r = await rt.updateRuntime('node', bad);
  assert.equal(r.ok, false);
  assert.match(r.message, /abgelehnt/);
  assert.match(r.hint, /Sicherung: mosaik3lab-test/);
  assert.match(r.hint, /back node 1\.0\.0/);
  assert.deepEqual(bad.calls.filter((c) => !c.startsWith('admin')), ['stop', 'start'], 'Web-App wird trotzdem wieder gestartet');

  const sick = fakeEnv({ healthy: false });
  const r2 = await rt.updateRuntime('git', sick);
  assert.equal(r2.ok, false);
  assert.match(r2.message, /antwortet nach dem Start nicht/);

  await assert.rejects(() => rt.updateRuntime('python', fakeEnv()), /Unbekannte Laufzeit/);
  await assert.rejects(() => rt.updateRuntime('wrapper', { ...fakeEnv(), platform: linux }), /nur unter Windows/);
});

test('Laufzeit: Windows nutzt winget, Linux apt (nur Skripte, nichts wird ausgeführt)', () => {
  assert.match(windows.runtime.upgradeScript('node'), /winget upgrade --id OpenJS\.NodeJS\.LTS/);
  assert.match(windows.runtime.upgradeScript('git'), /winget upgrade --id Git\.Git/);
  assert.match(linux.runtime.upgradeScript('git'), /apt-get/);
  assert.match(linux.runtime.upgradeScript('node'), /nodesource/);
});

// ---------- Datenbank-Schutz beim Update ----------
const SCHEMA = (dir) => schema.releaseSchemaVersion(dir);
const dbFile = path.join(storage, 'mosaik3lab.db');
const readDb = (sql) => {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
};

/** Kleine „Web-App“: spielt beim Start Migrationen bis zum Schema ihrer Version ein; antwortet gesund oder nicht. */
function fakeRelease(dir, version, schemaVersion, healthy) {
  fs.mkdirSync(path.join(dir, 'server', 'src', 'storage', 'sqlite', 'migrations'), { recursive: true });
  for (let n = 1; n <= schemaVersion; n++) fs.writeFileSync(path.join(dir, 'server', 'src', 'storage', 'sqlite', 'migrations', `${String(n).padStart(3, '0')}_x.sql`), '-- test');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version }));
  fs.writeFileSync(path.join(dir, 'server', 'app.js'), `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.DB_FILE);
db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');
let have = db.prepare('SELECT MAX(version) AS v FROM schema_version').get().v ?? 0;
for (let v = have + 1; v <= ${schemaVersion}; v++) { db.exec('CREATE TABLE neu_' + v + ' (x)'); db.exec('INSERT INTO schema_version VALUES (' + v + ')'); }
db.close();
require('http').createServer((q, s) => { s.statusCode = ${healthy ? 200 : 500}; s.end('{}'); }).listen(Number(process.env.API_PORT), '127.0.0.1');`);
}

test('Update mit Migration: scheitert die neue Version, kommen alte Version, altes Schema und Daten zurück; Downgrade wird verweigert', async () => {
  const root = path.join(tmp, 'install');
  const port = await freePort();
  fs.mkdirSync(path.join(storage, 'data'), { recursive: true });
  fs.writeFileSync(path.join(storage, 'data', 'x.json'), '{}');
  const seed = new DatabaseSync(dbFile);
  seed.exec("CREATE TABLE schema_version (version INTEGER PRIMARY KEY); INSERT INTO schema_version VALUES (1); CREATE TABLE person (name TEXT); INSERT INTO person VALUES ('Ada'), ('Bob');");
  seed.close();
  fakeRelease(path.join(root, 'releases', '1.0.0-a'), '1.0.0', 1, true);
  upd.switchCurrent(root, '1.0.0-a');

  let proc = null;
  after(() => proc?.kill());
  const healthy = async (ms) => {
    for (const until = Date.now() + ms; Date.now() < until; await new Promise((r) => setTimeout(r, 300))) {
      if (await fetch(`http://127.0.0.1:${port}/`).then((r) => r.ok, () => false)) return true;
    }
    return false;
  };
  const services = {
    async stopAll() {
      if (!proc) return [];
      proc.kill();
      await new Promise((r) => proc.once('exit', r));
      proc = null;
      return ['webapp'];
    },
    async startAll() {
      proc = spawn(process.execPath, [path.join(root, 'current', 'server', 'app.js')], { env: { ...process.env, API_PORT: String(port), DB_FILE: dbFile }, stdio: 'ignore' });
    },
    healthy,
  };
  // Echte Bausteine des Managers (Backup, Schema lesen, Wiederherstellen); nur Git/Entpacken/npm sind ersetzt.
  const ctx = (version, schemaVersion, ok) => ({
    ...upd.defaultContext(), root, services, healthMs: 5000,
    prepare: async () => {},
    check: async () => ({ installed: upd.currentRelease(root), available: { id: `${version}-x`, version, commit: version, changes: [] }, updateAvailable: true }),
    fetch: async (info, dest) => fakeRelease(dest, version, schemaVersion, ok),
  });
  await services.startAll();
  assert.ok(await healthy(5000));
  assert.equal((await schema.dbSchemaVersion(dbFile)), 1);

  // 1. Gutes Update mit Migration: Schema 1 → 2
  const good = await upd.installUpdate(ctx('1.2.0', 2, true));
  assert.equal(good.ok, true);
  assert.equal(await schema.dbSchemaVersion(dbFile), 2);

  // 2. Downgrade (Version kennt nur Schema 1, Datenbank hat 2) → verweigert, nichts verändert
  await assert.rejects(() => upd.installUpdate(ctx('1.1.0', 1, true)), /Downgrade verweigert/);
  assert.equal(upd.currentRelease(root).id, '1.2.0-x');
  assert.ok(!fs.existsSync(path.join(root, 'releases', '1.1.0-x')), 'abgelehnte Version wird nicht behalten');
  assert.ok(await healthy(3000));

  // 3. Kaputtes Update MIT neuer Migration (Schema 2 → 3): Version, Schema und Daten wie vorher
  const before = readDb('SELECT name FROM person ORDER BY name');
  const steps = [];
  const bad = await upd.installUpdate(ctx('1.3.0', 3, false), (id, st, d) => steps.push(`${id}:${st}${d ? `:${d}` : ''}`));
  assert.equal(bad.rolledBack, true);
  assert.equal(upd.currentRelease(root).id, '1.2.0-x', 'alte Version aktiv');
  assert.equal(await schema.dbSchemaVersion(dbFile), 2, 'altes Schema zurück');
  assert.deepEqual(readDb('SELECT name FROM person ORDER BY name'), before, 'Daten unverändert');
  assert.equal(readDb("SELECT name FROM sqlite_master WHERE name = 'neu_3'").length, 0, 'Migration 3 ist weg');
  assert.ok(steps.some((s) => s.startsWith('rollback:fertig') && /Datenbank aus Sicherung .* zurückgespielt/.test(s)), steps.join(' | '));
  assert.ok(await healthy(5000), 'alte Version läuft wieder');

  // 4. Kaputtes Update OHNE Migration (gleiches Schema): Datenbank wird nicht angefasst
  const noMig = await upd.installUpdate(ctx('1.4.0', 2, false), (id, st, d) => steps.push(`b-${id}:${st}${d ? `:${d}` : ''}`));
  assert.equal(noMig.rolledBack, true);
  assert.ok(!steps.some((s) => s.startsWith('b-rollback:fertig') && /zurückgespielt/.test(s)), 'ohne Schema-Änderung keine Wiederherstellung');
  assert.equal(await schema.dbSchemaVersion(dbFile), 2);
  await services.stopAll();
});

test('Schema lesen: Datenbank und Migrationen einer Version', async () => {
  assert.equal(await schema.dbSchemaVersion(path.join(tmp, 'gibt-es-nicht.db')), null);
  const dir = path.join(tmp, 'rel');
  assert.equal(SCHEMA(dir), null);
  fakeRelease(dir, '9.9.9', 4, true);
  assert.equal(SCHEMA(dir), 4);
});
