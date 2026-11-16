// Einmalige Übernahme der Altdateien in die Datenbank: manager.config.json (altes Format), mail.json, .session-secret.
// Testdaten: C:\Entwicklung\_testdaten\server-manager\ (nicht im Temp-Verzeichnis).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TESTROOT = path.resolve(import.meta.dirname, '..', '..', '..', '_testdaten', 'server-manager');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'migration-')));
const storage = path.join(tmp, 'storage');
const legacyConfig = path.join(tmp, 'manager.config.json');
const secret = 'f'.repeat(64);
fs.mkdirSync(path.join(storage, 'config'), { recursive: true });
fs.mkdirSync(path.join(storage, 'data'), { recursive: true });
fs.writeFileSync(legacyConfig, JSON.stringify({
  manager: { port: 5199, passwordHash: 'scrypt$salz$hash' },
  app: { port: 3044, network: true, demoAccounts: false, sessionSecret: secret },
  paths: { dataDir: storage, ablageDir: path.join(tmp, 'ablage'), backupDir: path.join(tmp, 'backups'), logDir: path.join(tmp, 'logs') },
  backup: { time: '01:30', keep: 5 },
  update: { repo: 'https://example.invalid/r.git', branch: 'dev' },
}));
const mailJson = { enabled: true, smtp: { host: 'smtp.alt.example', port: 587, secure: false, user: 'u', pass: 'Alt-Passwort-1' }, from: 'a@alt.example', recipients: ['x@alt.example'], appBaseUrl: '' };
fs.writeFileSync(path.join(storage, 'config', 'mail.json'), JSON.stringify(mailJson));
process.env.MANAGER_CONFIG = legacyConfig;
process.env.MOSAIK3LAB_QUIET = '1';

const cfg = await import('../lib/config.mjs');
const sdb = await import('../lib/settingsdb.mjs');
const setup = await import('../lib/setup.mjs');
after(() => setup.removeTree(tmp));

test('Altes Konfigurationsformat und Mail-Datei landen in der Datenbank, Dateien werden .bak', () => {
  const c = cfg.getConfig();
  assert.equal(cfg.configErrors().length, 0, cfg.configErrors().join());
  assert.deepEqual([c.app.port, c.app.network, c.manager.port, c.backup.time, c.backup.keep, c.update.branch], [3044, true, 5199, '01:30', 5, 'dev']);
  assert.equal(c.manager.passwordHash, undefined, 'eigenes Manager-Passwort gibt es nicht mehr (Admin-Konto der App)');
  assert.equal(sdb.readAll(path.join(storage, 'mosaik3lab.db')).manager['manager.passwordHash'], undefined, 'auch nicht in der Datenbank');
  assert.equal(c.backup.encrypt, false, 'bestehende Installationen bleiben unverschlüsselt, bis ein Passwort gesetzt wird');
  const db = sdb.readAll(path.join(storage, 'mosaik3lab.db'));
  assert.equal(db.betrieb['app.port'], 3044);
  assert.equal(db.betrieb.sessionSecret, secret, 'Session-Geheimnis aus der alten Konfiguration');
  assert.deepEqual(db.mail, mailJson);
  assert.equal(JSON.parse(fs.readFileSync(legacyConfig, 'utf8')).managerPort, 5199);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(legacyConfig, 'utf8'))).sort(), ['dataDir', 'managerPort']);
  const names = [...fs.readdirSync(tmp), ...fs.readdirSync(path.join(storage, 'config'))];
  assert.ok(names.some((n) => /^manager\.config\.json\.vor-datenbank-.*\.bak$/.test(n)), names.join());
  assert.ok(names.some((n) => /^mail\.json\.vor-datenbank-.*\.bak$/.test(n)) && !names.includes('mail.json'));
});

test('Zweites Laden übernimmt nichts mehr und ändert nichts', () => {
  const before = fs.readdirSync(tmp).length + fs.readdirSync(path.join(storage, 'config')).length;
  cfg.reloadConfig();
  assert.deepEqual(cfg.migrationLog(), []);
  assert.equal(fs.readdirSync(tmp).length + fs.readdirSync(path.join(storage, 'config')).length, before);
  assert.equal(cfg.getConfig().app.port, 3044);
});

test('Defekte Datenbank-Einstellungen: Standardwerte + Fehlermeldung, Schreibaktionen gesperrt', () => {
  sdb.writeBereich(path.join(storage, 'mosaik3lab.db'), 'betrieb', { 'app.port': 80 });
  cfg.reloadConfig();
  assert.equal(cfg.getConfig().app.port, 3001, 'Standardwerte');
  assert.match(cfg.configErrors()[0], /1024/);
  assert.throws(() => cfg.requireValidConfig(), /gesperrt/);
  cfg.updateConfig({ app: { port: 3044 } }); // Reparieren durch Speichern
  assert.equal(cfg.configErrors().length, 0);
});
