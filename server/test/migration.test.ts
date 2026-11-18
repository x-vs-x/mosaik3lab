// Migrationen der Datenbank: Session-Geheimnis, Schutz vor älteren Programmversionen, Migrationen 020–023.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { getBetrieb } from '../src/kern/betrieb';
import { openDb } from '../src/kern/db';
test('Die App erzeugt ein zufälliges Session-Geheimnis in der Datenbank (nicht als Datei)', async () => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-migration-'));
  const config = loadConfig({ storageDir, rootDir: storageDir, logRequests: false, seedDemoData: false, clientDistDir: path.join(storageDir, 'none') });
  const inst = await createApp(config);
  try {
    const secret = getBetrieb(inst.storage.sqlite.db, 'betrieb', 'sessionSecret');
    assert.ok(typeof secret === 'string' && secret.length >= 64);
    assert.ok(!existsSync(path.join(storageDir, 'data', '.session-secret')));
  } finally {
    await inst.close();
    await fs.rm(storageDir, { recursive: true, force: true });
  }
});
test('Datenbank aus einer neueren Version (z. B. zurückgespielte Sicherung): App startet nicht, klare Meldung', async () => {
  const { migrate } = await import('../src/kern/db');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-neuer-'));
  const db = openDb(path.join(dir, 'test.db'));
  try {
    const eins = [{ version: 1, name: '001_a', sql: 'CREATE TABLE a (x INTEGER)' }];
    const zwei = [...eins, { version: 2, name: '002_b', sql: 'CREATE TABLE b (x INTEGER)' }];
    migrate(db, { migrations: zwei, log: () => {} }); // „neuere Version“ hat Stand 2 eingespielt
    assert.throws(() => migrate(db, { migrations: eins, log: () => {} }), /neueren Version von Mosaik³LAB \(Datenbank-Stand 2, dieses Programm kennt 1\)/);
    assert.deepEqual(migrate(db, { migrations: zwei, log: () => {} }), { from: 2, to: 2 }, 'gleiche Version startet normal');
  } finally {
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Migration 020 (ähnliche Druckteile im Austausch): bestehende Druckteile und Verknüpfungen bleiben, Herkunft leer, Vormerkungen mit Druckteil weg', async () => {
  const { migrate, listMigrations } = await import('../src/kern/db');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-mig020-'));
  const db = openDb(path.join(dir, 'test.db'));
  try {
    const alle = listMigrations();
    migrate(db, { migrations: alle.filter((m) => m.version <= 19), log: () => {} });
    const jetzt = new Date().toISOString();
    for (const [id, nr] of [['teil-a', 'ART-0001'], ['teil-b', 'ART-0002']]) {
      db.prepare('INSERT INTO artikel (id, nummer, name, erstellt_am, geaendert_am) VALUES (?, ?, ?, ?, ?)').run(id, nr, `Teil ${nr}`, jetzt, jetzt);
    }
    db.prepare('INSERT INTO artikel_aehnlich (a, b) VALUES (?, ?)').run('teil-a', 'teil-b');
    const vorher = db.prepare('SELECT id, nummer, name, erstellt_am FROM artikel ORDER BY id').all();
    migrate(db, { migrations: alle, log: () => {} });
    assert.ok(alle.some((m) => m.version === 20));
    assert.deepEqual(db.prepare('SELECT id, nummer, name, erstellt_am FROM artikel ORDER BY id').all(), vorher, 'Druckteile unverändert');
    assert.deepEqual(db.prepare('SELECT DISTINCT herkunft_id FROM artikel').all().map((r: any) => r.herkunft_id), [''], 'Standard: keine Herkunft');
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM artikel_aehnlich').get() as any).n, 1, 'Verknüpfung bleibt');
    db.prepare("INSERT INTO artikel_aehnlich_offen (artikel_id, partner_herkunft) VALUES ('teil-a', 'fehlt-noch')").run();
    db.prepare("DELETE FROM artikel WHERE id = 'teil-a'").run();
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM artikel_aehnlich_offen').get() as any).n, 0, 'Vormerkung mit dem Druckteil gelöscht');
  } finally {
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Update 1.7.0 → Migrationen 021 (nur Indizes) und 022 (benutzer_recht weg): übrige Tabellen bleiben Zeile für Zeile gleich, vorher Sicherung', async () => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-mig021-'));
  const config = loadConfig({ storageDir, rootDir: storageDir, logRequests: false, seedDemoData: true, allowDemoAccounts: true, clientDistDir: path.join(storageDir, 'none') });
  const dbFile = path.join(storageDir, 'mosaik3lab.db');
  const INDIZES = ['artikel_farbbereich_filament_filament', 'artikel_einsatzbereich_einsatzbereich', 'artikel_kategorie', 'artikel_material', 'anfrage_erstellt'];
  const TABELLEN = [
    'benutzer', 'benutzer_bereich', 'lehrkraft', 'passwort_link', 'kategorie', 'einsatzbereich', 'material', 'filament', 'statusart',
    'artikel', 'artikel_einsatzbereich', 'artikel_farbbereich', 'artikel_farbbereich_filament', 'artikel_feld', 'artikel_video', 'artikel_aehnlich',
    'artikel_aehnlich_offen', 'anfrage', 'anfrage_farbe', 'anfrage_feldwert', 'anfrage_statusverlauf', 'vorschlag', 'datei', 'nummernkreis', 'einstellung',
  ];
  const dump = () => {
    const db = openDb(dbFile, { readOnly: true });
    try {
      return Object.fromEntries(TABELLEN.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
    } finally {
      db.close();
    }
  };
  try {
    // 1) Stand wie 1.7.0: App mit Demo-Daten anlegen, danach Migrationen 021 und 022 zurücknehmen (Indizes weg, alte Tabelle
    //    benutzer_recht samt Zeile wieder da, Schema 20) – so sieht auch eine ältere Sicherung aus, die wiederhergestellt wird.
    const erst = await createApp(config);
    await erst.close();
    const alt = openDb(dbFile);
    for (const i of INDIZES) alt.exec(`DROP INDEX ${i}`);
    alt.exec(`CREATE TABLE benutzer_recht (
      id TEXT PRIMARY KEY, benutzer_id TEXT NOT NULL REFERENCES benutzer (id) ON DELETE CASCADE, recht TEXT NOT NULL,
      erlaubt INTEGER NOT NULL, UNIQUE (benutzer_id, recht))`);
    const konto = (alt.prepare('SELECT id FROM benutzer LIMIT 1').get() as { id: string }).id;
    alt.prepare('INSERT INTO benutzer_recht (id, benutzer_id, recht, erlaubt) VALUES (?, ?, ?, 1)').run('r1', konto, 'catalog:view');
    // 023 (Kategorien-Zuordnung) gehört ebenfalls noch nicht zum Stand 1.7.0.
    alt.exec('DROP TABLE artikel_kategorien');
    alt.exec('DELETE FROM schema_version WHERE version >= 21');
    alt.close();
    const vorher = dump();
    assert.ok(vorher.artikel.length > 0 && vorher.anfrage.length > 0 && vorher.filament.length > 0, 'Demo-Daten vorhanden');

    // 2) Neue Version startet: spielt 021 und 022 ein, sichert vorher, ändert keine Zeile der übrigen Tabellen.
    const neu = await createApp(config);
    try {
      const db = openDb(dbFile, { readOnly: true });
      const da = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((r: any) => r.name);
      const tabellen = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => (r as { name: string }).name);
      const version = (db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as any).v;
      db.close();
      assert.equal(version, 23);
      assert.ok(!tabellen.includes('benutzer_recht'), 'alte Tabelle benutzer_recht entfernt');
      for (const i of INDIZES) assert.ok(da.includes(i), `Index ${i}`);
      const nachher = dump();
      for (const t of TABELLEN) assert.deepEqual(nachher[t], vorher[t], `Tabelle ${t} unverändert`);
      const sicherungen = await fs.readdir(path.join(storageDir, 'sicherungen'));
      assert.ok(sicherungen.some((f) => /^mosaik3lab-vor-schema-021-.*\.db$/.test(f)), 'Sicherung vor der Migration');
      // Die App arbeitet normal weiter (Lesen über die Repositories).
      const items = await neu.storage.items.list();
      assert.equal(items.length, vorher.artikel.length);
      // 023: jedes Druckteil hat seine (bisher einzige) Kategorie als Liste.
      const kategorieName = new Map(vorher.kategorie.map((k: any) => [k.id, k.name]));
      for (const a of vorher.artikel as any[]) assert.deepEqual(items.find((i) => i.id === a.id)?.categories, [kategorieName.get(a.kategorie_id)], a.name);
      assert.equal((await neu.storage.orders.list()).length, vorher.anfrage.length);
    } finally {
      await neu.close();
    }
  } finally {
    await fs.rm(storageDir, { recursive: true, force: true });
  }
});

test('Update 1.6.3 (Schema 017) → 023: jedes Druckteil behält seine Kategorie, alle übrigen Tabellen bleiben Zeile für Zeile gleich', async () => {
  const { migrate, listMigrations } = await import('../src/kern/db');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-mig023-'));
  const db = openDb(path.join(dir, 'test.db'));
  try {
    const alle = listMigrations();
    migrate(db, { migrations: alle.filter((m) => m.version <= 17), log: () => {} });
    const jetzt = new Date().toISOString();
    for (const [id, name, i] of [['kat-a', 'Alltagshilfen', 0], ['kat-b', 'Feinmotorik', 1], ['kat-c', 'Leer', 2]] as const) {
      db.prepare("INSERT INTO kategorie (id, name, farbe, symbol, sortierung) VALUES (?, ?, 'blau', 'hand', ?)").run(id, name, i);
    }
    db.prepare("INSERT INTO material (id, name, sortierung) VALUES ('mat', 'PLA', 0)").run();
    db.prepare("INSERT INTO einsatzbereich (id, name, sortierung) VALUES ('ber', 'Unterricht', 0)").run();
    const teile = [['teil-a', 'ART-0001', 'kat-a'], ['teil-b', 'ART-0002', 'kat-b'], ['teil-c', 'ART-0003', 'kat-a'], ['teil-ohne', 'ART-0004', null]] as const;
    for (const [id, nr, kat] of teile) {
      db.prepare("INSERT INTO artikel (id, nummer, name, kategorie_id, material_id, erstellt_am, geaendert_am) VALUES (?, ?, ?, ?, 'mat', ?, ?)").run(id, nr, `Teil ${nr}`, kat, jetzt, jetzt);
    }
    db.prepare("INSERT INTO artikel_einsatzbereich (id, artikel_id, einsatzbereich_id, sortierung) VALUES ('ae1', 'teil-a', 'ber', 0)").run();
    // Alle Tabellen mit ihren Spalten im Stand 017 merken (benutzer_recht entfernt 022 bewusst).
    const tabellen = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('schema_version', 'benutzer_recht')").all() as { name: string }[]).map((r) => r.name);
    const spalten = new Map(tabellen.map((t) => [t, (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name)]));
    const dump = () => Object.fromEntries(tabellen.map((t) => [t, db.prepare(`SELECT ${spalten.get(t)!.join(', ')} FROM ${t} ORDER BY rowid`).all()]));
    const vorher = dump();

    migrate(db, { migrations: alle, log: () => {} });
    assert.equal((db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as any).v, 23);
    const nachher = dump();
    for (const t of tabellen) assert.deepEqual(nachher[t], vorher[t], `Tabelle ${t} unverändert`);
    const zuordnung = db.prepare('SELECT artikel_id, kategorie_id, sortierung FROM artikel_kategorien ORDER BY artikel_id').all().map((r) => ({ ...r }));
    assert.deepEqual(zuordnung, [
      { artikel_id: 'teil-a', kategorie_id: 'kat-a', sortierung: 0 },
      { artikel_id: 'teil-b', kategorie_id: 'kat-b', sortierung: 0 },
      { artikel_id: 'teil-c', kategorie_id: 'kat-a', sortierung: 0 },
    ], 'jede bisherige Kategorie übernommen, Druckteil ohne Kategorie bleibt ohne');
    // Löschen eines Druckteils räumt die Zuordnung auf; eine verwendete Kategorie lässt sich nicht löschen.
    db.prepare("DELETE FROM artikel WHERE id = 'teil-c'").run();
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM artikel_kategorien WHERE artikel_id = 'teil-c'").get() as any).n, 0);
    assert.throws(() => db.prepare("DELETE FROM kategorie WHERE id = 'kat-b'").run(), /FOREIGN KEY/);
  } finally {
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
