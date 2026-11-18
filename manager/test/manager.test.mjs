// Unit-Tests (nur Temp-Ordner, keine Systemänderungen): Konfiguration, Backup, Firewall-/Dienstdateien,
// Symbol, sicheres Löschen, Einrichtung (Probelauf) + Deinstallation per Manifest, Update mit Rollback.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { freePort } from './helpers/net.mjs';

// Testdaten liegen fest unter C:\Entwicklung\_testdaten\server-manager (nicht im Temp-Verzeichnis).
const TESTROOT = path.resolve(import.meta.dirname, '..', '..', '..', '_testdaten', 'server-manager');

const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'unit-')));
const storage = path.join(tmp, 'storage');
const backups = path.join(tmp, 'backups');
process.env.MANAGER_CONFIG = path.join(tmp, 'manager.config.json');
process.env.MOSAIK3LAB_QUIET = '1';
fs.writeFileSync(process.env.MANAGER_CONFIG, JSON.stringify({ paths: { dataDir: storage, ablageDir: path.join(tmp, 'ablage'), backupDir: backups, logDir: path.join(tmp, 'logs') }, backup: { keep: 10 } }));

const cfg = await import('../lib/config.mjs');
const settingsdb = await import('../lib/settingsdb.mjs');
const bk = await import('../lib/backup.mjs');
const setup = await import('../lib/setup.mjs');
const upd = await import('../lib/update.mjs');
const icon = await import('../lib/icon.mjs');
const mail = await import('../lib/mail.mjs');
const { windows, linux, FIREWALL_RULE } = await import('../platform/index.mjs');

after(() => setup.removeTree(tmp));
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(storage, rel)), { recursive: true });
  fs.writeFileSync(path.join(storage, rel), text);
};

test('Konfiguration: Prüfregeln, Speicherung in der Datenbank, kaputte Startdatei', () => {
  assert.throws(() => cfg.checkDir('relativ/ordner', 'X'), /vollständigen Pfad/);
  assert.throws(() => cfg.checkDir(path.parse(tmp).root, 'X'), /Laufwerk/);
  assert.throws(() => cfg.updateConfig({ app: { port: 80 } }), /1024/);
  assert.throws(() => cfg.updateConfig({ app: { port: 5190 } }), /verschiedene Ports/);
  assert.throws(() => cfg.updateConfig({ paths: { backupDir: path.join(storage, 'x') } }), /ineinander/);
  assert.throws(() => cfg.updateConfig({ backup: { time: '25:00' } }), /HH:MM/);
  cfg.updateConfig({ app: { port: 3020 } });
  cfg.updateConfig({ app: { port: 3021 } });
  const rows = settingsdb.readAll(cfg.resolvePaths().dbFile);
  assert.equal(rows.betrieb['app.port'], 3021, 'Einstellung steht in der Datenbank');
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(cfg.CONFIG_FILE, 'utf8'))).sort(), ['dataDir', 'managerPort'], 'Startdatei enthält nur dataDir und managerPort');
  assert.ok(fs.readdirSync(path.dirname(cfg.CONFIG_FILE)).some((n) => /.vor-datenbank-.*.bak$/.test(n)), 'alte Konfigurationsdatei als .bak');
  const keep = fs.readFileSync(cfg.CONFIG_FILE);
  fs.writeFileSync(cfg.CONFIG_FILE, '{ kaputt');
  cfg.reloadConfig();
  assert.equal(cfg.getConfig().app.port, 3001, 'Standardwerte');
  assert.match(cfg.configErrors()[0], /nicht lesbar/);
  fs.writeFileSync(cfg.CONFIG_FILE, keep);
  cfg.reloadConfig();
  assert.deepEqual(Object.keys(cfg.publicConfig().manager), ['port'], 'kein eigenes Manager-Passwort');
});

test('Backup: eine Datei, Standard vollständig, ältere Art „daten“ lesbar, Prüfsummen, Beschädigung erkannt, Wiederherstellung, Aufbewahrung', async () => {
  write('data/items.json', '["alt"]');
  write('data/sessions.json', '{}');
  write('data/.lock', '999999');
  write('uploads/images/a.png', 'bild');
  fs.mkdirSync(path.join(tmp, 'ablage', 'bilder'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'ablage', 'bilder', 'b.jpg'), 'ablage');
  const full = await bk.createBackup('test'); // Standard: vollständig (Datenbank + Ablage)
  const small = await bk.createBackup('klein', { kind: 'daten' }); // ältere Art, wie bisherige tägliche Sicherungen
  assert.equal(full.kind, 'komplett');
  assert.equal(small.kind, 'daten');
  const file = path.join(backups, `${full.id}.m3lbackup`);
  assert.ok(fs.existsSync(file) && fs.statSync(file).isFile(), 'eine einzelne Datei');
  const list = await bk.listBackups();
  assert.deepEqual(list.map((x) => x.kind).sort(), ['daten', 'komplett']);
  assert.ok(list.find((x) => x.id === full.id).files > list.find((x) => x.id === small.id).files, 'komplett enthält mehr (Ablage)');
  assert.ok(!fs.readFileSync(file).includes('999999'), 'Sperrdatei nicht gesichert');
  await assert.rejects(bk.restoreBackup(full.id, 'falsch'), /bestätigen/);
  await assert.rejects(bk.restoreBackup('../x', '../x'), /nicht gefunden/);
  // „komplett“ ersetzt Daten UND Ablage
  fs.writeFileSync(path.join(tmp, 'ablage', 'bilder', 'b.jpg'), 'geändert');
  write('data/items.json', '["neu"]');
  const r = await bk.restoreBackup(full.id, full.id);
  assert.equal(fs.readFileSync(path.join(storage, 'data', 'items.json'), 'utf8'), '["alt"]');
  assert.equal(fs.readFileSync(path.join(tmp, 'ablage', 'bilder', 'b.jpg'), 'utf8'), 'ablage', 'Ablage wiederhergestellt');
  assert.ok(r.safetyBackup, 'vorher automatisch gesichert');
  assert.equal(bk.filesNote(), null);
  // ältere Art „daten“ lässt die vorhandene Ablage unberührt und merkt sich: Dateien dürfen fehlen
  fs.writeFileSync(path.join(tmp, 'ablage', 'bilder', 'b.jpg'), 'bleibt');
  write('data/items.json', '["neu2"]');
  await bk.restoreBackup(small.id, small.id);
  assert.equal(fs.readFileSync(path.join(storage, 'data', 'items.json'), 'utf8'), '["alt"]');
  assert.equal(fs.readFileSync(path.join(tmp, 'ablage', 'bilder', 'b.jpg'), 'utf8'), 'bleibt', 'Ablage unberührt');
  assert.ok(bk.filesNote(), 'Hinweis „Backup ohne Dateien“ gemerkt');
  // fehlende Dateien aus einer vollständigen Sicherung nachholen: nur Fehlendes, Vorhandenes bleibt
  fs.rmSync(path.join(tmp, 'ablage', 'bilder', 'b.jpg'));
  fs.writeFileSync(path.join(tmp, 'ablage', 'bilder', 'andere.jpg'), 'vorhanden');
  await assert.rejects(bk.fillMissingFiles(small.id), /keine Bilder/);
  const fill = await bk.fillMissingFiles(full.id);
  assert.equal(fill.copied, 1);
  assert.equal(fs.readFileSync(path.join(tmp, 'ablage', 'bilder', 'b.jpg'), 'utf8'), 'ablage');
  assert.equal(fs.readFileSync(path.join(tmp, 'ablage', 'bilder', 'andere.jpg'), 'utf8'), 'vorhanden');
  assert.equal(bk.filesNote(), null);
  // Beschädigung erkannt
  const bytes = fs.readFileSync(file);
  bytes[bytes.length - 3000] ^= 0xff;
  fs.writeFileSync(file, bytes);
  assert.equal((await bk.verifyBackup(full.id)).ok, false);
  await assert.rejects(bk.restoreBackup(full.id, full.id), /beschädigt/);
  // Aufbewahrung: die neuesten 3 Sicherungen bleiben (keep = 3), egal welcher Art
  cfg.updateConfig({ backup: { keep: 3 } });
  for (let i = 0; i < 4; i++) await bk.createBackup('Aufbewahrung');
  const after2 = await bk.listBackups();
  assert.equal(after2.length, 3);
  assert.ok(after2.every((x) => x.kind === 'komplett' && x.reason === 'Aufbewahrung'));
  // Wiederherstellen der ältesten Sicherung bei knapper Aufbewahrung: die Sicherung selbst wird nicht weggeräumt
  cfg.updateConfig({ backup: { keep: 1 } });
  const alt = after2.at(-1);
  await bk.restoreBackup(alt.id, alt.id);
  assert.ok((await bk.listBackups()).some((x) => x.id === alt.id), 'wiederhergestellte Sicherung bleibt');
});

test('Zeitplan: verpasste Sicherungen werden als fällig erkannt', async () => {
  const noon = new Date(2026, 5, 10, 12, 0, 0); // Mittwoch
  assert.equal(bk.lastSlot('02:00', -1, noon).getHours(), 2);
  assert.equal(bk.lastSlot('02:00', -1, noon).getDate(), 10);
  assert.equal(bk.lastSlot('13:00', -1, noon).getDate(), 9, 'heute 13:00 liegt noch in der Zukunft');
  const sunday = bk.lastSlot('03:30', 0, noon);
  assert.equal(sunday.getDay(), 0);
  assert.ok(sunday < noon);
  // frisch gemacht → nicht fällig; „in 3 Tagen“ ist die letzte Sicherung älter als der letzte Zeitpunkt → nachholen
  assert.deepEqual(await bk.dueKinds(), [], 'eben gesichert');
  const due = await bk.dueKinds(new Date(Date.now() + 3 * 86400_000));
  assert.deepEqual(due.map((d) => d.kind), ['komplett'], 'verpasste Sicherung wird nachgeholt, immer vollständig');
});

test('Firewall und Dienstdateien', () => {
  assert.equal(FIREWALL_RULE(3001), 'Mosaik3LAB – Web-App (3001/TCP)');
  assert.match(windows.firewall.allowScript(3001), /-LocalPort 3001 -Action Allow -Profile Private,Domain/);
  assert.match(windows.firewall.removeScript(3001), /Where-Object DisplayName -eq 'Mosaik3LAB – Web-App \(3001\/TCP\)' \| Remove-NetFirewallRule/);
  assert.match(linux.firewall.allowScript(3001), /ufw allow 3001\/tcp/);
  const def = { key: 'webapp', id: 'mosaik3lab-webapp', title: 'Mosaik³LAB Web-App', node: 'node', args: ['a.mjs'], workDir: tmp, logDir: tmp, serviceDir: tmp, env: { MOSAIK3LAB_SERVICE: '1' }, wrapperExe: 'w.exe' };
  const xml = windows.services.files(def)[0].content;
  assert.match(xml, /<user>LocalService<\/user>/);
  assert.match(xml, /<onfailure action="restart"/);
  assert.match(windows.services.installScript(def), /sdset/);
  const unit = linux.services.files(def)[0].content;
  assert.match(unit, /User=mosaik3lab/);
  assert.match(unit, /Restart=on-failure/);
});

test('Programmsymbol: gültiges PNG und ICO', () => {
  assert.deepEqual([...icon.logoPng(32).subarray(1, 4)], [80, 78, 71]);
  const ico = icon.logoIco();
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 4);
});

test('Sicheres Löschen folgt keinen Verweisen', () => {
  const outside = path.join(tmp, 'aussen');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'wichtig.txt'), 'bleibt');
  const tree = path.join(tmp, 'baum', 'node_modules', '@x');
  fs.mkdirSync(tree, { recursive: true });
  (process.platform === 'win32' ? windows : linux).linkDir(outside, path.join(tree, 'link'));
  setup.removeTree(path.join(tmp, 'baum'));
  assert.ok(!fs.existsSync(path.join(tmp, 'baum')));
  assert.equal(fs.readFileSync(path.join(outside, 'wichtig.txt'), 'utf8'), 'bleibt');
});

test('Einrichtung: Probelauf ändert nichts', async () => {
  const programRoot = path.join(tmp, 'Programm');
  const dataRoot = path.join(tmp, 'Daten');
  const r = await setup.install({ programRoot, dataRoot, network: true }, () => {}, { dryRun: true });
  assert.ok(!fs.existsSync(programRoot) && !fs.existsSync(dataRoot), 'nichts angelegt');
  assert.match(r.steps.find((s) => s.id === 'firewall').command, /Mosaik3LAB – Web-App/);
  assert.ok(r.steps.every((s) => s.status !== 'fehler'));
});

test('Deinstallation entfernt genau, was im Manifest steht', async () => {
  const dataRoot = path.join(tmp, 'D');
  const programRoot = path.join(tmp, 'P');
  const shortcut = path.join(tmp, 'S', 'Mosaik³LAB öffnen.url');
  for (const d of [programRoot, path.join(dataRoot, 'storage'), path.dirname(shortcut)]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(shortcut, '[InternetShortcut]');
  setup.recordManifest({ type: 'folder', path: programRoot, role: 'program' }, true, dataRoot);
  setup.recordManifest({ type: 'folder', path: dataRoot, role: 'data' }, true, dataRoot);
  setup.recordManifest({ type: 'shortcut', path: shortcut }, true, dataRoot);
  const plan = await setup.uninstall({ dataRoot, managerDir: dataRoot, dryRun: true });
  assert.deepEqual(plan.folders, [programRoot]);
  assert.deepEqual(plan.keep, [dataRoot], 'Daten bleiben standardmäßig');
  await setup.uninstall({ dataRoot, managerDir: dataRoot });
  assert.ok(!fs.existsSync(programRoot) && !fs.existsSync(shortcut));
  assert.ok(fs.existsSync(path.join(dataRoot, 'storage')), 'Daten behalten');
  assert.ok(!fs.existsSync(path.join(dataRoot, 'install-manifest.json')));
});

// ---------- Update A → B (antwortet nicht) → Rollback; dann A → C ----------
function fakeRelease(dir, version, healthy) {
  fs.mkdirSync(path.join(dir, 'server'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version }));
  fs.writeFileSync(path.join(dir, 'server', 'app.js'), `require('http').createServer((q, s) => { s.statusCode = ${healthy ? 200 : 500}; s.end('{}'); }).listen(Number(process.env.API_PORT), '127.0.0.1');`);
}

test('Update: Health-Fehler → automatischer Rollback, danach erfolgreiches Update', async () => {
  const root = path.join(tmp, 'install');
  const port = await freePort();
  fakeRelease(path.join(root, 'releases', '1.0.0-a'), '1.0.0', true);
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
      proc = spawn(process.execPath, [path.join(root, 'current', 'server', 'app.js')], { env: { ...process.env, API_PORT: String(port) }, stdio: 'ignore' });
    },
    healthy,
  };
  const ctx = (version, ok) => ({
    root, services, healthMs: 5000, backup: async () => null, prepare: async () => {},
    check: async () => ({ installed: upd.currentRelease(root), available: { id: `${version}-x`, version, commit: version, changes: [] }, updateAvailable: true }),
    fetch: async (info, dest) => fakeRelease(dest, version, ok),
  });
  await services.startAll();
  assert.ok(await healthy(5000));
  const steps = [];
  const bad = await upd.installUpdate(ctx('1.1.0', false), (id, st) => steps.push(`${id}:${st}`));
  assert.equal(bad.rolledBack, true);
  assert.equal(upd.currentRelease(root).id, '1.0.0-a');
  assert.ok(steps.includes('health:fehler') && steps.includes('rollback:fertig'));
  assert.ok(await healthy(3000), 'alte Version läuft wieder');
  const good = await upd.installUpdate(ctx('1.2.0', true));
  assert.equal(good.ok, true);
  assert.equal(upd.currentRelease(root).id, '1.2.0-x');
  assert.equal(upd.previousRelease(root), '1.0.0-a');
  await services.stopAll();
});

test('Mail: Prüfung, Speicherung in der Datenbank für die App, Passwort nie zurückgegeben', () => {
  assert.throws(() => mail.saveMail({ enabled: true, host: '', from: '', recipients: [] }), /Zum Einschalten/);
  assert.throws(() => mail.saveMail({ host: 'smtp.schule.example', recipients: 'kein-mail' }), /Empfänger ungültig/);
  assert.throws(() => mail.saveMail({ host: 'smtp.schule.example', appBaseUrl: 'ftp://x' }), /http/);
  const saved = mail.saveMail({ enabled: true, host: 'smtp.schule.example', port: 587, user: 'lab', password: 'geheim', from: 'Mosaik³LAB <lab@schule.example>', recipients: 'a@schule.example, A@schule.example; b@schule.example', appBaseUrl: 'http://lab.local:3001/' });
  assert.equal(saved.passwordSet, true);
  assert.ok(!JSON.stringify(saved).includes('geheim'), 'Passwort nicht in der Antwort');
  const file = settingsdb.readBereich(cfg.resolvePaths().dbFile, 'mail');
  assert.deepEqual(Object.keys(file).sort(), ['appBaseUrl', 'enabled', 'erreichbarkeit', 'from', 'recipients', 'smtp']);
  assert.deepEqual(file.recipients, ['A@schule.example', 'b@schule.example'], 'doppelte Empfänger entfernt');
  assert.equal(file.appBaseUrl, 'http://lab.local:3001');
  // Links nur im Schulnetz: ohne Angabe „auto“, .local wird als Schulnetz erkannt
  assert.equal(file.erreichbarkeit, 'auto');
  assert.equal(saved.erreichbarkeit, 'auto');
  assert.deepEqual([saved.links.hinweis, saved.links.warnung], [true, '']);
  assert.throws(() => mail.saveMail({ ...saved, erreichbarkeit: 'irgendwo' }), /Erreichbarkeit/);
  const aussen = mail.saveMail({ ...saved, erreichbarkeit: 'oeffentlich' });
  assert.match(aussen.links.warnung, /Auch von außerhalb/, 'Widerspruch: .local ist keine öffentliche Adresse');
  assert.equal(mail.mailState().linkWarnung, aussen.links.warnung);
  mail.saveMail({ ...saved, password: '' });
  const nachher = settingsdb.readBereich(cfg.resolvePaths().dbFile, 'mail');
  assert.equal(nachher.smtp.pass, 'geheim', 'leeres Feld behält Passwort');
  assert.equal(nachher.erreichbarkeit, 'auto');
  // ältere Oberfläche/CLI ohne Feld: bisherigen Wert behalten
  mail.saveMail({ ...saved, erreichbarkeit: 'schulnetz' });
  const { erreichbarkeit: _weg, ...ohneFeld } = saved;
  mail.saveMail({ ...ohneFeld, password: '' });
  assert.equal(settingsdb.readBereich(cfg.resolvePaths().dbFile, 'mail').erreichbarkeit, 'schulnetz');
  mail.saveMail({ ...saved, password: '' });
  assert.equal(mail.mailState().configured, true);
});

test('Fehlerhafte Konfiguration sperrt Schreibaktionen (kein Ausweichen auf Standardordner)', async () => {
  const keep = fs.readFileSync(cfg.CONFIG_FILE);
  fs.writeFileSync(cfg.CONFIG_FILE, JSON.stringify({ paths: { backupDir: 'kaputt' } }));
  cfg.reloadConfig();
  try {
    await assert.rejects(bk.createBackup('test'), /gesperrt/);
    assert.throws(() => mail.saveMail({ host: 'x' }), /gesperrt/);
  } finally {
    fs.writeFileSync(cfg.CONFIG_FILE, keep);
    cfg.reloadConfig();
  }
});

test('Ablageordner: Prüfung beim Speichern, Waisen-Prüfung im doctor', async () => {
  const st = await import('../lib/status.mjs');
  const ablage = path.join(tmp, 'ablage-neu');
  const r = cfg.checkAblageDir(ablage);
  assert.ok(fs.existsSync(ablage), 'wird angelegt');
  assert.equal(r.files, 0);
  assert.ok(r.freeBytes === null || r.freeBytes > 0);
  assert.throws(() => cfg.checkAblageDir(path.join(tmp, 'eine-datei.txt', 'x')), /kann nicht angelegt/, (fs.writeFileSync(path.join(tmp, 'eine-datei.txt'), 'x'), undefined));
  assert.equal(st.ablageState(ablage).light, 'ok');
  assert.equal(st.ablageState(path.join(tmp, 'gibt-es-nicht')).light, 'warn');
  assert.equal(cfg.resolvePaths().ablageDir, path.join(tmp, 'ablage'), 'eingestellter Ablageordner gilt');

  // Waisen-Prüfung gegen eine kleine Datenbank (Tabelle datei wie in der App)
  const { DatabaseSync } = await import('node:sqlite');
  const dataDir = path.join(tmp, 'waisen-daten');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'mosaik3lab.db'));
  db.exec("CREATE TABLE datei (id TEXT PRIMARY KEY, pfad TEXT); INSERT INTO datei VALUES ('a', 'artikel/1/bild/a.png'), ('b', 'artikel/1/bild/b.png')");
  db.close();
  fs.mkdirSync(path.join(ablage, 'artikel', '1', 'bild'), { recursive: true });
  fs.writeFileSync(path.join(ablage, 'artikel', '1', 'bild', 'a.png'), 'x');
  fs.writeFileSync(path.join(ablage, 'artikel', '1', 'bild', 'waise.png'), 'x');
  const o = await st.ablageOrphans({ dataDir, ablageDir: ablage });
  assert.deepEqual(o, { total: 2, missing: ['artikel/1/bild/b.png'], extra: ['artikel/1/bild/waise.png'] });
  assert.equal(await st.ablageOrphans({ dataDir: path.join(tmp, 'ohne-db'), ablageDir: ablage }), null);
  assert.equal(cfg.countFiles(ablage), 2);
});
