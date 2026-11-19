// Sicherung und Rückfall in Ausnahmefällen: Reste abgebrochener Sicherungen, voller Datenträger beim Zurückspielen der
// Datenbank, Rückfall packt nur die Datenbank aus. Fehler werden gezielt nachgestellt – es laufen keine Dienste und nichts
// wird installiert. Testdaten unter C:\Entwicklung\_testdaten\server-manager\ (bzw. MOSAIK3LAB_TESTDATEN), danach gelöscht.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const TESTROOT = process.env.MOSAIK3LAB_TESTDATEN ?? path.resolve(ROOT, '..', '_testdaten', 'server-manager');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'robust-')));
const daten = path.join(tmp, 'daten');
fs.writeFileSync(path.join(tmp, 'mosaik3lab.json'), JSON.stringify({ dataDir: daten, managerPort: 5198 }));
process.env.MANAGER_CONFIG = path.join(tmp, 'mosaik3lab.json');
process.env.MOSAIK3LAB_ROOT = tmp; // Standardordner der Arbeitskopie nie unter C:\Mosaik3LAB
process.env.MOSAIK3LAB_QUIET = '1';

const cfg = await import('../lib/config.mjs');
const bk = await import('../lib/backup.mjs');
const pu = await import('../lib/paketupdate.mjs');
const { removeTree } = await import('../lib/dateien.mjs');

const backups = path.join(tmp, 'backups');
const ablage = path.join(tmp, 'ablage');
cfg.updateConfig({ paths: { ablageDir: ablage, backupDir: backups, logDir: path.join(tmp, 'logs') }, backup: { keep: 5, encrypt: false } });
fs.mkdirSync(path.join(daten, 'data'), { recursive: true });
fs.mkdirSync(path.join(ablage, 'artikel'), { recursive: true });
fs.writeFileSync(path.join(daten, 'data', 'stand.json'), 'A');
fs.writeFileSync(path.join(ablage, 'artikel', 'bild.jpg'), 'ein Bild');
const dbFile = cfg.resolvePaths().dbFile;

after(() => removeTree(tmp));

/** Merker in der Datenbank setzen/lesen (eigene Tabelle) – daran sieht man, welcher Stand der Datenbank gerade gilt. */
function merker(wert) {
  const db = new DatabaseSync(dbFile);
  try {
    db.exec('CREATE TABLE IF NOT EXISTS merker (wert TEXT)');
    if (wert !== undefined) {
      db.exec('DELETE FROM merker');
      db.prepare('INSERT INTO merker (wert) VALUES (?)').run(wert);
    }
    return db.prepare('SELECT wert FROM merker').get()?.wert ?? null;
  } finally {
    db.close();
  }
}
const alt = (datei, stunden) => {
  const t = new Date(Date.now() - stunden * 3600_000);
  fs.utimesSync(datei, t, t);
};

// ---------- Reste abgebrochener Sicherungen ----------
test('Reste abgebrochener Sicherungen (….unfertig, ….teil, .auspacken-…) werden vor der nächsten Sicherung entfernt – nur alte', async () => {
  fs.mkdirSync(backups, { recursive: true });
  const altOrdner = path.join(backups, 'mosaik3lab-2026-01-01_02-00-00-komplett.unfertig');
  const altTeil = path.join(backups, 'mosaik3lab-2026-01-01_02-00-00-komplett.m3lbackup.teil');
  const altAuspacken = path.join(backups, '.auspacken-4711-1700000000000');
  const frisch = path.join(backups, 'mosaik3lab-2026-01-02_02-00-00-komplett.unfertig'); // läuft vielleicht noch
  const fremd = path.join(backups, 'eigene-notizen.unfertig'); // gehört nicht zu Mosaik³LAB
  const fertig = path.join(backups, 'mosaik3lab-2026-01-01_01-00-00-komplett.m3lbackup'); // keine lesbare Sicherung, aber kein Rest
  for (const d of [altOrdner, altAuspacken, frisch, fremd]) {
    fs.mkdirSync(path.join(d, 'ablage'), { recursive: true });
    fs.writeFileSync(path.join(d, 'ablage', 'kopie.jpg'), 'x'.repeat(1000));
  }
  fs.writeFileSync(altTeil, 'halb');
  fs.writeFileSync(fertig, 'kein Kopf');
  for (const p of [altOrdner, altTeil, altAuspacken, fremd, fertig]) alt(p, 7);

  const r = await bk.createBackup('manuell');
  assert.equal(r.verified, true);
  for (const p of [altOrdner, altTeil, altAuspacken]) assert.equal(fs.existsSync(p), false, `entfernt: ${path.basename(p)}`);
  for (const p of [frisch, fremd, fertig]) assert.equal(fs.existsSync(p), true, `bleibt: ${path.basename(p)}`);
  assert.ok(fs.existsSync(path.join(backups, `${r.id}.m3lbackup`)), 'die neue Sicherung ist da');

  // direkt aufgerufen: meldet, was entfernt wurde; ein fehlender Ordner ist kein Fehler
  alt(frisch, 7);
  assert.deepEqual(await bk.resteEntfernen(backups), [path.basename(frisch)]);
  assert.deepEqual(await bk.resteEntfernen(path.join(tmp, 'gibt-es-nicht')), []);
  for (const p of [fremd, fertig]) fs.rmSync(p, { recursive: true, force: true });
});

// ---------- Schema einer Programmversion ----------
test('Schema einer Version: nur Migrationsdateien, die die App einspielt, zählen (Kleinbuchstaben, Ziffern, _)', async () => {
  const { releaseSchemaVersion } = await import('../lib/schema.mjs');
  const rel = path.join(tmp, 'version');
  const mig = path.join(rel, 'server', 'src', 'storage', 'sqlite', 'migrations');
  fs.mkdirSync(mig, { recursive: true });
  for (const n of ['001_grundschema.sql', '002_zweite_tabelle.sql', '003_indizes_2.sql']) fs.writeFileSync(path.join(mig, n), '-- test');
  assert.equal(releaseSchemaVersion(rel), 3);
  // Diese spielt die App nie ein (Großbuchstaben, Bindestrich, Leerzeichen, Sicherungskopie, zu kurze Nummer) – sie zählen nicht
  for (const n of ['024_Neue-Tabelle.sql', '025_neue tabelle.sql', '026_.sql', '027_alt.sql.bak', '28_kurz.sql', '029_GROSS.sql']) fs.writeFileSync(path.join(mig, n), '-- test');
  assert.equal(releaseSchemaVersion(rel), 3, 'Paket bleibt bei Schema 3');
  // Folge für den Schutz: eine Datenbank mit Schema 4 ist neuer als dieses Paket → abgelehnt (früher galt das Paket als 29)
  const db = new DatabaseSync(path.join(tmp, 'schema4.db'));
  db.exec("CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, eingespielt_am TEXT NOT NULL); INSERT INTO schema_version VALUES (4, 'x', '')");
  db.close();
  await assert.rejects(() => pu.refuseDowngrade(path.join(tmp, 'schema4.db'), rel, 'Testpaket'), /Downgrade verweigert.*Schema 3.*Schema 4/);
});

// ---------- eine fremde Datei im Backup-Ziel ----------
test('Liste der Sicherungen: eine Datei mit unvollständigem Kopf (ohne Zeitangabe) bringt die Liste nicht zum Scheitern', async () => {
  const json = Buffer.from(JSON.stringify({ format: 1, kind: 'komplett', reason: 'fremd' }), 'utf8'); // kein „created“
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(json.length);
  const fremd = path.join(backups, 'mosaik3lab-2020-01-01_00-00-00-komplett.m3lbackup');
  fs.writeFileSync(fremd, Buffer.concat([Buffer.from('M3LBAK1\n', 'latin1'), laenge, json]));
  const liste = await bk.listBackups();
  assert.ok(liste.length >= 2, 'echte Sicherung und die fremde Datei');
  assert.equal(liste.at(-1).reason, 'fremd', 'ohne Zeitangabe ans Ende');
  assert.ok(liste[0].created, 'die echte Sicherung steht vorn');
  assert.equal((await bk.dueKinds(new Date(Date.now() + 2 * 86_400_000))).length, 1, 'der Zeitplan rechnet weiter (übermorgen ist eine Sicherung fällig)');
  fs.rmSync(fremd);
});

// ---------- Datenbank zurückspielen: voller Datenträger ----------
test('Datenbank zurückspielen: scheitert das Kopieren (Datenträger voll), bleibt die bisherige Datenbank stehen', async () => {
  merker('vorher');
  const sicherung = await bk.createBackup('vor Update auf 9.9.9');
  merker('nachher'); // z. B. von der neuen Version verändert
  const opened = await bk.openBackup(path.join(backups, `${sicherung.id}.m3lbackup`), { stagingBase: backups });
  try {
    const voll = async (_von, nach) => {
      fs.writeFileSync(nach, 'halb geschrieben'); // ein Teil landet noch auf der Platte …
      throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }); // … dann ist sie voll
    };
    await assert.rejects(() => bk.applyBackup({ folder: opened.folder, meta: opened.meta, dirs: { dataDir: daten, ablageDir: ablage }, only: ['db'], kopieren: voll }), /ENOSPC/);
    assert.ok(fs.existsSync(dbFile), 'die Datenbank ist noch da');
    assert.equal(merker(), 'nachher', 'und unverändert (nicht gelöscht, nicht halb ersetzt)');
    assert.equal(fs.existsSync(`${dbFile}.neu`), false, 'kein halber Rest daneben');

    // ohne Fehler: ersetzt, geprüft, kein Rest
    assert.deepEqual(await bk.applyBackup({ folder: opened.folder, meta: opened.meta, dirs: { dataDir: daten, ablageDir: ablage }, only: ['db'] }), []);
    assert.equal(merker(), 'vorher');
    assert.equal(fs.existsSync(`${dbFile}.neu`), false);
    assert.equal(fs.existsSync(`${dbFile}-wal`), false, 'kein WAL der ersetzten Datenbank übrig');
  } finally {
    await opened.cleanup();
  }
});

// ---------- Neuinstallation ohne Internet (Windows: WinSW wird einmal geladen) ----------
test('WinSW lässt sich nicht laden (kein Internet): verständliche Meldung mit Ausweg statt „fetch failed“', async () => {
  const { ensureWrapper } = await import('../lib/setup.mjs');
  const wrapper = { version: '2.12.0', url: 'https://example.invalid/WinSW.exe', size: 5, sha256: null };
  const ziel = path.join(tmp, 'werkzeuge', 'WinSW-2.12.0.exe');
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  const offline = async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  };
  await assert.rejects(() => ensureWrapper(ziel, true, { wrapper, fetchImpl: offline }), (err) => {
    assert.match(err.message, /WinSW 2\.12\.0.*konnte nicht heruntergeladen werden \(ENOTFOUND\).*Internetzugang/);
    assert.ok(err.hint.includes(wrapper.url) && err.hint.includes(ziel), 'Hinweis nennt Adresse und Ablageort');
    assert.equal(err.status, 400, 'als Eingabefehler (wird mit Hinweis angezeigt)');
    return true;
  });
  await assert.rejects(() => ensureWrapper(ziel, true, { wrapper, fetchImpl: async () => ({ ok: false, status: 503 }) }), /konnte nicht heruntergeladen werden \(Fehler 503\)/);
  assert.equal(fs.existsSync(ziel), false, 'nichts Halbes abgelegt');
  // von Hand abgelegt (richtige Größe): wird beim nächsten Versuch benutzt, ohne Download
  fs.writeFileSync(ziel, '12345');
  await ensureWrapper(ziel, true, { wrapper, fetchImpl: offline });
});

// ---------- Rückfall: nur die Datenbank auspacken ----------
test('Rückfall: aus der Sicherung wird nur die Datenbank ausgepackt (Ablage nur geprüft) und zurückgespielt', async () => {
  merker('vor dem Update');
  fs.writeFileSync(path.join(ablage, 'artikel', 'gross.bin'), Buffer.alloc(300_000, 7));
  const sicherung = await bk.createBackup('vor Update auf 9.9.9');
  const datei = path.join(backups, `${sicherung.id}.m3lbackup`);

  // openBackup mit nur: ['db'] → im Zwischenordner liegt nur db/, das Manifest nennt trotzdem alles
  const nurDb = await bk.openBackup(datei, { stagingBase: backups, nur: ['db'] });
  try {
    assert.deepEqual(fs.readdirSync(nurDb.folder), ['db']);
    assert.ok(nurDb.meta.files.some((f) => f.path === 'ablage/artikel/gross.bin'), 'Manifest vollständig');
  } finally {
    await nurDb.cleanup();
  }
  // ohne nur: wie bisher alles
  const alles = await bk.openBackup(datei, { stagingBase: backups });
  try {
    assert.deepEqual(fs.readdirSync(alles.folder).sort(), ['ablage', 'data', 'db']);
  } finally {
    await alles.cleanup();
  }

  // restoreDbFrom (Rückfall): Datenbank zurück, Ablage und übrige Daten unberührt, kein Zwischenordner bleibt
  merker('von der neuen Version verändert');
  fs.writeFileSync(path.join(ablage, 'artikel', 'bild.jpg'), 'inzwischen geändert');
  await pu.restoreDbFrom({ backupDir: backups, id: sicherung.id, keyFile: path.join(tmp, 'backup.key'), dataDir: daten, ablageDir: ablage });
  assert.equal(merker(), 'vor dem Update');
  assert.equal(fs.readFileSync(path.join(ablage, 'artikel', 'bild.jpg'), 'utf8'), 'inzwischen geändert', 'die Ablage fasst der Rückfall nicht an');
  assert.deepEqual(fs.readdirSync(backups).filter((n) => n.startsWith('.auspacken-')), []);

  // beschädigte Sicherung (ein Byte der Ablage verändert): wird abgelehnt, obwohl nur die Datenbank ausgepackt würde
  const buf = fs.readFileSync(datei);
  const stelle = buf.indexOf(Buffer.alloc(64, 7));
  assert.ok(stelle > 0);
  buf[stelle + 10] = 8;
  fs.writeFileSync(datei, buf);
  merker('darf bleiben');
  await assert.rejects(() => pu.restoreDbFrom({ backupDir: backups, id: sicherung.id, keyFile: path.join(tmp, 'backup.key'), dataDir: daten, ablageDir: ablage }), /beschädigt/);
  assert.equal(merker(), 'darf bleiben', 'aus einer beschädigten Sicherung wird nichts zurückgespielt');
});
