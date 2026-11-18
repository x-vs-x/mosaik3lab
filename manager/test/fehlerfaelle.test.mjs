// Ausnahmefälle bei Sicherung, Wiederherstellen und Update – Fehler werden gezielt nachgestellt (Funktionen ersetzt), es
// laufen keine Dienste und nichts wird installiert. Testdaten unter C:\Entwicklung\_testdaten\server-manager\ (bzw.
// MOSAIK3LAB_TESTDATEN), werden danach gelöscht.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const TESTROOT = process.env.MOSAIK3LAB_TESTDATEN ?? path.resolve(ROOT, '..', '_testdaten', 'server-manager');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'fehler-')));
const daten = path.join(tmp, 'daten');
fs.writeFileSync(path.join(tmp, 'mosaik3lab.json'), JSON.stringify({ dataDir: daten, managerPort: 5197 }));
process.env.MANAGER_CONFIG = path.join(tmp, 'mosaik3lab.json');
process.env.MOSAIK3LAB_ROOT = tmp; // Standardordner der Arbeitskopie nie unter C:\Mosaik3LAB
process.env.MOSAIK3LAB_QUIET = '1';

const cfg = await import('../lib/config.mjs');
const bk = await import('../lib/backup.mjs');
const pu = await import('../lib/paketupdate.mjs');
const rel = await import('../lib/releases.mjs');
const { removeTree } = await import('../lib/dateien.mjs');
const { packTar, unpackTar } = await import('../lib/tar.mjs');
const { wrapperScript } = await import('../lib/runtime.mjs');
const { platform, linux, SERVICE_IDS } = await import('../platform/index.mjs');
const { sdQuote } = await import('../platform/linux.mjs');

const backups = path.join(tmp, 'backups');
cfg.updateConfig({ paths: { ablageDir: path.join(tmp, 'ablage'), backupDir: backups, logDir: path.join(tmp, 'logs') }, backup: { keep: 1, encrypt: false } });
fs.mkdirSync(path.join(daten, 'data'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'ablage'), { recursive: true });
const datei = path.join(daten, 'data', 'stand.json');
fs.writeFileSync(datei, 'A');

after(() => removeTree(tmp));
const ids = async () => (await bk.listBackups()).map((b) => b.id).sort();
const wait = () => new Promise((r) => setTimeout(r, 1100)); // eine Sekunde: Sicherungen bekommen eigene Zeitstempel

// ---------- M1: Aufräumen alter Sicherungen scheitert ----------
test('Sicherung: scheitert das Aufräumen alter Sicherungen, bleibt die neue gültig und wird gemeldet', async () => {
  const r = await bk.createBackup('manuell', { aufraeumen: async () => { throw Object.assign(new Error('EBUSY: Datei gesperrt'), { code: 'EBUSY' }); } });
  assert.equal(r.verified, true);
  assert.ok(fs.existsSync(path.join(backups, `${r.id}.m3lbackup`)), 'neue Sicherung liegt noch da');
  assert.equal((await bk.verifyBackup(r.id)).ok, true, 'und ist in Ordnung');
  for (const id of await ids()) fs.rmSync(path.join(backups, `${id}.m3lbackup`));
});

// ---------- M24: „vor Update“ bleibt immer ----------
test('Aufbewahrung: keep = 1, vier Sicherungen, davon eine „vor Update“ → die neueste und die „vor Update“ bleiben', async () => {
  const vorUpdate = await bk.createBackup('vor Update auf 9.9.9');
  for (let i = 0; i < 3; i++) {
    await wait();
    await bk.createBackup('manuell');
  }
  const rest = await ids();
  assert.equal(rest.length, 2, rest.join(', '));
  assert.ok(rest.includes(vorUpdate.id), 'Sicherung vor dem Update bleibt');
  for (const id of rest) fs.rmSync(path.join(backups, `${id}.m3lbackup`));
});

// ---------- M8: Wiederherstellen scheitert mittendrin ----------
test('Wiederherstellen: scheitert es mittendrin, kommt der Stand von direkt davor automatisch zurück', async () => {
  fs.writeFileSync(datei, 'A');
  const alt = await bk.createBackup('manuell');
  await wait();
  fs.writeFileSync(datei, 'B'); // aktueller Stand, der erhalten bleiben muss
  const halb = async ({ dirs }) => {
    fs.rmSync(path.join(dirs.dataDir, 'data'), { recursive: true, force: true }); // schon gelöscht …
    throw Object.assign(new Error('ENOSPC: Datenträger voll'), { code: 'ENOSPC' }); // … dann voll
  };
  await assert.rejects(() => bk.restoreBackup(alt.id, alt.id, { anwenden: halb }), /ENOSPC.*automatisch zurückgespielt/);
  assert.equal(fs.readFileSync(datei, 'utf8'), 'B', 'Stand von vor dem Wiederherstellen ist wieder da');

  // Prüfung findet Abweichungen → ebenfalls zurück
  await assert.rejects(() => bk.restoreBackup(alt.id, alt.id, { anwenden: async () => ['abweichend: data/stand.json'] }), /unvollständig.*automatisch zurückgespielt/);
  assert.equal(fs.readFileSync(datei, 'utf8'), 'B');

  // ohne Fehler wie bisher
  const ok = await bk.restoreBackup(alt.id, alt.id);
  assert.equal(ok.restored, alt.id);
  assert.equal(fs.readFileSync(datei, 'utf8'), 'A');
});

// ---------- M9: Namen in der Sicherung ----------
async function namenPruefen(name) {
  const data = Buffer.from('x');
  const chunks = [];
  for await (const c of packTar([{ name, size: 1, data }])) chunks.push(c);
  const seen = [];
  await unpackTar(Readable.from(chunks), async (n) => (seen.push(n), null));
  return seen;
}
test('Auspacken: Namen mit .. – auch mit \\ als Trenner – und absolute Pfade werden abgelehnt', async () => {
  for (const bad of ['ablage\\..\\..\\x.txt', '..\\x.txt', '\\x.txt', 'ablage/../../x.txt', '/etc/x', 'C:/x.txt']) {
    await assert.rejects(() => namenPruefen(bad), /Ungültiger Name/, bad);
  }
  assert.deepEqual(await namenPruefen('ablage/bilder/a b.jpg'), ['ablage/bilder/a b.jpg']);
  assert.deepEqual(await namenPruefen('ablage/x..y.jpg'), ['ablage/x..y.jpg'], '„..“ im Dateinamen ist erlaubt');
});

// ---------- M2: Umschalten scheitert ----------
function programmordner(name, versionen) {
  const root = path.join(tmp, name);
  for (const v of versionen) fs.mkdirSync(path.join(root, 'releases', v), { recursive: true });
  return root;
}
test('Umschalten scheitert nach dem Entfernen des Verweises: „current“ zeigt wieder auf die bisherige Version, Dienste laufen wieder', async () => {
  const root = programmordner('umschalten', ['v1', 'v2']);
  rel.switchCurrent(root, 'v1');
  let gestartet = 0;
  const warnungen = [];
  const kaputt = (r, id) => {
    if (id === 'v2') {
      platform.unlinkDir(path.join(r, 'current')); // Verweis weg …
      throw new Error('EPERM: Verweis kann nicht angelegt werden'); // … neuer nicht da
    }
    return rel.switchCurrent(r, id);
  };
  await assert.rejects(() => pu.umschalten({ programRoot: root, id: 'v2', previous: 'v1' }, { switchCurrent: kaputt, start: async () => gestartet++, warn: (t) => warnungen.push(t) }), /EPERM/);
  assert.equal(rel.currentRelease(root)?.id, 'v1', '„current“ zeigt wieder auf v1');
  assert.equal(gestartet, 1, 'gestoppte Dienste wieder gestartet');
  assert.deepEqual(warnungen, []);
});

test('Umschalten: „current“ ist kein Verweis → nichts verändert, Dienste laufen wieder; Fehler beim Starten wird nur gemeldet', async () => {
  const root = programmordner('kein-verweis', ['v2']);
  fs.mkdirSync(path.join(root, 'current'));
  fs.writeFileSync(path.join(root, 'current', 'merker.txt'), 'bleibt');
  const warnungen = [];
  await assert.rejects(() => pu.umschalten({ programRoot: root, id: 'v2', previous: 'current' }, { start: async () => { throw new Error('Dienst startet nicht'); }, warn: (t) => warnungen.push(t) }), /kein Verweis/);
  assert.equal(fs.readFileSync(path.join(root, 'current', 'merker.txt'), 'utf8'), 'bleibt');
  assert.match(warnungen.join(' '), /Dienste konnten nicht wieder gestartet werden/);
});

test('Umschalten gelingt: „current“ auf die neue Version, Verlauf geführt, keine Dienste gestartet', async () => {
  const root = programmordner('gelingt', ['v1', 'v2']);
  rel.switchCurrent(root, 'v1');
  let gestartet = 0;
  await pu.umschalten({ programRoot: root, id: 'v2', previous: 'v1' }, { start: async () => gestartet++ });
  assert.equal(rel.currentRelease(root).id, 'v2');
  assert.equal(rel.previousRelease(root), 'v1');
  assert.equal(gestartet, 0, 'die Einrichtung startet die Dienste später selbst');
});

// ---------- M3: Aufräumen alter Versionen scheitert ----------
test('Nach dem Update: scheitert das Löschen alter Versionen, gilt das Update trotzdem als gelungen', () => {
  const warnungen = [];
  assert.equal(pu.alteVersionenEntfernen('egal', () => { throw new Error('EBUSY: Ordner in Benutzung'); }, (t) => warnungen.push(t)), false);
  assert.match(warnungen[0], /EBUSY.*trotzdem fertig/);

  const root = programmordner('aufraeumen', ['v1', 'v2', 'v3']);
  rel.switchCurrent(root, 'v1');
  rel.switchCurrent(root, 'v2');
  rel.switchCurrent(root, 'v3');
  assert.equal(pu.alteVersionenEntfernen(root, rel.prune), true);
  assert.deepEqual(fs.readdirSync(path.join(root, 'releases')).sort(), ['history.json', 'v2', 'v3'], 'aktuelle + vorige bleiben');
});

// ---------- M7: WinSW in allen Diensten ----------
test('Dienst-Wrapper: ersetzt WinSW in allen fünf Diensten, nur wo es die .exe gibt, Pfade maskiert', () => {
  const s = wrapperScript("C:\\Program Files\\Mosaik3LAB\\O'Brien", '2.12.0');
  const zeilen = s.split('\n');
  assert.equal(zeilen.length, Object.keys(SERVICE_IDS).length);
  for (const id of Object.values(SERVICE_IDS)) assert.ok(zeilen.some((z) => z.includes(`${id}.exe`)), id);
  for (const z of zeilen) assert.match(z, /^if \(Test-Path '.*'\) \{ .*Copy-Item -Force '.*WinSW-2\.12\.0\.exe' '.*' \}$/);
  assert.match(s, /O''Brien/, 'Apostroph für PowerShell verdoppelt');
});

// ---------- M10: Pfade mit Leerzeichen in systemd-Units ----------
test('systemd-Units: Pfade mit Leerzeichen bleiben ein Argument, Sonderzeichen maskiert', () => {
  const def = { key: 'webapp', id: 'mosaik3lab-webapp', title: 'Web-App', node: '/opt/mein programm/current/node/node', args: ['/opt/mein programm/current/manager/runners/webapp.mjs', '--config', '/srv/mein ordner/mosaik3lab.json'], workDir: '/opt/mein programm/current', logDir: '/tmp', serviceDir: '/tmp', env: { MANAGER_CONFIG: '/srv/mein ordner/mosaik3lab.json' } };
  const unit = linux.services.files(def)[0].content;
  assert.match(unit, /^ExecStart="\/opt\/mein programm\/current\/node\/node" "\/opt\/mein programm\/current\/manager\/runners\/webapp\.mjs" "--config" "\/srv\/mein ordner\/mosaik3lab\.json"$/m);
  assert.match(unit, /^Environment="MANAGER_CONFIG=\/srv\/mein ordner\/mosaik3lab\.json"$/m);
  const helfer = linux.services.files({ ...def, key: 'updater', id: 'mosaik3lab-updater' })[0].content;
  assert.match(helfer, /^ExecStart="\/opt\/mein programm\/current\/node\/node" /m);
  assert.equal(sdQuote('a"b\\c 50%'), '"a\\"b\\\\c 50%%"');
  // .desktop-Datei: Pfad in Anführungszeichen (unter Linux mit /; der Test läuft auch unter Windows)
  assert.match(linux.launcher('/opt/mein programm/current').args, /^"[^"]*mein programm[^"]*mosaik3lab.sh"$/);
  assert.match(linux.launcher('/opt/x', 'uninstall').args, /^".*mosaik3lab.sh" uninstall$/);
  if (process.platform !== 'win32') assert.equal(linux.launcher('/opt/mein programm/current').args, '"/opt/mein programm/current/manager/mosaik3lab.sh"');
});

// ---------- M11: ein Ort für backup.key ----------
test('Backup-Passwort: Pfad an einer Stelle (neben der Startdatei)', () => {
  const l = cfg.layout({ programRoot: path.join(tmp, 'p'), dataRoot: path.join(tmp, 'd') });
  assert.equal(l.keyFile, path.join(path.dirname(l.configFile), 'backup.key'));
  assert.equal(cfg.resolvePaths().keyFile, path.join(tmp, 'backup.key'));
});

// ---------- M5: Kommandozeile „update“ ----------
test('cli update in der Arbeitskopie: klare Meldung statt Git (kein Git-Update mehr)', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'manager', 'cli.mjs'), 'update', 'check', '--manager-config', process.env.MANAGER_CONFIG], { encoding: 'utf8', env: { ...process.env } });
  assert.equal(r.status, 4, r.stderr);
  assert.match(r.stderr, /Installer-Paket.*git pull/);
});
