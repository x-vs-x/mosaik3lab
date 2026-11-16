// Einstellungen in der Datenbank + Sicherungsdatei: Änderungen → Backup (vollständig, verschlüsselt; ältere Art „daten“ bleibt lesbar) → frische Einrichtung
// „aus Backup“ → alles identisch; Bilder fehlen mit Hinweis und lassen sich aus einer „Komplett“-Sicherung nachholen.
// Dienste/Firewall werden nur angezeigt (systemDryRun), keine echten winget/apt-Aufrufe. Testdaten:
// C:\Entwicklung\_testdaten\server-manager\ (nicht im Temp-Verzeichnis).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const TESTROOT = path.resolve(ROOT, '..', '_testdaten', 'server-manager');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'einst-')));
const A = path.join(tmp, 'a');
const B = path.join(tmp, 'b');
const startA = path.join(A, 'mosaik3lab.json');
fs.mkdirSync(A, { recursive: true });
fs.writeFileSync(startA, JSON.stringify({ dataDir: path.join(A, 'storage'), managerPort: 5195 }));
process.env.MANAGER_CONFIG = startA;
process.env.MOSAIK3LAB_QUIET = '1';

const cfg = await import('../lib/config.mjs');
const sdb = await import('../lib/settingsdb.mjs');
const mail = await import('../lib/mail.mjs');
const bk = await import('../lib/backup.mjs');
const crypto = await import('../lib/backupcrypto.mjs');
const setup = await import('../lib/setup.mjs');
const transfer = await import('../lib/transfer.mjs');
const { reconcile } = await import('../lib/reconcile.mjs');
const portalcert = await import('../lib/portalcert.mjs');

after(() => setup.removeTree(tmp));
const BACKUP_PW = 'Backup-Pass-123';
const dbFileA = path.join(A, 'storage', 'mosaik3lab.db');
const cli = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'manager', 'cli.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, MOSAIK3LAB_QUIET: '1' } });
const rows = (file, sql) => {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
};
/** Alle Tabellen mit Inhalt (ohne flüchtige Sitzungen) – zum Vergleich zweier Datenbanken. */
const dump = (file) => {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const out = {};
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'sitzung' ORDER BY name").all()) {
      out[name] = db.prepare(`SELECT * FROM "${name}"`).all().map((r) => JSON.stringify(r)).sort();
    }
    return out;
  } finally {
    db.close();
  }
};

let komplett;
let daten;
let original;

test('Einstellungen ändern: alles landet in der Datenbank, Startdatei bleibt winzig', async () => {
  cfg.updateConfig({
    app: { port: 3055, network: true, demoAccounts: true },
    portal: { enabled: true, basePath: '/schule/3d', httpPort: 8081, httpsPort: 8444, https: true },
    manager: { port: 5196 },
    paths: { ablageDir: path.join(A, 'ablage'), backupDir: path.join(A, 'backups'), logDir: path.join(A, 'logs') },
    backup: { time: '03:15', keep: 7, encrypt: true, full: { enabled: true, time: '04:45', weekday: 6, keep: 2 } },
    update: { repo: 'https://example.invalid/mosaik3lab.git', branch: 'release', gitPath: path.join(A, 'tools', 'git.exe') },
  });
  await portalcert.generateCert(); // HTTPS-Zertifikat (liegt in der Datenbank → im Backup)
  mail.saveMail({ enabled: true, host: 'smtp.schule.example', port: 465, secure: true, user: 'lab', password: 'Smtp-Geheim-9', from: 'Mosaik³LAB <lab@schule.example>', recipients: 'a@schule.example, b@schule.example', appBaseUrl: 'http://lab.example:3055' });
  const start = JSON.parse(fs.readFileSync(startA, 'utf8'));
  assert.deepEqual(Object.keys(start).sort(), ['dataDir', 'managerPort']);
  assert.equal(start.managerPort, 5196);
  const all = sdb.readAll(dbFileA);
  assert.equal(all.betrieb['app.port'], 3055);
  assert.deepEqual(all.betrieb['backup.full'], { enabled: true, time: '04:45', weekday: 6, keep: 2 });
  assert.deepEqual([all.betrieb['portal.enabled'], all.betrieb['portal.basePath'], all.betrieb['portal.httpPort'], all.betrieb['portal.httpsPort'], all.betrieb['portal.https']], [true, '/mosaik3lab', 8081, 8444, true], 'Pfad mit Portal fest – ein anderer (z. B. aus alter Einrichtung) wird ersetzt');
  assert.ok(all.betrieb['portal.cert'], 'Zertifikat in der Datenbank');
  assert.equal(all.mail.smtp.pass, 'Smtp-Geheim-9');
  assert.equal(all.manager['manager.port'], 5196);
  original = structuredClone(cfg.getConfig());
});

test('Testmail: bösartige Adresse wird abgelehnt, nie als Befehl ausgeführt (W14)', async () => {
  const marker = path.join(tmp, 'ausgefuehrt.txt');
  for (const evil of [`x@y.de & echo hi > "${marker}"`, 'x@y.de | calc', 'x@y.de; touch x', 'x@y.de`id`', '$(id)@y.de', 'x@y.de" --db "C:\\x']) {
    await assert.rejects(() => mail.sendTestMail(evil), /Ungültige Adresse/, evil);
  }
  assert.ok(!fs.existsSync(marker));
  assert.throws(() => mail.saveMail({ host: 'smtp.schule.de', from: 'a@b.de', recipients: 'a@b.de&calc' }), /Empfänger ungültig/);
});

test('Backup: Standard = vollständig (mit Ablage), je EINE Datei, verschlüsselt; ältere Art „daten“ lesbar; falsches Passwort wird sauber abgelehnt', async () => {
  // App-Datenbank (alle Migrationen) mit Benutzer, Rechten, Domains, Datei-Zeile + Ablage-Datei, dann sichern
  const r = spawnSync(process.execPath, ['--import', 'tsx', path.join(ROOT, 'manager', 'test', 'helpers', 'app-db.ts'), dbFileA], { cwd: path.join(ROOT, 'server'), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  fs.mkdirSync(path.join(A, 'ablage', 'artikel', 'x', 'bild'), { recursive: true });
  fs.writeFileSync(path.join(A, 'ablage', 'artikel', 'x', 'bild', 'f.jpg'), 'BILDINHALT');
  crypto.saveBackupPassword(BACKUP_PW);
  daten = await bk.createBackup('Test', { kind: 'daten' }); // so sahen die täglichen Sicherungen bisher aus
  komplett = await bk.createBackup('Test');
  assert.deepEqual([daten.encrypted, komplett.encrypted, daten.kind, komplett.kind], [true, true, 'daten', 'komplett']);
  const fileD = path.join(A, 'backups', `${daten.id}.m3lbackup`);
  const fileK = path.join(A, 'backups', `${komplett.id}.m3lbackup`);
  assert.ok(fs.statSync(fileD).isFile() && fs.statSync(fileK).isFile(), 'je eine Datei');
  assert.ok(fs.statSync(fileD).size < fs.statSync(fileK).size, 'die ältere Art „daten“ ist die kleinere (ohne Ablage)');
  for (const f of [fileD, fileK]) {
    const bytes = fs.readFileSync(f);
    assert.ok(!bytes.includes('Smtp-Geheim-9') && !bytes.includes('SQLite format 3') && !bytes.includes('BILDINHALT'), 'nichts im Klartext');
  }
  const head = (await bk.listBackups()).find((x) => x.id === komplett.id);
  assert.deepEqual([head.kind, head.encrypted, head.app.version !== undefined, head.schemaVersion >= 6], ['komplett', true, true, true], JSON.stringify(head));
  assert.equal((await bk.verifyBackup(daten.id)).ok, true);
  const before = fs.statSync(dbFileA).mtimeMs;
  await assert.rejects(() => bk.restoreBackup(daten.id, daten.id, { password: 'falsch-falsch' }), /Falsches Backup-Passwort/);
  assert.equal(fs.statSync(dbFileA).mtimeMs, before, 'Datenbank unverändert');

  // Zeitplan: täglich vollständig; ausgeschaltet → nichts fällig, keine nächste Zeit
  const morgen = new Date(Date.now() + 86400_000);
  assert.deepEqual((await bk.dueKinds(morgen)).map((d) => d.kind), ['komplett']);
  assert.ok(bk.nextBackupTime() instanceof Date);
  cfg.updateConfig({ backup: { enabled: false } });
  assert.deepEqual(await bk.dueKinds(morgen), []);
  assert.equal(bk.nextBackupTime(), null);
  cfg.updateConfig({ backup: { enabled: true } });
  original = structuredClone(cfg.getConfig());
});

test('Einrichten aus Backup: Ordner, die nicht passen, führen zur Rückfrage (mit Vorschlag) statt zum Raten', async () => {
  const input = { programRoot: path.join(B, 'programm'), dataRoot: path.join(B, 'root'), fromBackup: { dir: path.join(A, 'backups', `${komplett.id}.m3lbackup`), password: BACKUP_PW }, systemDryRun: true, skipBuild: true, shortcuts: false, services: false };
  // Die Ablage aus der Sicherung (…/a/ablage) enthält schon Dateien → Rückfrage, keine fremden Dateien überschreiben
  await assert.rejects(() => setup.install(input, () => {}), (err) => {
    const n = err.needsInput?.find((x) => x.key === 'ablageDir');
    assert.ok(n?.suggestion, JSON.stringify(err.needsInput));
    return /passen nicht/.test(err.message);
  });
  await assert.rejects(() => setup.install({ ...input, fromBackup: { ...input.fromBackup, password: 'falsch-falsch' } }, () => {}), /Falsches Backup-Passwort/);
});

test('Leeres System aus älterer „daten“-Sicherung: alles identisch, Bilder fehlen mit Hinweis, vollständige Sicherung holt sie nach', async () => {
  const paths = { ablageDir: path.join(B, 'ablage'), backupDir: path.join(B, 'backups'), logDir: path.join(B, 'logs') };
  const steps = [];
  const result = await setup.install(
    { programRoot: path.join(B, 'programm'), dataRoot: path.join(B, 'root'), fromBackup: { dir: path.join(A, 'backups', `${daten.id}.m3lbackup`), password: BACKUP_PW, paths }, systemDryRun: true, skipBuild: true, shortcuts: false },
    (id, status, detail) => steps.push({ id, status, detail }),
  );
  const st = (id) => steps.filter((s) => s.id === id).at(-1);
  assert.equal(st('restore').status, 'fertig', JSON.stringify(st('restore')));
  assert.match(st('restore').detail, /Bilder fehlen zunächst/);
  const fw = result.steps.find((s) => s.id === 'firewall');
  assert.equal(fw.status, 'geplant', 'Firewall nur angezeigt');
  assert.match(fw.command, /8081/, 'Regel für den Portal-Port aus der Datenbank');
  assert.match(fw.command, /8444/, 'bei HTTPS auch der HTTPS-Port');
  assert.ok(!/3055/.test(fw.command), 'der interne App-Port wird nicht freigegeben');
  assert.equal(result.steps.find((s) => s.id === 'services').status, 'geplant');
  assert.equal(result.backupPassword, null, 'kein neues Passwort erzeugt – das alte gilt weiter');

  const startB = path.join(B, 'root', 'mosaik3lab.json');
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(startB, 'utf8'))).sort(), ['dataDir', 'managerPort']);
  const out = cli('config', '--json', '--manager-config', startB);
  assert.equal(out.status, 0, out.stderr);
  const got = JSON.parse(out.stdout).config;
  assert.equal(got.app.port, 3055);
  assert.equal(got.app.network, true);
  assert.equal(got.app.demoAccounts, true);
  assert.equal(got.manager.port, 5196);
  assert.deepEqual(got.backup, original.backup, 'Zeitplan, Aufbewahrung, Verschlüsselung');
  assert.deepEqual(got.update, original.update);
  assert.deepEqual(got.portal, original.portal, 'Portal: Pfad, Ports, HTTPS wie in der Sicherung');
  assert.deepEqual({ ablageDir: got.paths.ablageDir, backupDir: got.paths.backupDir, logDir: got.paths.logDir }, paths, 'abweichende Ordner wie angegeben');

  // Die ganze Datenbank ist identisch: Einstellungen, Mail inkl. Passwort, Benutzer (= Anmeldung am Manager), Rechte, Domains …
  const dbFileB = path.join(B, 'root', 'daten', 'mosaik3lab.db');
  assert.deepEqual(dump(dbFileB), { ...dump(dbFileA), betrieb_einstellung: dump(dbFileB).betrieb_einstellung }, 'alle Tabellen gleich');
  const a = sdb.readAll(dbFileA);
  const b = sdb.readAll(dbFileB);
  assert.deepEqual(b.mail, a.mail);
  assert.equal(b.mail.smtp.pass, 'Smtp-Geheim-9');
  assert.deepEqual(b.betrieb['portal.cert'], a.betrieb['portal.cert'], 'HTTPS-Zertifikat identisch');
  assert.equal(rows(dbFileB, 'SELECT COUNT(*) AS n FROM benutzer_recht')[0].n, 1);
  assert.equal(fs.readFileSync(path.join(B, 'root', 'backup.key'), 'utf8').trim(), BACKUP_PW, 'geplante Sicherungen laufen weiter');

  // Bilder fehlen: Datensatz bleibt, der doctor meldet es als Hinweis (nicht als Fehler)
  assert.ok(!fs.existsSync(path.join(B, 'ablage', 'artikel', 'x', 'bild', 'f.jpg')));
  assert.equal(rows(dbFileB, 'SELECT COUNT(*) AS n FROM datei')[0].n, 1, 'Datensatz bleibt erhalten');
  const orphan = (j) => j.items.find((i) => i.title === 'Ablage ↔ Datenbank');
  const d1 = JSON.parse(cli('doctor', '--json', '--manager-config', startB).stdout);
  assert.equal(orphan(d1).light, 'info', JSON.stringify(orphan(d1)));
  assert.match(orphan(d1).value, /Backup ohne Dateien/);

  // Später: aus einer vollständigen Sicherung nur Fehlendes nachholen
  fs.mkdirSync(path.join(B, 'backups'), { recursive: true });
  fs.copyFileSync(path.join(A, 'backups', `${komplett.id}.m3lbackup`), path.join(B, 'backups', `${komplett.id}.m3lbackup`));
  const fill = cli('backup', 'fill-files', komplett.id, '--json', '--manager-config', startB);
  assert.equal(fill.status, 0, fill.stderr + fill.stdout);
  assert.equal(JSON.parse(fill.stdout).copied, 1);
  assert.equal(fs.readFileSync(path.join(B, 'ablage', 'artikel', 'x', 'bild', 'f.jpg'), 'utf8'), 'BILDINHALT');
  const d2 = JSON.parse(cli('doctor', '--json', '--manager-config', startB).stdout);
  assert.equal(orphan(d2).light, 'ok');
  const m = JSON.parse(cli('mail', '--json', '--manager-config', startB).stdout);
  assert.equal(m.host, 'smtp.schule.example');
  assert.equal(m.passwordSet, true);
  assert.deepEqual(m.recipients, ['a@schule.example', 'b@schule.example']);
});

test('Datenbestand übertragen (K5): Datenbank, Dateien und Ablage kommen mit, Anzahlen werden verglichen', async () => {
  const src = path.join(tmp, 'alt');
  const dst = path.join(tmp, 'neu', 'daten');
  const r = spawnSync(process.execPath, ['--import', 'tsx', path.join(ROOT, 'manager', 'test', 'helpers', 'app-db.ts'), path.join(src, 'mosaik3lab.db')], { cwd: path.join(ROOT, 'server'), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  fs.mkdirSync(path.join(src, 'data'), { recursive: true });
  fs.writeFileSync(path.join(src, 'data', 'items.json'), '["alt"]');
  fs.writeFileSync(path.join(src, 'data', '.lock'), '1');
  const t = await transfer.transferData({ from: src, to: dst, programDir: ROOT });
  assert.ok(t.tables > 5 && t.rows >= 5, JSON.stringify(t));
  assert.deepEqual(dump(path.join(dst, 'mosaik3lab.db')), dump(path.join(src, 'mosaik3lab.db')));
  assert.equal(fs.readFileSync(path.join(dst, 'data', 'items.json'), 'utf8'), '["alt"]');
  assert.ok(!fs.existsSync(path.join(dst, 'data', '.lock')), 'Sperrdatei bleibt zurück');
  await assert.rejects(() => transfer.transferData({ from: src, to: dst, programDir: ROOT }), /schon eine Datenbank/);

  // Einrichten mit vorhandenen Daten übernimmt Datenbank UND Ablage (nicht nur data/ und uploads/)
  fs.mkdirSync(path.join(tmp, 'altablage', 'artikel', 'x', 'bild'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'altablage', 'artikel', 'x', 'bild', 'f.jpg'), 'BILDINHALT');
  const C = path.join(tmp, 'c');
  const res = await setup.install({ programRoot: path.join(C, 'programm'), dataRoot: path.join(C, 'root'), password: 'Neues-Passwort-1', dataFrom: src, ablageFrom: path.join(tmp, 'altablage'), systemDryRun: true, skipBuild: true, shortcuts: false, services: false, backupEncrypt: false }, () => {});
  assert.match(res.steps.find((s) => s.id === 'config').detail, /Daten übernommen \(\d+ Tabellen, \d+ Zeilen, 1 Dateien der Ablage/);
  assert.deepEqual(rows(path.join(C, 'root', 'daten', 'mosaik3lab.db'), 'SELECT benutzername FROM benutzer').map((r) => r.benutzername), ['druck']);
  assert.equal(fs.readFileSync(path.join(C, 'root', 'ablage', 'artikel', 'x', 'bild', 'f.jpg'), 'utf8'), 'BILDINHALT');
  assert.equal(sdb.readBereich(path.join(C, 'root', 'daten', 'mosaik3lab.db'), 'betrieb')['app.port'], 3001, 'Einstellungen der neuen Einrichtung stehen in der übernommenen Datenbank');
});

test('Abgleichen: Firewall-Regel und Ordner aus der Datenbank abgeleitet, unbrauchbare Ordner → Rückfrage', async () => {
  const plan = await reconcile({ dryRun: true });
  const fw = plan.steps.find((s) => s.id === 'firewall');
  assert.ok(['geplant', 'ok'].includes(fw.status), JSON.stringify(fw));
  // Ohne aktive Firewall (Linux-Runner: ufw aus) gibt es nichts freizugeben – sonst die Regel für den Portal-Port
  if (process.platform === 'win32' || !/Keine Firewall aktiv/.test(fw.detail)) assert.match(fw.detail + (fw.command ?? ''), /8081/);
  else assert.equal(fw.status, 'ok');
  assert.ok(plan.steps.some((x) => x.id === 'portal'), 'Portal wird im Abgleich geprüft');
  assert.ok(plan.steps.some((s) => s.id === 'backup-zeitplan' && /03:15/.test(s.detail) && /verschlüsselt/.test(s.detail)));
  // Ordner auf einem Laufwerk, das es nicht gibt (z. B. nach Umzug auf einen anderen Rechner)
  // (Linux: Windows-Pfade sind dort nicht vollständig → Ordner unter einer Datei, scheitert sofort, auch als root)
  const datei = path.join(tmp, 'keine-ordner');
  fs.writeFileSync(datei, '');
  cfg.updateConfig({ paths: { ablageDir: process.platform === 'win32' ? 'Q:\\gibt-es-nicht\\ablage' : path.join(datei, 'ablage') } });
  const bad = await reconcile({ dryRun: true });
  assert.ok(bad.needsInput.some((n) => n.key === 'ablageDir'), JSON.stringify(bad.needsInput));
  if (process.platform === 'win32') {
    const fixed = await reconcile({ dryRun: true, paths: { ablageDir: path.join(A, 'ablage-neu') } });
    assert.equal(fixed.needsInput.length, 0);
    cfg.updateConfig({ app: { network: false } }); // kein echter Firewall-Aufruf (Windows-Bestätigung) im Test
    const real = await reconcile({ paths: { ablageDir: path.join(A, 'ablage-neu') }, restart: false });
    assert.ok(real.steps.some((x) => x.id === 'firewall'));
    assert.equal(cfg.getConfig().paths.ablageDir, path.join(A, 'ablage-neu'), 'Antwort wurde gespeichert');
  } else {
    cfg.updateConfig({ paths: { ablageDir: path.join(A, 'ablage-neu') } }); // unbrauchbaren Ordner nicht für die folgenden Tests stehen lassen
  }
});

test('Änderung durch anderen Prozess (Datenbank) wird erkannt', async () => {
  sdb.writeBereich(dbFileA, 'betrieb', { 'backup.keep': 11 });
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(cfg.getConfig().backup.keep, 11);
});
