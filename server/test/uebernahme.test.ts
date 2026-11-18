// Übernahme JSON → SQLite (auch aus früher abweichenden Ordnern), db:backup und Skript für das erste Admin-Konto.
// Mit echten Daten:  MOSAIK3LAB_ECHTDATEN=<Kopie eines storage-Ordners> npm test -w server
// (der Ordner wird nur gelesen und vorher in einen Temp-Ordner kopiert).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { uuidv7 } from '../src/kern/ids';
import { createAdminAccount } from '../src/module/konten/konten.service';
import { listMigrations, openDb } from '../src/kern/db';
import { IMPORT_KEY, type ImportReport } from '../src/storage/sqlite/importJson';
import { baseItem, MP4, PNG, sha, STL, storageAt, tmp } from './helfer';
/** Legt einen Datenordner im Format der JSON-Zeit an (mit Bildern, Druckdatei, Video). */
async function legacyFixture(dir: string) {
  const data = path.join(dir, 'data');
  const up = (n: string) => path.join(dir, 'uploads', n);
  for (const d of [data, up('images'), up('models'), up('videos')]) await fs.mkdir(d, { recursive: true });
  const img = `${crypto.randomUUID()}.png`;
  const model = `${crypto.randomUUID()}.stl`;
  const vid = `${crypto.randomUUID()}.mp4`;
  await fs.writeFile(path.join(up('images'), img), PNG);
  await fs.writeFile(path.join(up('models'), model), STL);
  await fs.writeFile(path.join(up('videos'), vid), MP4);
  const itemId = crypto.randomUUID();
  const modelId = crypto.randomUUID();
  const requesterId = crypto.randomUUID();
  await fs.writeFile(path.join(data, 'users.json'), JSON.stringify([
    { id: 'u1', username: 'chef', email: 'chef@schule.example', displayName: 'Chef', role: 'admin', passwordHash: 'x', active: true, isDemo: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', lastLoginAt: null },
    { id: 'u2', username: 'team', email: 'team@schule.example', displayName: 'Team', role: 'druckteam', passwordHash: 'x', active: true, isDemo: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', lastLoginAt: null, permissionOverrides: { 'orders:manage': false } },
  ]));
  await fs.writeFile(path.join(data, 'requesters.json'), JSON.stringify([{ id: requesterId, email: 'lehrer@schule.example', createdAt: '2026-01-02T00:00:00.000Z', lastOrderAt: '2026-01-03T00:00:00.000Z' }]));
  await fs.writeFile(path.join(data, 'items.json'), JSON.stringify([{
    ...baseItem(itemId), name: 'Altes Teil', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    images: [img, 'fehlt-1234.png'],
    modelFiles: [{ id: modelId, storedName: model, originalName: 'Original.stl', format: 'stl', sizeBytes: STL.length, uploadedAt: '2026-01-01T00:00:00.000Z' }],
    videos: [{ id: crypto.randomUUID(), title: 'Film', file: vid, url: '', sizeBytes: MP4.length, uploadedAt: '2026-01-01T00:00:00.000Z' }, { id: crypto.randomUUID(), title: 'Link', file: '', url: 'https://example.org', sizeBytes: 0, uploadedAt: '2026-01-01T00:00:00.000Z' }],
  }]));
  await fs.writeFile(path.join(data, 'orders.json'), JSON.stringify([{
    id: crypto.randomUUID(), number: 'M3L-2026-0001', itemId, itemName: 'Altes Teil', quantity: 2, color: 'Rot', colorId: '', colorHex: '', size: 'S', classOrTeam: '3a', customization: '',
    status: 'offen', history: [{ status: 'offen', at: '2026-01-03T00:00:00.000Z', byUserId: '', byName: 'x', comment: '' }], requesterId, requesterEmail: 'lehrer@schule.example',
    requesterName: 'lehrer@schule.example', trackingCode: 'ABC', isDemo: false, createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z',
  }]));
  await fs.writeFile(path.join(data, 'sessions.json'), JSON.stringify({ sid1: { data: { cookie: {}, userId: 'u1' }, expiresAt: Date.now() + 86_400_000 }, alt: { data: {}, expiresAt: 1 } }));
  return { img, model, vid, itemId, modelId, requesterId };
}

async function hashTree(dir: string) {
  const out: Record<string, string> = {};
  if (!existsSync(dir)) return out;
  for (const e of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    if (e.isFile()) out[path.relative(dir, path.join(e.parentPath, e.name))] = await sha(path.join(e.parentPath, e.name));
  }
  return out;
}

test('Übernahme JSON → SQLite: Datensätze, Dateien (SHA-256), Rechte, Sitzungen; idempotent; JSON bleibt', async () => {
  const dir = await tmp('uebernahme');
  try {
    const f = await legacyFixture(dir);
    const before = { data: await hashTree(path.join(dir, 'data')), uploads: await hashTree(path.join(dir, 'uploads')) };
    const first = await storageAt(dir);
    const report = first.storage.importReport!;
    assert.equal(report.ergebnis, 'uebernommen');
    assert.equal(report.anzahl.benutzer.db, 2);
    assert.equal(report.anzahl.artikel.db, 1);
    assert.equal(report.anzahl.anfragen.db, 1);
    assert.equal(report.anzahl.sitzungen.db, 1, 'abgelaufene Sitzung nicht übernommen');
    assert.deepEqual(report.dateien, { erwartet: 4, uebernommen: 3, fehlend: 1, sha256Geprueft: 3, bytes: PNG.length + STL.length + MP4.length });
    assert.ok(report.hinweise.some((h) => h.includes('fehlt-1234.png')));

    const item = (await first.storage.items.findById(f.itemId))!;
    assert.equal(item.number, 'ART-0001');
    assert.deepEqual(item.images, [f.img], 'Bildname (= URL) bleibt gleich');
    assert.equal(item.modelFiles[0].id, f.modelId, 'Download-Link der Druckdatei bleibt gleich');
    assert.equal(item.modelFiles[0].originalName, 'Original.stl');
    assert.equal(item.videos[0].file, f.vid);
    assert.equal(item.videos[1].url, 'https://example.org');
    const bild = first.storage.files.findByName(f.img)!;
    assert.equal(bild.pfad, `artikel/${f.itemId}/bild/${f.img}`);
    assert.equal(await sha(first.storage.files.absPath(bild)), before.uploads[path.join('images', f.img)]);
    const order = (await first.storage.orders.list())[0];
    assert.equal(order.number, 'M3L-2026-0001', 'alte Nummer bleibt');
    assert.equal(order.requesterId, f.requesterId);
    assert.equal(order.itemId, f.itemId);
    // Alte Einzelrechte werden zu den Standard-Häkchen des Druck-Teams (niemand verliert etwas).
    assert.deepEqual((await first.storage.users.findById('u2'))!.teamBereiche, ['team-anfragen', 'team-druckteile', 'team-farbrollen', 'team-vorschlaege']);
    assert.ok(await first.storage.sessions.get('sid1'));
    const neu = await first.storage.orders.create({ ...order, id: uuidv7(), createdAt: '2026-02-01T00:00:00.000Z' } as never);
    assert.equal(neu.number, 'ANF-2026-0001', 'neue Anfragen bekommen ANF-Nummern');
    await first.storage.close();

    // JSON-Dateien und alte Ablage sind unverändert.
    assert.deepEqual(await hashTree(path.join(dir, 'uploads')), before.uploads);
    const dataAfter = await hashTree(path.join(dir, 'data'));
    for (const [k, v] of Object.entries(before.data)) assert.equal(dataAfter[k], v, `${k} unverändert`);

    // Zweiter Start: keine zweite Übernahme, nichts doppelt.
    const second = await storageAt(dir);
    assert.equal(second.storage.importReport, undefined);
    assert.equal(await second.storage.items.count(), 1);
    assert.equal(await second.storage.orders.count(), 2);
    assert.equal(second.storage.files.listByTyp('artikel').length, 3);
    await second.storage.close();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Übernahme: Fehler → nichts eingetragen, kopierte Dateien entfernt, beim nächsten Start erneut', async () => {
  const dir = await tmp('uebernahme-fehler');
  try {
    await legacyFixture(dir);
    // Ungültige Daten: Anfrage mit doppelter ID → Primärschlüssel verletzt
    const ordersFile = path.join(dir, 'data', 'orders.json');
    const orders = JSON.parse(await fs.readFile(ordersFile, 'utf8'));
    await fs.writeFile(ordersFile, JSON.stringify([...orders, { ...orders[0], number: 'M3L-2026-0002' }]));
    await assert.rejects(storageAt(dir), /Übernahme der JSON-Daten ist fehlgeschlagen/);
    assert.deepEqual(await hashTree(path.join(dir, 'ablage')), {}, 'keine halben Kopien');
    const db = openDb(path.join(dir, 'mosaik3lab.db'), { readOnly: true });
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM artikel').get() as { n: number }).n, 0);
    assert.equal(db.prepare('SELECT 1 FROM einstellung WHERE schluessel = ?').get(IMPORT_KEY), undefined);
    db.close();
    await fs.writeFile(ordersFile, JSON.stringify(orders));
    const ok = await storageAt(dir);
    assert.equal(ok.storage.importReport?.ergebnis, 'uebernommen');
    await ok.storage.close();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Übernahme aus früher abweichend eingestellten Ordnern (mosaik3lab.config.json), danach Datei gesichert und entfernt', async () => {
  const dir = await tmp('pfade');
  const alt = path.join(dir, 'alt');
  const prev = process.env.STORAGE_DIR;
  try {
    const f = await legacyFixture(alt);
    await fs.writeFile(path.join(dir, 'mosaik3lab.config.json'), JSON.stringify({
      dataDir: path.join(alt, 'data'),
      imagesDir: path.join(alt, 'uploads', 'images'),
      modelsDir: path.join(alt, 'uploads', 'models'),
      videosDir: path.join(alt, 'uploads', 'videos'),
    }));
    process.env.STORAGE_DIR = path.join(dir, 'neu');
    const config = loadConfig({ rootDir: dir, logRequests: false, seedDemoData: false, clientDistDir: path.join(dir, 'none') });
    assert.equal(config.imagesDir, path.join(alt, 'uploads', 'images'), 'alter Bilderordner ist Quelle');
    const instance = await createApp(config);
    try {
      assert.equal(instance.storage.importReport?.dateien.uebernommen, 3);
      assert.ok(existsSync(path.join(dir, 'neu', 'ablage', 'artikel', f.itemId, 'bild', f.img)), 'Bild liegt in der neuen Ablage');
      assert.ok(!existsSync(path.join(dir, 'mosaik3lab.config.json')), 'alte Pfad-Datei entfernt');
      assert.equal((await fs.readdir(dir)).filter((n) => n.startsWith('mosaik3lab.config.json.vor-ablage-umzug-')).length, 1, 'mit Sicherung');
      assert.ok(existsSync(path.join(alt, 'uploads', 'images', f.img)), 'alte Ablage bleibt liegen');
    } finally {
      await instance.close();
    }
  } finally {
    if (prev === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = prev;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

const echt = process.env.MOSAIK3LAB_ECHTDATEN;
if (echt) {
  test(`Übernahme mit Kopie echter Daten (${echt})`, async () => {
    const dir = await tmp('echt');
    try {
      const original = await hashTree(echt);
      await fs.cp(echt, dir, { recursive: true, filter: (s) => !/(\.lock|mosaik3lab\.db(-wal|-shm)?)$/.test(s) });
      const { storage } = await storageAt(dir);
      const r = storage.importReport as ImportReport;
      console.log(`      Ergebnis: ${r.ergebnis}; ${Object.entries(r.anzahl).map(([k, v]) => `${k} ${v.json}→${v.db}`).join(', ')}`);
      console.log(`      Dateien: ${r.dateien.uebernommen}/${r.dateien.erwartet} kopiert, ${r.dateien.sha256Geprueft} per SHA-256 geprüft, ${r.dateien.fehlend} fehlend, ${r.dateien.bytes} Bytes`);
      for (const h of r.hinweise) console.log(`      Hinweis: ${h}`);
      assert.equal(r.ergebnis, 'uebernommen');
      for (const [k, v] of Object.entries(r.anzahl)) assert.equal(v.db, v.json, k);
      // Jede übernommene Datei ist über die Datenbank auffindbar und identisch mit dem Original.
      for (const d of storage.files.listByTyp('artikel')) {
        const legacyDir = { bild: 'images', druckdatei: 'models', video: 'videos' }[d.rolle as 'bild'];
        const old = Object.entries(original).find(([p]) => p.startsWith(path.join('uploads', legacyDir)) && p.endsWith(`${d.id}${path.extname(d.pfad)}`));
        if (old) assert.equal(d.sha256, old[1], d.pfad);
        assert.equal(await sha(storage.files.absPath(d)), d.sha256);
      }
      await storage.close();
      assert.deepEqual(await hashTree(echt), original, 'Quellordner unverändert');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
}

test('db:backup: konsistente Kopie im laufenden Betrieb, eine Zeile, Exit 0/1', async () => {
  const dir = await tmp('dbbackup');
  const config = loadConfig({ storageDir: dir, rootDir: dir, logRequests: false, seedDemoData: true, clientDistDir: path.join(dir, 'none') });
  const instance = await createApp(config);
  try {
    // Health liefert den DB-Zustand für den Server-Manager.
    const server = instance.app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const health = (await (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/health`)).json()) as { db: { vorhanden: boolean; schemaVersion: number; groesseBytes: number } };
    await new Promise((r) => server.close(r));
    assert.equal(health.db.vorhanden, true);
    assert.equal(health.db.schemaVersion, listMigrations().at(-1)!.version);
    assert.ok(health.db.groesseBytes > 0);

    const ziel = path.join(dir, 'sicherung', 'kopie.db');
    const run = (...args: string[]) =>
      spawnSync(process.execPath, ['--import', 'tsx', 'scripts/db-backup.ts', ...args], { cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8' });
    const ok = run('--ziel', ziel, '--quelle', config.dbFile);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.equal(ok.stdout.trim().split(/\r?\n/).length, 1);
    assert.match(ok.stdout, /^OK .*kopie\.db \(\d+ Bytes, Schema \d+\)/);
    const copy = openDb(ziel, { readOnly: true });
    assert.equal((copy.prepare('SELECT COUNT(*) AS n FROM artikel').get() as { n: number }).n, await instance.storage.items.count(), 'auch Daten aus dem WAL enthalten');
    copy.close();
    const again = run('--ziel', ziel, '--quelle', config.dbFile);
    assert.equal(again.status, 1);
    assert.match(again.stdout.trim(), /^FEHLER: Zieldatei existiert bereits/);
    const missing = run('--ziel', path.join(dir, 'x.db'), '--quelle', path.join(dir, 'gibt-es-nicht.db'));
    assert.equal(missing.status, 1);
    assert.match(missing.stdout.trim(), /^FEHLER: Datenbank nicht gefunden/);
  } finally {
    await instance.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('Erstes Admin-Konto: Skript legt es an, Passwort nur über Umgebung/stdin', async () => {
  const dir = await tmp('admin');
  try {
    const run = (args: string[], env: Record<string, string>, input?: string) =>
      spawnSync(process.execPath, ['--import', 'tsx', 'scripts/create-admin.ts', ...args], {
        cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8', input, env: { ...process.env, STORAGE_DIR: dir, ...env },
      });
    const lastLine = (r: ReturnType<typeof run>) => r.stdout.trim().split(/\r?\n/).pop() ?? '';
    const kurz = run(['--email', 'erste@schule.test', '--name', 'Erste Person'], { M3L_ADMIN_PASSWORD: 'kurz' });
    assert.equal(kurz.status, 1);
    assert.match(lastLine(kurz), /^FEHLER: Mindestens 8 Zeichen/);
    const ohne = run(['--email', 'erste@schule.test', '--name', 'Erste Person'], {}, '');
    assert.match(lastLine(ohne), /^FEHLER: Passwort fehlt/);
    const ok = run(['--email', 'Erste@Schule.test', '--name', 'Erste Person'], {}, 'Langes-Passwort-1\n');
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(lastLine(ok), /^OK /);
    assert.ok(!ok.stdout.includes('Langes-Passwort-1') && !ok.stderr.includes('Langes-Passwort-1'), 'Passwort wird nie ausgegeben');
    const doppelt = run(['--email', 'erste@schule.test', '--name', 'Doppelt'], { M3L_ADMIN_PASSWORD: 'Langes-Passwort-1' });
    assert.match(lastLine(doppelt), /^FEHLER: Es gibt bereits ein Konto/);
    const { storage } = await storageAt(dir);
    try {
      const u = await storage.users.findByEmail('erste@schule.test');
      assert.ok(u && u.role === 'admin' && u.active && !u.isDemo);
      const zweiter = await createAdminAccount(storage, { email: 'erste.zwei@schule.test', name: 'Zweite Person', password: 'Langes-Passwort-2' });
      assert.equal(zweiter.username, 'erste.zwei');
    } finally {
      await storage.close();
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
