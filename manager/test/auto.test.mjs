// Automatik des Managers (lib/auto.mjs) und der Statussatz oben auf der Seite (lib/status.mjs).
// Alles im Probelauf (MOSAIK3LAB_SYSTEM_DRY_RUN): keine echte Firewall, keine Windows-Bestätigung, keine Dienste.
// Testdaten: C:\Entwicklung\_testdaten\server-manager\ (nicht im Temp-Verzeichnis).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TESTROOT = path.resolve(import.meta.dirname, '..', '..', '..', '_testdaten', 'server-manager');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'auto-')));
const probe = path.join(tmp, 'probelauf.json');
fs.mkdirSync(path.join(tmp, 'daten'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'mosaik3lab.json'), JSON.stringify({ dataDir: path.join(tmp, 'daten'), managerPort: 5198 }));
Object.assign(process.env, { MANAGER_CONFIG: path.join(tmp, 'mosaik3lab.json'), MOSAIK3LAB_ROOT: tmp, MOSAIK3LAB_SYSTEM_DRY_RUN: probe, MOSAIK3LAB_QUIET: '1' });

const cfg = await import('../lib/config.mjs');
const { platform } = await import('../platform/index.mjs');
const auto = await import('../lib/auto.mjs');
const { summarize, appAddresses, pageStatus, portalBusyNote } = await import('../lib/status.mjs');
const sdb = await import('../lib/settingsdb.mjs');
const { createBackup } = await import('../lib/backup.mjs');
const { reconcile } = await import('../lib/reconcile.mjs');
const services = await import('../lib/services.mjs');
const setup = await import('../lib/setup.mjs');
cfg.updateConfig({ app: { port: 3029, network: false }, paths: { logDir: path.join(tmp, 'logs'), backupDir: path.join(tmp, 'backups') }, portal: { enabled: false, basePath: '', httpPort: 8089, httpsPort: 8449 } }); // Portal aus: App direkt (Standardwerte prüft ein eigener Test)

after(async () => {
  if ((await services.serviceStatus('backup')).running) await services.stopService('backup');
  setup.removeTree(tmp);
});

test('Statussatz: ein Satz, wichtigster Punkt zuerst, Info-Hinweise zählen nicht', () => {
  assert.deepEqual(summarize([]), { light: 'ok', text: 'Alles in Ordnung.', count: 0, fix: null });
  assert.equal(summarize([{ light: 'info', text: 'Arbeitskopie' }]).text, 'Alles in Ordnung.');
  const one = summarize([{ light: 'info', text: 'x' }, { light: 'warn', text: 'Es gibt noch keine Sicherung.', fix: 'backup' }]);
  assert.equal(one.text, '1 Punkt braucht Aufmerksamkeit: Es gibt noch keine Sicherung.');
  assert.deepEqual([one.light, one.fix, one.count], ['warn', 'backup', 1]);
  const two = summarize([{ light: 'warn', text: 'Hinweis' }, { light: 'error', text: 'Die Web-App läuft nicht.', fix: 'start:webapp' }]);
  assert.equal(two.text, '2 Punkte brauchen Aufmerksamkeit: Die Web-App läuft nicht.', 'Fehler vor Hinweis');
  assert.deepEqual([two.light, two.fix], ['error', 'start:webapp']);
});

test('Adresse der App: nur lokal, über das Portal mit Pfad oder direkt mit Port', () => {
  const id = { hostname: 'srv', ips: ['10.0.0.5'] };
  const c = structuredClone(cfg.getConfig());
  assert.deepEqual(appAddresses(c, id).network, [], 'ohne „Im Schulnetz erreichbar“ keine Netzadressen');
  c.app.network = true;
  assert.deepEqual(appAddresses(c, id).network, ['http://srv:3029/', 'http://10.0.0.5:3029/']);
  c.portal = { ...c.portal, enabled: true, basePath: '/mosaik3lab', httpPort: 80 };
  assert.deepEqual(appAddresses(c, id), { local: 'http://127.0.0.1/mosaik3lab/', network: ['http://srv/mosaik3lab/', 'http://10.0.0.5/mosaik3lab/'] });
});

test('Probelauf-Plattform: Firewall-Regeln nur in der Datei, keine Windows-Bestätigung', async () => {
  assert.equal(platform.dryRun, true);
  assert.equal(await platform.isAdmin(), false);
  assert.equal((await platform.elevate(platform.firewall.allowScript(8089))).ok, true);
  assert.equal(await platform.firewall.exists(8089), true);
  await platform.elevate(platform.firewall.removeScript(8089));
  assert.equal(await platform.firewall.exists(8089), false);
  assert.deepEqual(await platform.services.status('webapp'), { installed: false, running: false });
});

test('Netzwerk als „Öffentlich“ eingestuft: Hinweis, dass die Freigabe (Privat, Domäne) dort nicht greift', async () => {
  const hat = async () => (await pageStatus()).notes.some((n) => n.text === services.PUBLIC_NETWORK_HINT);
  const vorher = fs.existsSync(probe) ? JSON.parse(fs.readFileSync(probe, 'utf8')) : { rules: [], scripts: [] };
  fs.writeFileSync(probe, JSON.stringify({ ...vorher, publicNetwork: true }));
  services.clearSystemCache();
  try {
    assert.equal(await hat(), false, 'ohne „Im Schulnetz erreichbar“ kein Hinweis');
    cfg.updateConfig({ app: { network: true } });
    assert.equal(await hat(), true);
    assert.equal((await services.firewallStatus()).publicNetwork, true);
  } finally {
    cfg.updateConfig({ app: { network: false } });
    fs.writeFileSync(probe, JSON.stringify(vorher));
    services.clearSystemCache();
  }
});

test('Abgleich beim Start meldet Firewall-Abweichungen nur, nach einer Änderung wird angeglichen', async () => {
  cfg.updateConfig({ app: { network: true } });
  const start = await reconcile({ restart: false, firewall: false });
  assert.equal(start.steps.find((s) => s.id === 'firewall').status, 'warnung', 'beim Start keine ungefragte Windows-Bestätigung');
  assert.equal(await platform.firewall.exists(3029), false);
  assert.equal((await auto.checkDrift()).map((d) => d.id).join(), 'firewall', 'Abweichung wird gemerkt');
  const notes = (await pageStatus()).notes;
  assert.ok(notes.some((n) => n.fix === 'reconcile' && /Abgleichen/.test(n.text)), 'Hinweis mit Knopf „Abgleichen“');
  assert.ok(notes.some((n) => n.fix === 'start:webapp'), 'Web-App gestoppt → Knopf „Web-App starten“');

  const r = await auto.afterChange({ restart: false });
  assert.equal(r.steps.find((s) => s.id === 'firewall').status, 'fertig');
  assert.equal(await platform.firewall.exists(3029), true, 'Regel automatisch gesetzt');
  assert.deepEqual(auto.autoState().drift, [], 'danach keine Abweichung mehr');

  cfg.updateConfig({ app: { network: false } });
  await auto.afterChange({ restart: false });
  assert.equal(await platform.firewall.exists(3029), false, 'ausgeschaltet → Regel automatisch entfernt');
});

test('Update und Laufzeit: geprüft wird automatisch, gemeldet nur bei Handlungsbedarf', async () => {
  assert.equal(await auto.checkUpdates(async () => assert.fail('in der Arbeitskopie nicht prüfen')), null);
  const full = await auto.checkRuntime(async () => ({ rows: [
    { id: 'node', title: 'Node.js', light: 'warn', action: 'update', label: '24.1 – neuere LTS 24.2' },
    { id: 'git', title: 'Git', light: 'ok', action: 'update', label: 'aktuell' },
    { id: 'wrapper', title: 'WinSW', light: 'info', action: null, label: 'noch nicht eingerichtet' },
  ] }));
  assert.equal(full.rows.length, 3, 'vollständige Liste für „Erweitert“');
  assert.deepEqual(auto.autoState().runtime.map((r) => r.id), ['node']);
  assert.deepEqual((await pageStatus()).updates.runtime.map((r) => r.id), ['node'], 'Karte „Update verfügbar“');
  assert.deepEqual((await auto.checkRuntime(async () => { throw new Error('offline'); })).rows, [], 'offline ist kein Fehler');
});

test('Backup-Dienst startet automatisch – außer er wurde ausdrücklich gestoppt', async () => {
  assert.equal(await auto.ensureBackupService(), true);
  assert.equal((await services.serviceStatus('backup')).running, true);
  assert.equal(await auto.ensureBackupService(), false, 'läuft schon');
  await services.stopService('backup');
  assert.equal(await auto.ensureBackupService(), false, 'von Hand gestoppt → bleibt aus');
  assert.equal((await services.serviceStatus('backup')).running, false);
});

test('Standard für neue Einrichtungen: http://<Server>/mosaik3lab ohne Port – bestehende Einstellungen bleiben', () => {
  const neu = path.join(tmp, 'neu');
  fs.mkdirSync(neu);
  const c = cfg.configFromDb(neu);
  assert.deepEqual([c.portal.enabled, c.portal.basePath, c.portal.httpPort], [true, '/mosaik3lab', 80]);
  assert.equal(services.localAppUrl(c), 'http://127.0.0.1/mosaik3lab/', 'auf diesem Rechner ohne Port');
  assert.deepEqual(appAddresses({ ...c, app: { ...c.app, network: true } }, { hostname: 'srv', ips: [] }).network, ['http://srv/mosaik3lab/']);

  const alt = path.join(tmp, 'alt'); // Einstellungen von früher: Betriebswerte da, aber noch keine Portal-Werte
  fs.mkdirSync(alt);
  sdb.writeBereich(sdb.dbFileOf(alt), 'betrieb', { 'app.port': 3001, 'app.network': true });
  const a = cfg.configFromDb(alt);
  assert.deepEqual([a.portal.enabled, a.portal.basePath, a.app.port], [false, '', 3001], 'nicht überschrieben: App weiter direkt auf ihrem Port');
  assert.deepEqual(cfg.keepLegacyPortal({ app: {}, portal: { enabled: true, basePath: '/x' } }).portal, { enabled: true, basePath: '/x' }, 'gespeicherte Portal-Werte bleiben');
});

test('Port 80 belegt: klarer Hinweis mit freiem Ausweich-Port und Knopf', async () => {
  const c = { ...cfg.getConfig(), portal: { ...cfg.getConfig().portal, enabled: true, basePath: '/mosaik3lab', httpPort: 80 } };
  const busy = [{ port: 80, process: 'httpd', pid: 4711, message: 'Port 80 ist belegt durch httpd (PID 4711).' }];
  const n = await portalBusyNote(busy, c, async () => 8080);
  assert.equal(n.fix, 'portal-port:8080');
  assert.match(n.text, /belegt durch httpd/);
  assert.ok(n.text.includes('Port 8080 verwenden, dann lautet die Adresse http://<Server>:8080/mosaik3lab'), n.text);
  assert.equal((await portalBusyNote(busy, c, async () => null)).fix, 'advanced', 'kein freier Port → Erweitert');
  assert.equal(await services.suggestPortalPort(async (p) => (p === 8080 ? { pid: 1 } : null)), 8081, '8080 belegt → 8081');
});

test('Hinweise verschwinden, sobald die Ursache weg ist', async () => {
  // 1. Fehlgeschlagene automatische Sicherung – danach erfolgreich „Jetzt sichern“
  const failedAt = new Date(Date.now() - 60_000).toISOString();
  fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'logs', 'backup.state.json'), JSON.stringify({ key: 'backup', phase: 'stopped', lastRun: { ok: false, at: failedAt, kind: 'daten', error: 'Datenordner leer' }, lastError: 'Datenordner leer' }));
  const failed = (notes) => notes.some((x) => /automatische Sicherung ist fehlgeschlagen/.test(x.text));
  assert.ok(failed((await pageStatus()).notes), 'Fehler wird gemeldet');
  await createBackup('manuell');
  assert.ok(!failed((await pageStatus()).notes), 'nach erfolgreicher Sicherung verschwunden');

  // 2. Firewall-Abweichung, die von Hand behoben wurde: verschwindet beim nächsten Status (spätestens nach 1 Minute)
  cfg.updateConfig({ app: { network: true } });
  await auto.checkDrift();
  assert.ok((await pageStatus()).notes.some((x) => x.fix === 'reconcile'));
  await platform.elevate(platform.firewall.allowScript(3029)); // z. B. Regel von Hand angelegt
  services.clearSystemCache(); // gemerkte Firewall-Abfrage abgelaufen (30 s)
  auto.autoState().checkedAt.drift = new Date(Date.now() - 120_000).toISOString();
  await pageStatus(); // stößt die Prüfung an, wartet aber höchstens kurz darauf
  await auto.refreshStale();
  assert.ok(!(await pageStatus()).notes.some((x) => x.fix === 'reconcile'), 'Hinweis weg');
  cfg.updateConfig({ app: { network: false } });
  await platform.elevate(platform.firewall.removeScript(3029));
});
