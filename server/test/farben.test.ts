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
  // (client/src/lib/colors.ts, availableFilaments), der Server lehnt Anfragen mit leerer Farbe ab (anfragen.service resolveColors).
  assert.equal((await team.req('PATCH', '/api/filaments/bambu-pla-matte-sky-blue/availability', { available: false })).status, 200);
  const cfg = (await anon.req('GET', '/api/config')).json.masterData.filaments;
  assert.equal(cfg.find((f: any) => f.id === 'bambu-pla-matte-sky-blue').available, false, 'nicht vorrätig');
  const anfrage = await anon.req('POST', '/api/orders', {
    itemId: item.id, quantity: 1, colors: { [item.colorAreas[0].id]: 'bambu-pla-matte-sky-blue' }, size: item.sizes[0],
    classOrTeam: '1a', requesterName: 'Test', requesterEmail: 'test.lehrkraft@schule.example',
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
  // Eine zugeordnete Farbrolle lässt sich löschen – sie verschwindet dabei aus allen Druckteilen.
  const { filaments } = await md();
  const del = await admin.req('PUT', '/api/admin/settings/masterdata/filaments', { entries: filaments.filter((f: any) => f.id !== 'bambu-abs-azure') });
  assert.equal(del.status, 200, JSON.stringify(del.json));
  const ohne = await items();
  assert.ok(!ohne.some((i: any) => i.colors.includes('bambu-abs-azure') || i.colorAreas.some((a: any) => a.colors.includes('bambu-abs-azure'))));
});

test('Farbrolle löschen: letzte Farbe eines Bereichs → dort „Alle Farben“, Druckteil bleibt gültig', async () => {
  const [item] = (await items()).filter((i: any) => i.colorAreas.length === 1);
  const { filaments } = await md();
  const einzige = filaments.find((f: any) => f.available).id;
  const r = await team.req('PUT', `/api/items/${item.id}`, itemBody(item, [{ id: 'farbe', name: 'Farbe', colors: [einzige] }]));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const del = await admin.req('PUT', '/api/admin/settings/masterdata/filaments', { entries: filaments.filter((f: any) => f.id !== einzige) });
  assert.equal(del.status, 200, JSON.stringify(del.json));
  const nachher = (await items()).find((i: any) => i.id === item.id);
  assert.equal(nachher.colorAreas[0].alleFarben, true);
  assert.ok(!nachher.colors.includes(einzige));
  // Speichern des Druckteils klappt weiter.
  assert.equal((await team.req('PUT', `/api/items/${item.id}`, itemBody(nachher, nachher.colorAreas))).status, 200);
});

test('Ganze Linie / ganzes Material: später angelegte Rollen kommen dazu, Abwählen nimmt sie wieder weg', async () => {
  const [item] = (await items()).filter((i: any) => i.colorAreas.length === 1);
  const { filaments } = await md();
  const tpu = filaments.find((f: any) => /^TPU/.test(f.line)).id;
  const r = await team.req('PUT', `/api/items/${item.id}`, itemBody(item, [{ id: 'farbe', name: 'Farbe', colors: [tpu], gruppen: ['art:PLA'] }]));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const area = r.json.colorAreas[0];
  assert.deepEqual(area.gruppen, ['art:PLA']);
  assert.ok(area.colors.includes(tpu), 'einzeln gewählte TPU-Farbe bleibt');
  const plaIds = filaments.filter((f: any) => /^PLA/i.test(f.line)).map((f: any) => f.id);
  assert.ok(plaIds.length > 0 && plaIds.every((id: string) => area.colors.includes(id)), 'alle PLA dabei');
  assert.ok(!area.colors.some((id: string) => filaments.find((f: any) => f.id === id && /^PETG/.test(f.line))), 'kein PETG');

  // Neue PLA-Rolle (eigene Marke) kommt automatisch dazu, neue PETG-Rolle nicht.
  const neu = await admin.req('PUT', '/api/admin/settings/masterdata/filaments', {
    entries: [...filaments, { brand: 'Eigen', line: 'PLA Glitzer', colorName: 'Lila', hex: '#8800ff' }, { brand: 'Eigen', line: 'PETG', colorName: 'Grau', hex: '#888888' }],
  });
  assert.equal(neu.status, 200, JSON.stringify(neu.json));
  const lila = neu.json.filaments.find((f: any) => f.colorName === 'Lila' && f.brand === 'Eigen').id;
  const grau = neu.json.filaments.find((f: any) => f.colorName === 'Grau' && f.brand === 'Eigen').id;
  const mitNeu = (await items()).find((i: any) => i.id === item.id).colorAreas[0];
  assert.ok(mitNeu.colors.includes(lila));
  assert.ok(!mitNeu.colors.includes(grau));

  // Die Oberfläche schickt alle Farben mit zurück – der Server speichert nur die nicht abgedeckten einzeln.
  const zurueck = await team.req('PUT', `/api/items/${item.id}`, itemBody(item, [{ ...mitNeu, gruppen: [] }].map((a) => ({ ...a, colors: [tpu] }))));
  assert.equal(zurueck.status, 200);
  assert.deepEqual(zurueck.json.colorAreas[0].colors, [tpu]);
  // Nur eine Gruppe ohne Einzelfarben ist gültig.
  const nurLinie = await team.req('PUT', `/api/items/${item.id}`, itemBody(item, [{ id: 'farbe', name: 'Farbe', colors: [], gruppen: ['linie:Eigen PLA Glitzer'] }]));
  assert.equal(nurLinie.status, 200, JSON.stringify(nurLinie.json));
  assert.deepEqual(nurLinie.json.colorAreas[0].colors, [lila]);
  // Gruppen-Farbe ist bestellbar.
  const anfrage = await anon.req('POST', '/api/orders', {
    itemId: item.id, quantity: 1, colors: { farbe: lila }, size: item.sizes[0] ?? '',
    classOrTeam: '1a', requesterName: 'Test', requesterEmail: 'test.lehrkraft@schule.example',
  });
  assert.equal(anfrage.status, 201, JSON.stringify(anfrage.json));
});

test('Größen sind freiwillig: Druckteil ohne Größen speichern und ohne Größe anfragen', async () => {
  const [item] = (await items()).filter((i: any) => i.colorAreas.length === 1 && i.published);
  const r = await team.req('PUT', `/api/items/${item.id}`, { ...itemBody(item, item.colorAreas), sizes: [] });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.sizes, []);
  const area = r.json.colorAreas[0];
  const { filaments } = await md();
  const farbe = area.colors.find((id: string) => filaments.find((f: any) => f.id === id)?.available);
  const body = { itemId: item.id, quantity: 1, colors: { [area.id]: farbe }, classOrTeam: '1a', requesterName: 'Test', requesterEmail: 'test.lehrkraft@schule.example' };
  const ok = await anon.req('POST', '/api/orders', body);
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  assert.equal(ok.json.size ?? '', '');
  assert.equal((await anon.req('POST', '/api/orders', { ...body, size: 'XL' })).status, 400, 'Größe, die es nicht gibt');
});

test('Eigene Linie umbenennen: gewählte Gruppen der Druckteile ziehen mit; mehrdeutig oder gelöscht bleibt die Gruppe', async () => {
  const alle = await items();
  const [item, unbeteiligt] = alle.filter((i: any) => i.colorAreas.length === 1);
  const { filaments } = await md();
  const neu = await admin.req('PUT', '/api/admin/settings/masterdata/filaments', {
    entries: [...filaments, { brand: 'Werkstatt', line: 'ZZX Matt', colorName: 'Rot', hex: '#cc0000' }, { brand: 'Werkstatt', line: 'ZZX Matt', colorName: 'Blau', hex: '#0000cc' }],
  });
  assert.equal(neu.status, 200, JSON.stringify(neu.json));
  const eigene = (l: any[]) => l.filter((f: any) => f.brand === 'Werkstatt' || f.brand === 'Labor');
  const [rot, blau] = eigene(neu.json.filaments).map((f: any) => f.id);
  const setze = async (gruppen: string[]) => {
    const r = await team.req('PUT', `/api/items/${item.id}`, itemBody(item, [{ id: 'farbe', name: 'Farbe', colors: [], gruppen }]));
    assert.equal(r.status, 200, JSON.stringify(r.json));
  };
  const bereich = async () => (await items()).find((i: any) => i.id === item.id).colorAreas[0];
  const speichere = async (aendern: (f: any) => any) => {
    const { filaments: jetzt } = await md();
    const r = await admin.req('PUT', '/api/admin/settings/masterdata/filaments', { entries: jetzt.map((f: any) => (f.id === rot || f.id === blau ? aendern(f) : f)) });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  };
  await setze(['linie:Werkstatt ZZX Matt', 'art:ZZX']);
  assert.deepEqual((await bereich()).colors.sort(), [rot, blau].sort());
  const unbeteiligtVorher = (await items()).find((i: any) => i.id === unbeteiligt.id).updatedAt;

  // 1) Linie (und damit die Materialart) eindeutig umbenannt → beide Gruppen folgen, die Farben bleiben gewählt.
  await speichere((f) => ({ ...f, line: 'QQY Seide' }));
  let b = await bereich();
  assert.deepEqual(b.gruppen, ['linie:Werkstatt QQY Seide', 'art:QQY']);
  assert.deepEqual(b.colors.sort(), [rot, blau].sort());
  assert.equal((await items()).find((i: any) => i.id === unbeteiligt.id).updatedAt, unbeteiligtVorher, 'andere Druckteile bleiben unberührt');

  // 2) Marke umbenannt → Linie folgt, Materialart bleibt.
  await speichere((f) => ({ ...f, brand: 'Labor' }));
  b = await bereich();
  assert.deepEqual(b.gruppen, ['linie:Labor QQY Seide', 'art:QQY']);
  assert.deepEqual(b.colors.sort(), [rot, blau].sort());

  // 3) Auf zwei Linien verteilt → mehrdeutig: Gruppen bleiben stehen (kein Raten).
  await speichere((f) => ({ ...f, line: f.id === rot ? 'QQA Matt' : 'QQB Matt' }));
  b = await bereich();
  assert.deepEqual(b.gruppen, ['linie:Labor QQY Seide', 'art:QQY']);

  // 4) Rollen gelöscht → Gruppe bleibt, das Druckteil bleibt gültig und speicherbar.
  await setze(['linie:Labor QQA Matt']);
  assert.deepEqual((await bereich()).colors, [rot]);
  const { filaments: vorLoeschen } = await md();
  const del = await admin.req('PUT', '/api/admin/settings/masterdata/filaments', { entries: vorLoeschen.filter((f: any) => f.id !== rot && f.id !== blau) });
  assert.equal(del.status, 200, JSON.stringify(del.json));
  b = await bereich();
  assert.deepEqual(b.gruppen, ['linie:Labor QQA Matt']);
  assert.deepEqual(b.colors, []);
  const nachher = (await items()).find((i: any) => i.id === item.id);
  assert.equal((await team.req('PUT', `/api/items/${item.id}`, itemBody(nachher, nachher.colorAreas))).status, 200);
  await setze(['art:PLA']); // aufräumen für die folgenden Tests
});

test('Farbrolle löschen und Liste speichern in einem Schritt: scheitert das Speichern, bleibt auch das Druckteil unverändert', async () => {
  const [item] = (await items()).filter((i: any) => i.colorAreas.length === 1);
  const { filaments } = await md();
  const neu = await admin.req('PUT', '/api/admin/settings/masterdata/filaments', { entries: [...filaments, { brand: 'Test', line: 'PLA', colorName: 'Weg', hex: '#123456' }] });
  const weg = neu.json.filaments.find((f: any) => f.colorName === 'Weg').id;
  assert.equal((await team.req('PUT', `/api/items/${item.id}`, itemBody(item, [{ id: 'farbe', name: 'Farbe', colors: [weg, filaments[0].id] }]))).status, 200);
  const vorher = (await items()).find((i: any) => i.id === item.id);
  // Ungültige Liste (doppelter Eintrag) → 400, nichts geändert – weder Farbrollen noch Druckteil.
  const ohne = neu.json.filaments.filter((f: any) => f.id !== weg);
  const kaputt = await admin.req('PUT', '/api/admin/settings/masterdata/filaments', { entries: [...ohne, { ...ohne.at(-1), id: undefined, katalogId: undefined }] });
  assert.equal(kaputt.status, 400);
  assert.deepEqual((await items()).find((i: any) => i.id === item.id).colorAreas, vorher.colorAreas);
  assert.ok((await md()).filaments.some((f: any) => f.id === weg));
  // Gültig → Rolle weg, im Druckteil entfernt.
  assert.equal((await admin.req('PUT', '/api/admin/settings/masterdata/filaments', { entries: ohne })).status, 200);
  assert.deepEqual((await items()).find((i: any) => i.id === item.id).colorAreas[0].colors, [filaments[0].id]);
});

test('items.updateMany: wirft der Schritt danach (z. B. Farbrollen speichern), bleiben alle Druckteile unverändert', async () => {
  const zwei = (await items()).slice(0, 2);
  const vorher = await Promise.all(zwei.map((i: any) => srv.storage.items.findById(i.id)));
  await assert.rejects(
    srv.storage.items.updateMany(
      zwei.map((i: any) => i.id),
      (c) => ({ ...c, name: `${c.name} (geändert)` }),
      { danach: () => { throw new Error('Speichern der Liste gescheitert'); } },
    ),
    /Speichern der Liste gescheitert/,
  );
  assert.deepEqual(await Promise.all(zwei.map((i: any) => srv.storage.items.findById(i.id))), vorher);
  // Ohne Fehler: beide geändert, undefined = nichts zu tun.
  const r = await srv.storage.items.updateMany([zwei[0].id, zwei[1].id], (c) => (c.id === zwei[0].id ? { ...c, price: '1 €' } : undefined));
  assert.deepEqual(r.geaendert, [zwei[0].id]);
  assert.equal((await srv.storage.items.findById(zwei[0].id))?.price, '1 €');
  assert.deepEqual(await srv.storage.items.findById(zwei[1].id), vorher[1]);
});
