// Ohne Adminrechte (Manager als Dienst, Linux ohne sudo): „Im Schulnetz erreichbar“ wird trotzdem gespeichert und der
// Befehl für die IT mitgegeben; vorhandene Regeln brauchen keine Adminrechte mehr. Dazu: polkit-Version (Linux) erkennen.
// Probelauf (MOSAIK3LAB_SYSTEM_DRY_RUN), startet keine Dienste. Testdaten: C:\Entwicklung\_testdaten\server-manager\.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TESTROOT = path.resolve(import.meta.dirname, '..', '..', '..', '_testdaten', 'server-manager');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'rechte-')));
fs.mkdirSync(path.join(tmp, 'daten'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'mosaik3lab.json'), JSON.stringify({ dataDir: path.join(tmp, 'daten'), managerPort: 5198 }));
Object.assign(process.env, { MANAGER_CONFIG: path.join(tmp, 'mosaik3lab.json'), MOSAIK3LAB_ROOT: tmp, MOSAIK3LAB_SYSTEM_DRY_RUN: path.join(tmp, 'probelauf.json'), MOSAIK3LAB_QUIET: '1' });

const cfg = await import('../lib/config.mjs');
const { platform } = await import('../platform/index.mjs');
const services = await import('../lib/services.mjs');
const { polkitTooOld } = await import('../platform/linux.mjs');
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

cfg.updateConfig({ app: { port: 3099, network: false }, paths: { logDir: path.join(tmp, 'logs'), backupDir: path.join(tmp, 'backups') }, portal: { enabled: true, httpPort: 8090, httpsPort: 8490, https: false } });
const rules = new Set();
const scripts = [];
let elevate = 'manuell';
platform.firewall.exists = async (port) => rules.has(port);
platform.portOwner = async () => null; // keine echte Port-Abfrage
platform.elevate = async (script) => {
  scripts.push(script);
  if (elevate === 'manuell') return { ok: false, code: 3, manual: true, message: 'Administratorrechte nötig – Befehl bitte mit sudo im Terminal ausführen.' };
  if (elevate === 'abgelehnt') return { ok: false, code: 3, message: 'Die Windows-Bestätigung wurde abgelehnt.' };
  return { ok: true, code: 0 };
};

test('ohne Adminrechte: Freigabe wird gespeichert, Befehl kommt mit – Schalter bleibt nicht hängen', async () => {
  const err = await services.setNetwork(true).then(() => null, (e) => e);
  assert.ok(err, 'meldet, dass die Regel fehlt');
  assert.equal(err.saved, true);
  assert.match(err.message, /^Gespeichert – aber die Firewall-Regel fehlt noch/);
  assert.match(err.command, /PROBELAUF allow 8090/);
  assert.equal(cfg.getConfig().app.network, true, 'Einstellung ist übernommen');
});

test('Regel schon vorhanden (von Hand angelegt): keine Adminrechte nötig', async () => {
  rules.add(8090);
  services.clearSystemCache();
  scripts.length = 0;
  cfg.updateConfig({ app: { network: false } });
  const st = await services.setNetwork(true);
  assert.equal(scripts.length, 0, 'kein Admin-Skript');
  assert.equal(st.network, true);
  assert.equal(st.ruleExists, true);
});

test('Windows-Bestätigung abgelehnt: nichts wird geändert', async () => {
  elevate = 'abgelehnt';
  services.clearSystemCache();
  await assert.rejects(services.setNetwork(false), /abgelehnt/);
  assert.equal(cfg.getConfig().app.network, true, 'bleibt wie vorher');
});

test('polkit: JavaScript-Regeln erst ab 0.106 (Bullseye, Ubuntu 22.04 haben 0.105)', () => {
  assert.equal(polkitTooOld('pkaction version 0.105'), '0.105');
  assert.equal(polkitTooOld('pkaction version 0.106'), null);
  assert.equal(polkitTooOld('pkaction version 122'), null, 'Bookworm');
  assert.equal(polkitTooOld('pkaction version 124'), null, 'Ubuntu 24.04');
  assert.equal(polkitTooOld(''), null, 'unbekannt → nicht anmahnen');
});
