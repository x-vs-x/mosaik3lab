// Tests für Laufzeit-Updates (Node.js, Dienst-Wrapper) und das Lesen des Datenbank-Schemas einer Version.
// Testdaten liegen unter C:\Entwicklung\_testdaten\manager-updates (nicht im Temp-Verzeichnis).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TESTROOT = path.resolve(import.meta.dirname, '..', '..', '..', '_testdaten', 'manager-updates');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'run-')));
const storage = path.join(tmp, 'storage');
process.env.MANAGER_CONFIG = path.join(tmp, 'manager.config.json');
process.env.MOSAIK3LAB_QUIET = '1';
fs.writeFileSync(process.env.MANAGER_CONFIG, JSON.stringify({ paths: { dataDir: storage, ablageDir: path.join(tmp, 'ablage'), backupDir: path.join(tmp, 'backups'), logDir: path.join(tmp, 'logs') }, backup: { keep: 10 } }));

const rt = await import('../lib/runtime.mjs');
const schema = await import('../lib/schema.mjs');
const setup = await import('../lib/setup.mjs');
const { windows, linux } = await import('../platform/index.mjs');

after(() => setup.removeTree(tmp));

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
  assert.ok(!offline.rows.some((r) => r.id === 'git'), 'Git gehört nicht mehr zur Laufzeit (Updates nur als Paket)');
  const newer = await rt.runtimeStatus({ fetchJson: async (url) => (url.includes('nodejs.org') ? [{ version: 'v99.0.0', lts: 'Foo' }] : Promise.reject(new Error('x'))) });
  assert.equal(newer.rows.find((r) => r.id === 'node').light, 'warn');
  assert.equal(await rt.latestNodeLts(async () => [{ version: 'v25.0.0', lts: false }, { version: 'v24.9.0', lts: 'Krypton' }]), '24.9.0');
});

test('Paket-Installation: kein Node-Update angeboten', async () => {
  const s = await rt.runtimeStatus({ paket: true, fetchJson: async () => [{ version: 'v99.0.0', lts: 'Foo' }] });
  const r = s.rows.find((x) => x.id === 'node');
  assert.equal(r.light, 'ok');
  assert.equal(r.action, null, 'kein Knopf');
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
});

test('Laufzeit-Update: Node fehlt → installieren; Fehler → Dienste laufen wieder, Hinweis zum Zurückgehen', async () => {
  const none = { ...fakeEnv(), installedVersion: async () => null };
  const inst = await rt.updateRuntime('node', { dryRun: true, ...none });
  assert.equal(inst.command, 'install node');

  const bad = fakeEnv({ adminFails: true });
  const r = await rt.updateRuntime('node', bad);
  assert.equal(r.ok, false);
  assert.match(r.message, /abgelehnt/);
  assert.match(r.hint, /Sicherung: mosaik3lab-test/);
  assert.match(r.hint, /back node 1\.0\.0/);
  assert.deepEqual(bad.calls.filter((c) => !c.startsWith('admin')), ['stop', 'start'], 'Web-App wird trotzdem wieder gestartet');

  const sick = fakeEnv({ healthy: false });
  const r2 = await rt.updateRuntime('node', sick);
  assert.equal(r2.ok, false);
  assert.match(r2.message, /antwortet nach dem Start nicht/);

  await assert.rejects(() => rt.updateRuntime('python', fakeEnv()), /Unbekannte Laufzeit/);
  await assert.rejects(() => rt.updateRuntime('git', fakeEnv()), /Unbekannte Laufzeit/);
  await assert.rejects(() => rt.updateRuntime('wrapper', { ...fakeEnv(), platform: linux }), /nur unter Windows/);
});

test('Laufzeit: Windows nutzt winget, Linux apt (nur Skripte, nichts wird ausgeführt)', () => {
  assert.match(windows.runtime.upgradeScript('node'), /winget upgrade --id OpenJS\.NodeJS\.LTS/);
  assert.match(linux.runtime.upgradeScript('node'), /nodesource/);
  assert.match(linux.runtime.backScript('node', '24.1.0'), /nodejs=24\.1\.0/);
});

// ---------- Schema einer Version ----------
/** Programmordner einer Version mit <schemaVersion> Migrationen. */
function fakeRelease(dir, version, schemaVersion) {
  fs.mkdirSync(path.join(dir, 'server', 'src', 'storage', 'sqlite', 'migrations'), { recursive: true });
  for (let n = 1; n <= schemaVersion; n++) fs.writeFileSync(path.join(dir, 'server', 'src', 'storage', 'sqlite', 'migrations', `${String(n).padStart(3, '0')}_x.sql`), '-- test');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version }));
}

test('Schema lesen: Datenbank und Migrationen einer Version', async () => {
  assert.equal(await schema.dbSchemaVersion(path.join(tmp, 'gibt-es-nicht.db')), null);
  const dir = path.join(tmp, 'rel');
  assert.equal(schema.releaseSchemaVersion(dir), null);
  fakeRelease(dir, '9.9.9', 4);
  assert.equal(schema.releaseSchemaVersion(dir), 4);
});
