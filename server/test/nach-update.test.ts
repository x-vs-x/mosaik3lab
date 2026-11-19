// Nach einem Update: Sicherungen vor der Migration (ausdünnen, bei scheiternder Migration nicht bei jedem Start eine weitere
// Kopie) und Schonfrist für Originalbilder (ein Rückfall des Server-Managers spielt nur die Datenbank zurück).
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import jpeg from 'jpeg-js';
import { BildDienst, Bildpflege, SCHONFRIST_NACH_MIGRATION_MS, schonfristBis, startWartezeit } from '../src/kern/bilder';
import { letzteMigrationAm, listMigrations, migrate, openDb, schemaVersion, VOR_SCHEMA_BEHALTEN } from '../src/kern/db';
import { storageAt, tmp } from './helfer';

const MIN = 60_000;
const base = listMigrations();
const stand = base.at(-1)!.version;
const nnn = (v: number) => String(v).padStart(3, '0');
const naechste = (n = 1, sql = `CREATE TABLE test_${n} (x INTEGER)`) => ({ version: stand + n, name: `${nnn(stand + n)}_test`, sql });
const kaputt = { version: stand + 1, name: `${nnn(stand + 1)}_kaputt`, sql: 'CREATE TABLE neu (id TEXT); SELECT * FROM gibt_es_nicht;' };

/** Datenbank auf dem heutigen Stand mit einer Zeile, dazu der (noch leere) Sicherungsordner. */
async function datenbank(name: string) {
  const dir = await tmp(name);
  const backupDir = path.join(dir, 'sicherungen');
  await fs.mkdir(backupDir);
  const db = openDb(path.join(dir, 'mosaik3lab.db'));
  migrate(db, { backupDir, log: () => undefined });
  db.prepare("INSERT INTO lehrkraft (id, email, angelegt_am) VALUES ('l1', 'a@b.de', '2026-01-01')").run();
  const log: string[] = [];
  const vorSchema = async () => (await fs.readdir(backupDir)).filter((f) => f.startsWith('mosaik3lab-vor-schema-')).sort();
  const weg = async () => {
    if (db.isOpen) db.close();
    await fs.rm(dir, { recursive: true, force: true });
  };
  return { db, backupDir, log, vorSchema, weg, opts: { backupDir, log: (m: string) => log.push(m) } };
}

test('Nach gelungener Migration bleiben nur die neuesten 3 Sicherungen „vor-schema“ – die neue ist dabei, „vor-import“ bleibt', async () => {
  const t = await datenbank('ausduennen');
  try {
    const alte = [1, 2, 3, 4, 5].map((m) => `mosaik3lab-vor-schema-${nnn(10 + m)}-2026-0${m}-01T08-00-00.db`);
    const fremd = ['mosaik3lab-vor-import-2026-01-01T08-00-00.db', 'mosaik3lab-vor-import-2026-01-02T08-00-00-2.db', 'notiz.txt'];
    for (const f of [...alte, ...fremd]) await fs.writeFile(path.join(t.backupDir, f), f);

    const r = migrate(t.db, { ...t.opts, migrations: [...base, naechste()] });
    assert.equal(r.to, stand + 1);
    assert.ok(r.backup && existsSync(r.backup), 'neue Sicherung angelegt');
    assert.equal(VOR_SCHEMA_BEHALTEN, 3);
    assert.deepEqual(await t.vorSchema(), [alte[3], alte[4], path.basename(r.backup!)].sort(), 'die neue und die zwei neuesten alten');
    for (const f of fremd) assert.ok(existsSync(path.join(t.backupDir, f)), `${f} bleibt`);
    assert.ok(t.log.some((m) => /3 ältere Sicherungen vor Migrationen entfernt/.test(m)), t.log.join('\n'));
  } finally {
    await t.weg();
  }
});

test('Falsche Uhr: Auch wenn ältere Sicherungen „neuer“ heißen, bleibt die gerade angelegte liegen', async () => {
  const t = await datenbank('uhr');
  try {
    const alte = [1, 2, 3].map((m) => `mosaik3lab-vor-schema-${nnn(10 + m)}-2099-0${m}-01T08-00-00.db`);
    for (const f of alte) await fs.writeFile(path.join(t.backupDir, f), f);
    const r = migrate(t.db, { ...t.opts, migrations: [...base, naechste()] });
    assert.deepEqual(await t.vorSchema(), [alte[1], alte[2], path.basename(r.backup!)].sort());
  } finally {
    await t.weg();
  }
});

test('Scheiternde Migration, mehrmals gestartet: keine weitere Kopie desselben Standes – geänderter Stand wird neu gesichert', async () => {
  const t = await datenbank('scheitert');
  try {
    const migrations = [...base, kaputt];
    for (let start = 1; start <= 3; start++) {
      assert.throws(() => migrate(t.db, { ...t.opts, migrations }), /gibt_es_nicht/);
      assert.equal(schemaVersion(t.db), stand, 'zurückgerollt');
      assert.equal((await t.vorSchema()).length, 1, `Start ${start}: genau eine Sicherung`);
    }
    const [einzige] = await t.vorSchema();
    assert.match(einzige, new RegExp(`^mosaik3lab-vor-schema-${nnn(stand + 1)}-`));
    assert.equal(t.log.filter((m) => /schon vorhanden, Stand unverändert/.test(m)).length, 2, t.log.join('\n'));
    // Die Sicherung ist vollständig und hat den Stand von vor der Migration
    const kopie = openDb(path.join(t.backupDir, einzige), { readOnly: true });
    assert.equal(schemaVersion(kopie), stand);
    assert.equal((kopie.prepare('SELECT COUNT(*) AS n FROM lehrkraft').get() as { n: number }).n, 1);
    kopie.close();

    // Inzwischen geänderte Daten (z. B. alte Version lief weiter): der neue Stand bekommt seine eigene Sicherung
    t.db.prepare("INSERT INTO lehrkraft (id, email, angelegt_am) VALUES ('l2', 'c@d.de', '2026-01-02')").run();
    assert.throws(() => migrate(t.db, { ...t.opts, migrations }));
    const zwei = await t.vorSchema();
    assert.equal(zwei.length, 2, 'geänderter Stand → neue Kopie');
    const neu = openDb(path.join(t.backupDir, zwei.find((f) => f !== einzige)!), { readOnly: true });
    assert.equal((neu.prepare('SELECT COUNT(*) AS n FROM lehrkraft').get() as { n: number }).n, 2);
    neu.close();

    // Eine beschädigte (halb geschriebene) Sicherung derselben Nummer wird nie wiederverwendet
    for (const f of zwei) await fs.writeFile(path.join(t.backupDir, f), 'abgebrochen');
    assert.throws(() => migrate(t.db, { ...t.opts, migrations }));
    assert.equal((await t.vorSchema()).length, 3);

    // Gelingt die Migration schließlich, wird die vorhandene gleiche Sicherung benutzt und bleibt liegen
    const r = migrate(t.db, { ...t.opts, migrations: [...base, naechste()] });
    assert.equal(r.to, stand + 1);
    assert.ok(r.backup && existsSync(r.backup));
    assert.equal((await t.vorSchema()).length, 3);
  } finally {
    await t.weg();
  }
});

test('Lässt sich eine alte Sicherung nicht löschen, gelingt der Start trotzdem (nur ein Hinweis im Protokoll)', async () => {
  const t = await datenbank('loeschen');
  try {
    // Ein nicht leerer Ordner mit dem Namen einer alten Sicherung lässt sich auf jedem System nicht als Datei löschen
    const sperrig = 'mosaik3lab-vor-schema-005-2025-01-01T08-00-00.db';
    await fs.mkdir(path.join(t.backupDir, sperrig));
    await fs.writeFile(path.join(t.backupDir, sperrig, 'inhalt'), 'x');
    const alte = [1, 2, 3].map((m) => `mosaik3lab-vor-schema-${nnn(10 + m)}-2026-0${m}-01T08-00-00.db`);
    for (const f of alte) await fs.writeFile(path.join(t.backupDir, f), f);

    const r = migrate(t.db, { ...t.opts, migrations: [...base, naechste()] });
    assert.equal(r.to, stand + 1, 'Migration eingespielt');
    assert.equal(schemaVersion(t.db), stand + 1);
    assert.ok(existsSync(path.join(t.backupDir, sperrig)), 'bleibt liegen');
    assert.ok(t.log.some((m) => m.includes(sperrig) && /konnte nicht gelöscht werden/.test(m)), t.log.join('\n'));
    assert.deepEqual(await t.vorSchema(), [sperrig, alte[1], alte[2], path.basename(r.backup!)].sort(), 'die übrigen sind ausgedünnt');
  } finally {
    await t.weg();
  }
});

test('Echter Start: Scheitert die Migration bei jedem Neustart des Dienstes, bleibt es bei einer Sicherung', async () => {
  const dir = await tmp('neustart');
  const sicherungen = path.join(dir, 'sicherungen');
  try {
    await (await storageAt(dir)).storage.close();
    // Stand „vor 023“, aber die Tabelle aus 023 gibt es schon → Migration 023 scheitert bei jedem Start (CREATE TABLE)
    const db = openDb(path.join(dir, 'mosaik3lab.db'));
    db.exec('DELETE FROM schema_version WHERE version >= 23');
    db.close();
    for (let start = 1; start <= 3; start++) {
      await assert.rejects(storageAt(dir), /artikel_kategorien/);
      const da = await fs.readdir(sicherungen);
      assert.equal(da.length, 1, `Start ${start}: ${da.join(', ')}`);
      assert.match(da[0], /^mosaik3lab-vor-schema-023-/);
      assert.ok(!existsSync(path.join(dir, '.lock')), 'Sperre wieder frei');
    }
    // Ursache behoben → Start gelingt, die Sicherung bleibt
    const heil = openDb(path.join(dir, 'mosaik3lab.db'));
    heil.exec('DROP TABLE artikel_kategorien');
    heil.close();
    const s = await storageAt(dir);
    assert.equal(schemaVersion(s.storage.sqlite.db), stand);
    await s.storage.close();
    assert.equal((await fs.readdir(sicherungen)).length, 2, 'geänderter Stand (Tabelle entfernt) → eigene Sicherung');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// --- Schonfrist für Originalbilder -----------------------------------------------------------------------------------------

test('Schonfrist und Wartezeit der Bildpflege: mit Migration erst nach 15 Minuten, ohne wie bisher', () => {
  const t = Date.parse('2026-11-19T10:00:00Z');
  assert.equal(SCHONFRIST_NACH_MIGRATION_MS, 15 * MIN);
  assert.equal(schonfristBis(null, t), 0, 'keine Migration');
  assert.equal(schonfristBis(t, t + MIN), t + 15 * MIN, 'gerade eingespielt');
  assert.equal(schonfristBis(t, t + 15 * MIN), 0, 'abgelaufen');
  assert.equal(schonfristBis(t + 24 * 60 * MIN, t), t + 15 * MIN, 'Uhr ging beim Einspielen vor: nie länger als 15 Minuten ab jetzt');

  // (Start nach 5 min, bei vielen fehlenden Vorschaubildern nach 1 min, Rest der Schonfrist)
  assert.equal(startWartezeit(5 * MIN, MIN, false, 0), 5 * MIN, 'ohne Migration wie bisher');
  assert.equal(startWartezeit(5 * MIN, MIN, true, 0), MIN, 'ohne Migration, viele fehlen: wie bisher nach einer Minute');
  assert.equal(startWartezeit(5 * MIN, MIN, true, 14 * MIN), 14 * MIN, 'nach Migration nicht schon nach einer Minute');
  assert.equal(startWartezeit(5 * MIN, MIN, false, 15 * MIN), 15 * MIN);
  assert.equal(startWartezeit(5 * MIN, MIN, false, 2 * MIN), 5 * MIN, 'Schonfrist fast vorbei: es bleibt bei 5 Minuten');
  assert.equal(startWartezeit(30 * MIN, MIN, false, 15 * MIN), 30 * MIN, 'länger eingestellt bleibt länger');
});

const grossesBild = () => {
  const [b, h] = [2600, 1300];
  const data = Buffer.alloc(b * h * 4, 255);
  for (let i = 0; i < data.length; i += 4) data[i] = ((i / 4) % b) < b / 2 ? 230 : 20;
  return Buffer.from(jpeg.encode({ data, width: b, height: h }, 90).data);
};

test('Nach einer Migration: Vorschaubilder sofort, Originale erst nach der Schonfrist – auch nach einem Neustart der App', async () => {
  const dir = await tmp('schonfrist');
  let s = await storageAt(dir);
  const warnungen: string[] = [];
  const still = { pauseMs: 0, warteMs: 20, log: () => undefined, warn: (t: string) => warnungen.push(t) };
  try {
    // Neuanlage: keine Schonfrist
    assert.equal(letzteMigrationAm(s.storage.sqlite.db), null);
    assert.equal(s.storage.bilder.schonfristMs(), 0);
    s.storage.sqlite.db.prepare("INSERT INTO artikel (id, nummer, name, erstellt_am, geaendert_am) VALUES ('a1', 'T-1', 'Test', '2026-01-01', '2026-01-01')").run();
    // Wie nach einem Update: Die Datenbank gibt es seit Januar, die letzte Migration wurde eben eingespielt
    s.storage.sqlite.db.prepare('UPDATE schema_version SET eingespielt_am = ? WHERE version < ?').run('2026-01-01T08:00:00.000Z', stand);
    const eingespielt = letzteMigrationAm(s.storage.sqlite.db);
    assert.ok(eingespielt && Date.now() - eingespielt < MIN);
    await s.storage.close();

    s = await storageAt(dir); // Neustart (z. B. durch den Dienst) – die Schonfrist gilt weiter
    const rest = s.storage.bilder.schonfristMs();
    assert.ok(rest > 14 * MIN && rest <= 15 * MIN, `Rest ${rest}`);
    const d = await s.storage.files.save({ objekttyp: 'artikel', objektId: 'a1', rolle: 'bild', buffer: grossesBild(), ext: 'jpg' });

    // Abruf: Vorschaubild entsteht sofort, das Original bleibt
    const vorschau = await s.storage.bilder.vorschau(d, 'karte', 30_000);
    assert.ok(vorschau && existsSync(vorschau), 'Vorschaubild sofort');
    assert.equal(s.storage.files.find(d.id)?.sha256, d.sha256, 'Original nicht ersetzt');
    assert.equal(await s.storage.bilder.erledigt(d), false, 'Verkleinern steht noch aus');

    // Bildpflege: Start-Lauf erst nach der Schonfrist geplant; nachgereichte Bilder ersetzen ebenfalls nichts
    const pflege = new Bildpflege(s.storage.files, s.storage.bilder, still);
    const geplant = await pflege.planeStart(5 * MIN, MIN);
    assert.ok(geplant! > 14 * MIN && geplant! <= 15 * MIN, `geplant ${geplant}`);
    await pflege.nachholen([d.id]);
    assert.equal(pflege.letzterBericht?.verkleinert, 0);
    assert.equal(s.storage.files.find(d.id)?.sha256, d.sha256);

    // Mit gestellter Uhr: kurz vor Ablauf noch nicht, danach verkleinert die Bildpflege
    const originaleAb = Date.now() + rest;
    let uhr = originaleAb - 1000;
    const dienst = new BildDienst(s.storage.files, s.storage.bilder.rechner, { originaleAb, jetzt: () => uhr });
    const spaeter = new Bildpflege(s.storage.files, dienst, still);
    assert.equal(await spaeter.planeStart(-1), undefined, 'abgeschaltet bleibt abgeschaltet');
    await spaeter.alle();
    assert.deepEqual([spaeter.letzterBericht?.geprueft, spaeter.letzterBericht?.verkleinert], [1, 0], 'eine Sekunde vor Ablauf');
    uhr = originaleAb;
    assert.equal(dienst.schonfristMs(), 0);
    await spaeter.alle();
    assert.equal(spaeter.letzterBericht?.verkleinert, 1, 'nach der Schonfrist verkleinert');
    assert.notEqual(s.storage.files.find(d.id)?.sha256, d.sha256);
    assert.deepEqual(warnungen, []);
    await pflege.beenden(); // beendet auch den gemeinsamen Rechen-Thread
    await spaeter.beenden();
  } finally {
    await s.storage.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Ohne Migration plant die Bildpflege wie bisher (5 Minuten, bei vielen fehlenden Vorschaubildern früher)', async () => {
  const dir = await tmp('ohne-migration');
  const s = await storageAt(dir);
  try {
    const pflege = new Bildpflege(s.storage.files, s.storage.bilder, { pauseMs: 0, log: () => undefined, warn: () => undefined });
    assert.equal(await pflege.planeStart(5 * MIN, MIN), 5 * MIN);
    await pflege.beenden();
  } finally {
    await s.storage.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
