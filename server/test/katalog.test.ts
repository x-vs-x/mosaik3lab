// Katalog: öffentliche Konfiguration, Druckteile sehen/anlegen, Uploads (Bilder, STL), Ablagepfade.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, test } from 'node:test';
import { DEFAULT_FILAMENT_IDS } from '../src/domain/bambuKatalog';
import { anmelden, ASCII_STL, form, PNG_1PX, SCHOOL, startServer } from './helfer';

const srv = await startServer({ allowDemoAccounts: true, seedDemoData: true });
after(() => srv.stop());
const { anon, teacher, team } = await anmelden(srv.base);

test('GET /api/config ohne Login enthält Farbrollen und Bestellformular', async () => {
  const r = await anon.req('GET', '/api/config');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.masterData.filaments) && r.json.masterData.filaments.length > 0);
  assert.deepEqual(r.json.orderForm, { allowedEmailDomains: [SCHOOL] });
  assert.equal(r.json.features.requesterTracking, false);
  assert.deepEqual(
    r.json.masterData.orderStatuses.map((s: any) => s.id),
    ['offen', 'in_pruefung', 'in_druck', 'gedruckt', 'abholbereit', 'uebergeben', 'abgelehnt', 'storniert'],
    'feste Statusliste',
  );
  assert.deepEqual(
    r.json.masterData.orderStatuses.filter((s: any) => s.active).map((s: any) => s.id),
    ['offen', 'gedruckt'],
    'Standard: „In Druck“ ist aus',
  );
  assert.ok(r.json.masterData.filaments.every((f: any) => f.available === true));
  assert.equal(r.json.mail, undefined, 'keine Mail-Einstellungen öffentlich');
});
test('Demo-Druckteile verwenden nur Standard-Farbrollen', async () => {
  const items = (await team.req('GET', '/api/items?all=1')).json;
  const ids = new Set((await anon.req('GET', '/api/config')).json.masterData.filaments.map((f: any) => f.id));
  for (const i of items) {
    for (const c of i.colors) {
      assert.ok(DEFAULT_FILAMENT_IDS.includes(c) && ids.has(c), `${i.name}: Farbe ${c}`);
    }
  }
});
let publishedItem: any;
let hiddenItem: any;
test('Lehrkraft sieht nur veröffentlichte Druckteile', async () => {
  const r = await teacher.req('GET', '/api/items?all=1');
  assert.equal(r.status, 200);
  assert.ok(r.json.length >= 8, 'mindestens 8 Demo-Druckteile');
  assert.ok(r.json.every((i: any) => i.published));
  publishedItem = r.json[0];
  const all = await team.req('GET', '/api/items?all=1');
  hiddenItem = all.json.find((i: any) => !i.published);
  assert.ok(hiddenItem, 'es gibt einen unveröffentlichten Eintrag');
  assert.equal((await teacher.req('GET', `/api/items/${hiddenItem.id}`)).status, 404);
});
test('Suche und Filter funktionieren', async () => {
  const r = await teacher.req('GET', '/api/items?q=stift');
  assert.ok(r.json.some((i: any) => i.name.includes('Stift')));
  const c = await teacher.req('GET', `/api/items?category=${encodeURIComponent('Kommunikation')}`);
  assert.ok(c.json.length > 0 && c.json.every((i: any) => i.category === 'Kommunikation'));
  const a = await teacher.req('GET', `/api/items?area=${encodeURIComponent('Mahlzeiten')}`);
  assert.ok(a.json.length > 0 && a.json.every((i: any) => i.useAreas.includes('Mahlzeiten')));
});
test('Lehrkraft darf Katalog nicht verwalten', async () => {
  assert.equal((await teacher.req('POST', '/api/items', {})).status, 403);
  assert.equal((await teacher.req('DELETE', `/api/items/${publishedItem.id}`)).status, 403);
  assert.equal((await teacher.req('PATCH', `/api/items/${publishedItem.id}/publish`, { published: false })).status, 403);
  assert.equal((await teacher.req('POST', `/api/items/${publishedItem.id}/images`, undefined, { form: form('a.png', PNG_1PX) })).status, 403);
});

let newItem: any;
test('Druck-Team legt Druckteil an (mit Validierung)', async () => {
  const bad = await team.req('POST', '/api/items', { name: 'x' });
  assert.equal(bad.status, 400);
  assert.ok(bad.json.fields?.name);
  const body = {
    name: 'Test-Druckteil', shortDescription: 'Eine Kurzbeschreibung für den Test.', category: 'Sonstiges',
    useAreas: ['Unterricht'], colors: ['bambu-pla-basic-red', 'bambu-pla-basic-red', 'bambu-pla-basic-cyan'],
    sizes: ['S'], material: 'PLA', printTimeMinutes: 30, published: true,
  };
  const oldColor = await team.req('POST', '/api/items', { ...body, colors: ['Rot'] });
  assert.equal(oldColor.status, 400, 'Farbnamen statt Filament-IDs werden abgelehnt');
  assert.ok(oldColor.json.fields?.colors);
  const badCat = await team.req('POST', '/api/items', { ...body, category: 'Gibt es nicht' });
  assert.equal(badCat.status, 400);
  assert.ok(badCat.json.fields?.category);
  const r = await team.req('POST', '/api/items', body);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.deepEqual(r.json.colors, ['bambu-pla-basic-red', 'bambu-pla-basic-cyan'], 'doppelte Werte werden entfernt');
  newItem = r.json;
});
test('Art (Hilfsmittel/Lehrmittel/beides) wird gespeichert und im Katalog filterbar', async () => {
  assert.equal(newItem.kind, 'hilfsmittel', 'Standard-Art');
  const bad = await team.req('PUT', `/api/items/${newItem.id}`, { ...newItem, kind: 'sonstiges' });
  assert.equal(bad.status, 400);
  const ok = await team.req('PUT', `/api/items/${newItem.id}`, { ...newItem, kind: 'lehrmittel' });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(ok.json.kind, 'lehrmittel');
  const nur = await anon.req('GET', '/api/items?kind=lehrmittel');
  assert.ok(nur.json.some((i: any) => i.id === newItem.id) && nur.json.every((i: any) => i.kind !== 'hilfsmittel'));
  const hilfs = await anon.req('GET', '/api/items?kind=hilfsmittel');
  assert.ok(!hilfs.json.some((i: any) => i.id === newItem.id), 'Lehrmittel nicht unter Hilfsmittel');
  assert.ok(hilfs.json.some((i: any) => i.kind === 'beides'), 'Art beides erscheint in beiden Filtern');
  newItem = ok.json;
});

test('Gültiges PNG wird angenommen; Bilder von Entwürfen nur fürs Team', async () => {
  const r = await team.req('POST', `/api/items/${newItem.id}/images`, undefined, { form: form('foto.png', PNG_1PX, 'image/png') });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const file = r.json.images[0];
  assert.match(file, /^[a-f0-9-]{36}\.png$/);
  assert.equal((await anon.req('GET', `/api/files/images/${file}`)).status, 200, 'veröffentlicht → öffentlich');
  await team.req('PATCH', `/api/items/${newItem.id}/publish`, { published: false });
  assert.equal((await anon.req('GET', `/api/files/images/${file}`)).status, 404, 'Entwurf → verborgen');
  assert.equal((await team.req('GET', `/api/files/images/${file}`)).status, 200);
  await team.req('PATCH', `/api/items/${newItem.id}/publish`, { published: true });
});
test('Fehlt die Datei auf der Platte (Backup ohne Dateien), kommt ein Platzhalter statt eines kaputten Bildes', async () => {
  const item = (await team.req('GET', `/api/items/${newItem.id}`)).json;
  const file = item.images[0] as string;
  const onDisk = (await fs.readdir(path.join(srv.storageDir, 'ablage'), { recursive: true })).map(String).find((p) => p.endsWith(file));
  assert.ok(onDisk, 'Datei in der Ablage gefunden');
  const full = path.join(srv.storageDir, 'ablage', onDisk);
  await fs.rename(full, `${full}.weg`);
  try {
    const raw = await fetch(`${srv.base}/api/files/images/${file}`);
    assert.equal(raw.status, 200);
    assert.equal(raw.headers.get('x-datei-fehlt'), '1');
    assert.match(raw.headers.get('content-type') ?? '', /image\/svg\+xml/);
    assert.match(await raw.text(), /Datei nicht vorhanden/);
  } finally {
    await fs.rename(`${full}.weg`, full);
  }
  assert.equal((await anon.req('GET', `/api/files/images/${file}`)).status, 200);
});
test('Falsche Dateitypen werden abgelehnt', async () => {
  const fake = await team.req('POST', `/api/items/${newItem.id}/images`, undefined, { form: form('fake.png', 'kein bild') });
  assert.equal(fake.status, 400);
  const exe = await team.req('POST', `/api/items/${newItem.id}/images`, undefined, { form: form('virus.exe', 'MZ...') });
  assert.equal(exe.status, 400);
  const badModel = await team.req('POST', `/api/items/${newItem.id}/models`, undefined, { form: form('teil.stl', 'hallo') });
  assert.equal(badModel.status, 400);
});
test('Pfadangriffe auf Bilder werden abgewiesen', async () => {
  const r = await teacher.req('GET', '/api/files/images/..%2F..%2Fdata%2Fusers.json');
  assert.equal(r.status, 404);
});
test('Zu große Bilder werden abgelehnt', async () => {
  const big = Buffer.concat([PNG_1PX, Buffer.alloc(6 * 1024 * 1024)]);
  const r = await team.req('POST', `/api/items/${newItem.id}/images`, undefined, { form: form('gross.png', big, 'image/png') });
  assert.equal(r.status, 413);
});
let model: any;
test('STL-Datei wird gespeichert und nur als Download für das Team ausgeliefert', async () => {
  const r = await team.req('POST', `/api/items/${newItem.id}/models`, undefined, { form: form('Halter.stl', ASCII_STL) });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  model = r.json.modelFiles[0];
  const dl = await team.req('GET', `/api/files/models/${newItem.id}/${model.id}`);
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-disposition') ?? '', /attachment/);
  assert.equal(dl.headers.get('content-type'), 'application/octet-stream');
  assert.equal((await teacher.req('GET', `/api/files/models/${newItem.id}/${model.id}`)).status, 403);
  const asTeacher = await teacher.req('GET', `/api/items/${newItem.id}`);
  assert.equal(asTeacher.json.modelFiles.length, 0, 'Lehrkraft sieht keine Dateidetails');
  assert.equal(asTeacher.json.modelFileCount, 1);
});
test('Druckteil löschen entfernt Dateien', async () => {
  const r = await team.req('DELETE', `/api/items/${newItem.id}`);
  assert.equal(r.status, 200);
  assert.equal(existsSync(path.join(srv.storageDir, 'ablage', 'artikel', newItem.id)), false, 'Ordner des Artikels ist weg');
});
test('Neue Uploads landen in <ablage>/artikel/<id>/bild/<datei-id>.<endung>', async () => {
  const up = await team.req('POST', `/api/items/${publishedItem.id}/images`, undefined, { form: form('foto.png', PNG_1PX, 'image/png') });
  assert.equal(up.status, 201, JSON.stringify(up.json));
  const file = up.json.images.at(-1);
  assert.ok(existsSync(path.join(srv.storageDir, 'ablage', 'artikel', publishedItem.id, 'bild', file)));
  assert.equal((await anon.req('GET', `/api/files/images/${file}`)).status, 200);
});
