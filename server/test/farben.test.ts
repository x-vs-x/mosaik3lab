// Farbwahl der Druckteile: „Alle Farben“ (Migration, neue Farbe kommt automatisch dazu, nur vorrätige werden angeboten)
// und das Zuordnen einer Farbrolle zu vielen Druckteilen auf einmal.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { listMigrations, migrate, openDb } from '../src/kern/db';
import { anmelden, startServer } from './helfer';

const srv = await startServer({ allowDemoAccounts: true, seedDemoData: true });
after(() => srv.stop());
const { anon, team, admin } = await anmelden(srv.base);
const items = async () => (await team.req('GET', '/api/items?all=1')).json as any[];
const md = async () => (await admin.req('GET', '/api/admin/settings')).json.masterData;
const itemBody = (i: any, colorAreas: any[]) => {
  const { id, number, images, modelFiles, videos, createdAt, updatedAt, modelFileCount, colors, ...rest } = i;
  return { ...rest, colorAreas };
};

test('Migration: Farbbereich mit allen damaligen Farben wird „Alle Farben“, Teilauswahl bleibt', async () => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-farben-'));
  const config = loadConfig({ storageDir, rootDir: storageDir, logRequests: false, seedDemoData: false, clientDistDir: path.join(storageDir, 'none') });
  const db = openDb(config.dbFile);
  migrate(db, { migrations: listMigrations().filter((m) => m.version <= 12), log: () => {} });
  const ins = db.prepare('INSERT INTO filament (id, marke, linie, farbname, hex, verfuegbar, sortierung) VALUES (?, ?, ?, ?, ?, 1, ?)');
  ['f1', 'f2', 'f3'].forEach((id, i) => ins.run(id, 'Eigen', 'PLA', `Farbe ${i}`, '#123456', i));
  db.prepare("INSERT INTO artikel (id, nummer, name, erstellt_am, geaendert_am) VALUES ('a1', 'ART-1', 'Teil', 'x', 'x')").run();
  const bereich = db.prepare('INSERT INTO artikel_farbbereich (id, artikel_id, schluessel, name, sortierung) VALUES (?, ?, ?, ?, ?)');
  bereich.run('b1', 'a1', 'griff', 'Griff', 0);
  bereich.run('b2', 'a1', 'platte', 'Platte', 1);
  const link = db.prepare('INSERT INTO artikel_farbbereich_filament (id, farbbereich_id, filament_id, sortierung) VALUES (?, ?, ?, ?)');
  ['f1', 'f2', 'f3'].forEach((f, i) => link.run(`l${i}`, 'b1', f, i));
  link.run('l9', 'b2', 'f2', 0);
  db.prepare("INSERT INTO einstellung (id, schluessel, wert, geaendert_am) VALUES ('x', 'angelegt', '\"2025-01-01\"', '2025-01-01')").run();
  db.close();

  const instance = await createApp(config);
  try {
    const [item] = await instance.storage.items.list();
    const [griff, platte] = item.colorAreas;
    assert.equal(griff.alleFarben, true);
    assert.deepEqual(griff.colors, ['f1', 'f2', 'f3']);
    assert.equal(platte.alleFarben, false);
    assert.deepEqual(platte.colors, ['f2']);
    // Neue Farbrolle → erscheint im „Alle Farben“-Bereich, nicht in der Teilauswahl.
    await instance.storage.settings.update((s) => ({
      ...s,
      masterData: {
        ...s.masterData,
        filaments: [...s.masterData.filaments, { ...s.masterData.filaments[0], id: 'f4', colorName: 'Neu', available: true }],
      },
    }));
    const [nachher] = await instance.storage.items.list();
    assert.deepEqual(nachher.colorAreas[0].colors, ['f1', 'f2', 'f3', 'f4']);
    assert.deepEqual(nachher.colorAreas[1].colors, ['f2']);
  } finally {
    await instance.close();
    await fs.rm(storageDir, { recursive: true, force: true });
  }
});

test('„Alle Farben“: neue Farbrolle kommt automatisch dazu, nicht vorrätige wird nicht angeboten', async () => {
  const [item] = (await items()).filter((i: any) => i.colorAreas.length === 1);
  const r = await team.req('PUT', `/api/items/${item.id}`, itemBody(item, [{ id: item.colorAreas[0].id, name: 'Farbe', alleFarben: true, colors: [] }]));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.colorAreas[0].alleFarben, true);

  const imp = await admin.req('POST', '/api/admin/settings/masterdata/filaments/import', { ids: ['bambu-pla-matte-sky-blue'] });
  assert.equal(imp.status, 200);
  const neu = (await items()).find((i: any) => i.id === item.id);
  assert.ok(neu.colorAreas[0].colors.includes('bambu-pla-matte-sky-blue'), 'neue Farbe automatisch dabei');

  // Leer markiert → als nicht vorrätig gekennzeichnet; Katalog und Anfrageformular bieten nur vorrätige an
  // (client/src/lib/filaments.ts), der Server lehnt Anfragen mit leerer Farbe ab (anfragen.service resolveColors).
  assert.equal((await team.req('PATCH', '/api/filaments/bambu-pla-matte-sky-blue/availability', { available: false })).status, 200);
  const cfg = (await anon.req('GET', '/api/config')).json.masterData.filaments;
  assert.equal(cfg.find((f: any) => f.id === 'bambu-pla-matte-sky-blue').available, false, 'nicht vorrätig');
  const anfrage = await anon.req('POST', '/api/orders', {
    itemId: item.id, quantity: 1, colors: { [item.colorAreas[0].id]: 'bambu-pla-matte-sky-blue' }, size: item.sizes[0],
    classOrTeam: '1a', requesterName: 'Test', requesterEmail: 'test.lehrkraft@mosaikschule-lu.de',
  });
  assert.equal(anfrage.status, 400);
  assert.match(JSON.stringify(anfrage.json), /[Ff]arbe/, 'abgelehnt wegen der leeren Farbe: ' + JSON.stringify(anfrage.json));
  assert.equal((await team.req('PATCH', '/api/filaments/bambu-pla-matte-sky-blue/availability', { available: true })).status, 200);

  // Ohne Farbe und ohne „Alle Farben“ geht nicht.
  const leer = await team.req('PUT', `/api/items/${item.id}`, itemBody(item, [{ id: 'farbe', name: 'Farbe', colors: [] }]));
  assert.equal(leer.status, 400);
});

test('Farbe vielen Druckteilen zuordnen: in einem Rutsch, „Alle Farben“ unberührt, Fehler ändert nichts', async () => {
  const alle = await items();
  const ziele = alle.filter((i: any) => i.colorAreas.some((a: any) => !a.alleFarben)).slice(0, 3);
  const mitAlle = alle.find((i: any) => i.colorAreas.some((a: any) => a.alleFarben));
  assert.ok(ziele.length >= 2 && mitAlle);
  const body = {
    filamentId: 'bambu-abs-azure',
    ziele: [...ziele, mitAlle].map((i: any) => ({ itemId: i.id, bereiche: i.colorAreas.map((a: any) => a.id) })),
  };
  // Farbrolle gibt es noch nicht → 404
  assert.equal((await team.req('POST', '/api/items/farbe-zuordnen', body)).status, 404);
  await admin.req('POST', '/api/admin/settings/masterdata/filaments/import', { ids: ['bambu-abs-azure'] });
  // Lehrkraft/anonym: kein Recht
  assert.equal((await anon.req('POST', '/api/items/farbe-zuordnen', body)).status, 401);

  // Ein unbekanntes Druckteil am Ende → nichts wird geändert (Transaktion).
  const kaputt = await team.req('POST', '/api/items/farbe-zuordnen', { ...body, ziele: [...body.ziele, { itemId: 'gibt-es-nicht', bereiche: ['farbe'] }] });
  assert.equal(kaputt.status, 400);
  assert.ok(!(await items()).some((i: any) => i.colorAreas.some((a: any) => !a.alleFarben && a.colors.includes('bambu-abs-azure'))));

  const r = await team.req('POST', '/api/items/farbe-zuordnen', body);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.druckteile, ziele.length, '„Alle Farben“-Teil zählt nicht');
  const nachher = await items();
  for (const z of ziele) {
    const i = nachher.find((x: any) => x.id === z.id);
    assert.ok(i.colorAreas.every((a: any) => a.colors.includes('bambu-abs-azure')), i.name);
  }
  assert.equal(nachher.find((x: any) => x.id === mitAlle.id).colorAreas.find((a: any) => a.alleFarben)?.alleFarben, true);
  // Zweimal zuordnen ändert nichts mehr.
  assert.equal((await team.req('POST', '/api/items/farbe-zuordnen', body)).json.druckteile, 0);
  // Eine zugeordnete Farbrolle kann nicht gelöscht werden (wird verwendet).
  const { filaments } = await md();
  const del = await admin.req('PUT', '/api/admin/settings/masterdata/filaments', { entries: filaments.filter((f: any) => f.id !== 'bambu-abs-azure') });
  assert.equal(del.status, 409);
});
