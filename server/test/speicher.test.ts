// Speicherschicht (SQLite): Schreibzugriffe, Transaktionen, IDs, Nummernkreise, Dateiablage, Löschen inkl. Dateien,
// Fremdschlüssel, Migrationen mit Sicherung, Sitzungen und Sperrdatei.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { uuidv7 } from '../src/kern/ids';
import { nummerText } from '../src/kern/objekttypen';
import { currentBootTime, lockContent, lockHolder } from '../src/kern/lock';
import { listMigrations, migrate, openDb, schemaVersion, transaction } from '../src/kern/db';
import { baseItem, MP4, now, PNG, SCHOOL, sha, STL, storageAt, tmp } from './helfer';
test('Parallele Schreibzugriffe gehen nicht verloren (SQLite)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-db-'));
  const config = loadConfig({ storageDir: dir, rootDir: dir, logRequests: false, seedDemoData: false, clientDistDir: path.join(dir, 'none') });
  const instance = await createApp(config);
  try {
    await Promise.all(Array.from({ length: 50 }, (_, i) => instance.storage.requesters.upsertByEmail(`l${i}@${SCHOOL}`, new Date().toISOString())));
    assert.equal(await instance.storage.requesters.count(), 50);
  } finally {
    await instance.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('Fehler in einer Transaktion lässt Daten unverändert', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-db-'));
  const db = openDb(path.join(dir, 't.db'));
  try {
    db.exec('CREATE TABLE x (id TEXT PRIMARY KEY)');
    transaction(db, () => db.prepare("INSERT INTO x VALUES ('1')").run());
    assert.throws(() => transaction(db, () => { db.prepare("INSERT INTO x VALUES ('2')").run(); throw new Error('abbruch'); }));
    assert.deepEqual(db.prepare('SELECT id FROM x').all().map((r) => r.id), ['1']);
  } finally {
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('UUID v7: Format, Version, zeitlich sortierbar', async () => {
  const ids = Array.from({ length: 2000 }, () => uuidv7());
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual([...ids].sort(), ids, 'in Erzeugungsreihenfolge sortiert');
  assert.equal(new Set(ids).size, ids.length);
  const before = Date.now();
  const ts = parseInt(uuidv7().replace(/-/g, '').slice(0, 12), 16);
  assert.ok(ts >= before - 5 && ts <= Date.now() + 5, 'Zeitstempel (ms) steht vorne');
});

test('Plug & Play: leere DB wird angelegt (Tabellen, Schema, WAL, Fremdschlüssel, Ablage)', async () => {
  const dir = await tmp('neu');
  const { config, storage } = await storageAt(dir);
  try {
    assert.ok(existsSync(config.dbFile));
    assert.ok(existsSync(config.ablageDir));
    const info = storage.database.info();
    assert.equal(info.vorhanden, true);
    assert.equal(info.schemaVersion, listMigrations().at(-1)!.version);
    assert.ok(info.groesseBytes > 0);
    const db = openDb(config.dbFile, { readOnly: true });
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
    for (const t of ['benutzer', 'benutzer_bereich', 'lehrkraft', 'kategorie', 'einsatzbereich', 'material', 'filament', 'statusart', 'artikel', 'artikel_farbbereich', 'artikel_farbbereich_filament', 'artikel_feld', 'artikel_video', 'anfrage', 'anfrage_farbe', 'anfrage_feldwert', 'anfrage_statusverlauf', 'datei', 'nummernkreis', 'schema_version', 'sitzung', 'einstellung']) {
      assert.ok(tables.includes(t), `Tabelle ${t}`);
    }
    assert.ok(!tables.includes('benutzer_recht'), 'alte Einzelrechte entfernt (Migration 022)');
    assert.equal((db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode, 'wal');
    db.close();
    assert.equal((await storage.settings.get()).masterData.categories.length, 7, 'Standard-Stammdaten');
  } finally {
    await storage.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Nummernkreise: ANF je Jahr, ART fortlaufend, alte M3L-Nummern bleiben', async () => {
  const dir = await tmp('nummern');
  const { storage } = await storageAt(dir);
  try {
    const order = (id: string, createdAt: string) => ({
      id, itemId: '', itemName: 'X', quantity: 1, color: '', colorId: '', colorHex: '', colorChoices: [], colorVariants: [], size: '', classOrTeam: '', customization: '',
      personalization: [], status: 'offen', history: [], requesterId: null, requesterEmail: '', requesterName: '', trackingCode: '', isDemo: false, createdAt, updatedAt: createdAt,
    });
    const a = await storage.orders.create(order(uuidv7(), '2026-03-01T10:00:00.000Z'));
    const b = await storage.orders.create(order(uuidv7(), '2026-05-01T10:00:00.000Z'));
    const c = await storage.orders.create(order(uuidv7(), '2027-01-02T10:00:00.000Z'));
    assert.deepEqual([a.number, b.number, c.number], ['ANF-2026-0001', 'ANF-2026-0002', 'ANF-2027-0001']);
    const i1 = await storage.items.create(baseItem(uuidv7()));
    const i2 = await storage.items.create(baseItem(uuidv7()));
    assert.deepEqual([i1.number, i2.number], ['ART-0001', 'ART-0002']);
    assert.equal(nummerText('vorschlag', 3, 2026), 'VOR-2026-0003');
    // Gelöschte Nummern werden nicht wiederverwendet.
    await storage.items.delete(i2.id);
    assert.equal((await storage.items.create(baseItem(uuidv7()))).number, 'ART-0003');
    // Nummer ist nach dem Anlegen fest – auch wenn ein Aufrufer sie ändern will.
    const changed = await storage.items.update(i1.id, (x) => ({ ...x, number: 'ART-9999', name: 'Neu' }));
    assert.equal(changed?.number, 'ART-0001');
    assert.equal(changed?.name, 'Neu');
  } finally {
    await storage.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Dateiablage: <ablage>/<objekttyp>/<objekt-id>/<rolle>/<datei-id>.<endung>, nur relativer Pfad in der DB', async () => {
  const dir = await tmp('ablage');
  const { config, storage } = await storageAt(dir);
  try {
    const item = await storage.items.create(baseItem(uuidv7()));
    const d = await storage.files.save({ objekttyp: 'artikel', objektId: item.id, rolle: 'bild', buffer: PNG, ext: 'png', originalname: 'Foto.png', erstelltVon: 'u1' });
    assert.equal(d.pfad, `artikel/${item.id}/bild/${d.id}.png`);
    assert.ok(!path.isAbsolute(d.pfad));
    const abs = path.join(config.ablageDir, 'artikel', item.id, 'bild', `${d.id}.png`);
    assert.equal(storage.files.absPath(d), abs);
    assert.equal(await sha(abs), d.sha256);
    assert.equal(d.mime, 'image/png');
    assert.equal(d.groesse, PNG.length);
    assert.deepEqual((await storage.items.findById(item.id))!.images, [`${d.id}.png`]);
    // Pfadangriffe und falsche Endungen
    assert.throws(() => storage.files.relPath('artikel', '../x', 'bild', 'a', 'png'));
    assert.throws(() => storage.files.relPath('artikel', 'x', 'bild', 'a', 'p/g'));
    assert.throws(() => storage.files.absPath({ pfad: '../../etwas.txt' }));
    assert.equal(storage.files.findByName(`${d.id}.jpg`), undefined, 'Endung muss passen');
    assert.equal(storage.files.findByName(`${d.id}.png`, 'video'), undefined, 'Rolle muss passen');
    assert.equal(storage.files.findByName(`${d.id}.png`)?.id, d.id);
    // Bildreihenfolge wird über „sortierung“ gespeichert.
    const d2 = await storage.files.save({ objekttyp: 'artikel', objektId: item.id, rolle: 'bild', buffer: PNG, ext: 'png' });
    const re = await storage.items.update(item.id, (x) => ({ ...x, images: [`${d2.id}.png`, `${d.id}.png`] }));
    assert.deepEqual(re!.images, [`${d2.id}.png`, `${d.id}.png`]);
  } finally {
    await storage.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Löschen: Artikel entfernt Datensätze und Dateien (erst DB, dann Datei), Anfragen behalten den Namen', async () => {
  const dir = await tmp('loeschen');
  const { config, storage } = await storageAt(dir);
  try {
    const item = await storage.items.create(baseItem(uuidv7()));
    const bild = await storage.files.save({ objekttyp: 'artikel', objektId: item.id, rolle: 'bild', buffer: PNG, ext: 'png' });
    const modell = await storage.files.save({ objekttyp: 'artikel', objektId: item.id, rolle: 'druckdatei', buffer: STL, ext: 'stl', originalname: 'teil.stl' });
    const video = await storage.files.save({ objekttyp: 'artikel', objektId: item.id, rolle: 'video', buffer: MP4, ext: 'mp4' });
    await storage.items.update(item.id, (x) => ({
      ...x,
      videos: [{ id: uuidv7(), title: 'V', file: `${video.id}.mp4`, url: '', sizeBytes: 0, uploadedAt: now() }],
    }));
    const loaded = (await storage.items.findById(item.id))!;
    assert.equal(loaded.modelFiles[0].id, modell.id);
    assert.equal(loaded.modelFiles[0].originalName, 'teil.stl');
    assert.equal(loaded.videos[0].sizeBytes, MP4.length);
    const order = await storage.orders.create({
      id: uuidv7(), itemId: item.id, itemName: item.name, quantity: 1, color: '', colorId: '', colorHex: '', colorChoices: [], colorVariants: [], size: '', classOrTeam: '', customization: '',
      personalization: [], status: 'offen', history: [], requesterId: null, requesterEmail: '', requesterName: '', trackingCode: '', isDemo: false, createdAt: now(), updatedAt: now(),
    });

    // Einzelne Datei entfernen, indem sie aus dem Artikel genommen wird
    await storage.items.update(item.id, (x) => ({ ...x, modelFiles: [] }));
    assert.equal(storage.files.find(modell.id), undefined);
    assert.equal(existsSync(storage.files.absPath(modell)), false);

    await storage.items.delete(item.id);
    for (const d of [bild, video]) {
      assert.equal(storage.files.find(d.id), undefined, 'Datensatz weg');
      assert.equal(existsSync(storage.files.absPath(d)), false, 'Datei weg');
    }
    assert.equal(existsSync(path.join(config.ablageDir, 'artikel', item.id)), false, 'leerer Ordner aufgeräumt');
    const kept = (await storage.orders.findById(order.id))!;
    assert.equal(kept.itemName, 'Testteil');
    assert.equal(kept.itemId, '');
  } finally {
    await storage.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Fremdschlüssel: verwendete Stammdaten sind nicht löschbar', async () => {
  const dir = await tmp('fk');
  const { storage } = await storageAt(dir);
  try {
    await storage.items.create(baseItem(uuidv7()));
    await assert.rejects(
      storage.settings.update((s) => ({ ...s, masterData: { ...s.masterData, categories: s.masterData.categories.filter((c) => c.name !== 'Sonstiges') } })),
      /noch verwendet/,
    );
    assert.equal((await storage.settings.get()).masterData.categories.length, 7, 'nichts geändert');
  } finally {
    await storage.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Migrationen: nur ausstehende laufen, vorher automatische Sicherung', async () => {
  const dir = await tmp('migration');
  const file = path.join(dir, 'mosaik3lab.db');
  const backupDir = path.join(dir, 'sicherungen');
  const log: string[] = [];
  try {
    const db = openDb(file);
    const base = listMigrations();
    assert.equal(migrate(db, { backupDir, log: (m) => log.push(m) }).backup, undefined, 'neue DB: keine Sicherung nötig');
    db.prepare("INSERT INTO lehrkraft (id, email, angelegt_am) VALUES ('l1', 'a@b.de', '2026-01-01')").run();
    const next = { version: base.at(-1)!.version + 1, name: 'zzz_test', sql: 'ALTER TABLE lehrkraft ADD COLUMN notiz TEXT' };
    const r = migrate(db, { backupDir, migrations: [...base, next], log: (m) => log.push(m) });
    assert.equal(r.to, next.version);
    assert.ok(r.backup && existsSync(r.backup), 'Sicherung angelegt');
    const copy = openDb(r.backup!, { readOnly: true });
    assert.equal(schemaVersion(copy), base.at(-1)!.version, 'Sicherung hat den alten Stand');
    assert.equal((copy.prepare('SELECT COUNT(*) AS n FROM lehrkraft').get() as { n: number }).n, 1);
    copy.close();
    assert.equal(migrate(db, { backupDir, migrations: [...base, next] }).from, next.version, 'zweiter Lauf: nichts zu tun');
    // Fehlerhafte Migration wird komplett zurückgerollt
    const broken = { version: next.version + 1, name: 'kaputt', sql: 'CREATE TABLE neu (id TEXT); SELECT * FROM gibt_es_nicht;' };
    assert.throws(() => migrate(db, { backupDir, migrations: [...base, next, broken] }));
    assert.equal(schemaVersion(db), next.version);
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'neu'").get(), undefined);
    db.close();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('Sitzungen: destroyForUser beendet alle eines Kontos außer der angegebenen', async () => {
  const dir = await tmp('sitzung');
  const { storage } = await storageAt(dir);
  try {
    const expiresAt = Date.now() + 60_000;
    await storage.sessions.set('s1', { data: { userId: 'u1' }, expiresAt });
    await storage.sessions.set('s2', { data: { userId: 'u1' }, expiresAt });
    await storage.sessions.set('s3', { data: { userId: 'u2' }, expiresAt });
    await storage.sessions.set('s4', { data: { requesterId: 'l1' }, expiresAt });
    assert.equal(await storage.sessions.destroyForUser('u1', 's1'), 1);
    assert.ok(await storage.sessions.get('s1'));
    assert.equal(await storage.sessions.get('s2'), undefined);
    assert.ok((await storage.sessions.get('s3')) && (await storage.sessions.get('s4')));
    assert.equal(await storage.sessions.destroyForUser('u1'), 1);
    assert.equal(await storage.sessions.get('s1'), undefined);
  } finally {
    await storage.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Sperrdatei: PID + Systemstart – veraltete Sperre nach Neustart wird erkannt', async () => {
  const boot = currentBootTime();
  const written = Number(lockContent(4242).split(' ')[1]);
  assert.ok(Math.abs(written - boot) <= 2);
  const other = process.ppid; // lebt sicher, ist aber nicht dieser Prozess
  assert.equal(lockHolder(`${other} ${boot}`), other, 'lebender Prozess, gleicher Systemstart: echte Sperre');
  assert.equal(lockHolder(`${other} ${boot - 86_400}`), null, 'PID gehört seit einem Neustart einem anderen Prozess: veraltet');
  assert.equal(lockHolder(`${process.pid} ${boot}`), null, 'eigene PID');
  assert.equal(lockHolder(`999999999 ${boot}`), null, 'Prozess existiert nicht');
  assert.equal(lockHolder(String(other)), other, 'altes Format (nur PID) wie bisher');
  assert.equal(lockHolder(''), null);
  // Ablauf mit echten Dateien: Start übernimmt die veraltete Sperre, verweigert eine echte.
  const dir = await tmp('sperre');
  await fs.mkdir(path.join(dir, 'data'), { recursive: true });
  try {
    await fs.writeFile(path.join(dir, 'data', '.lock'), `${process.ppid} ${boot - 86_400}`);
    const first = await storageAt(dir);
    await first.storage.close();
    await fs.writeFile(path.join(dir, 'data', '.lock'), `${process.ppid} ${boot}`);
    await assert.rejects(() => storageAt(dir), /wird bereits von einem anderen Serverprozess/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('transaction: hat SQLite schon selbst zurückgerollt, kommt der ursprüngliche Fehler an (nicht „no transaction is active“)', async () => {
  const dir = await tmp('tx');
  const db = openDb(path.join(dir, 'tx.db'));
  try {
    db.exec('CREATE TABLE t (x INTEGER)');
    const echt = new Error('Platte voll (Test)');
    assert.throws(
      () =>
        transaction(db, () => {
          db.exec('INSERT INTO t VALUES (1)');
          db.exec('ROLLBACK'); // wie SQLite bei SQLITE_FULL: Transaktion ist schon weg
          throw echt;
        }),
      (err) => err === echt,
    );
    assert.equal(db.isTransaction, false);
    // Verschachtelt: Savepoint schon weg → ebenfalls der ursprüngliche Fehler, die äußere Transaktion rollt sauber zurück.
    assert.throws(
      () =>
        transaction(db, () => {
          db.exec('INSERT INTO t VALUES (2)');
          transaction(db, () => {
            db.exec('ROLLBACK');
            throw echt;
          });
        }),
      (err) => err === echt,
    );
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM t').get() as { n: number }).n, 0);
    // Normaler Fehler: zurückgerollt, Fehler kommt an.
    assert.throws(() => transaction(db, () => { db.exec('INSERT INTO t VALUES (3)'); throw new Error('fachlich'); }), /fachlich/);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM t').get() as { n: number }).n, 0);
  } finally {
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
