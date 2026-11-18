// Bildinhalt ersetzen (PUT /api/items/:id/images/:file) – für „Vorhandene Bilder verkleinern“.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, test } from 'node:test';
import { anmelden, form, PNG_1PX, startServer } from './helfer';

const srv = await startServer({ allowDemoAccounts: true, seedDemoData: true });
after(() => srv.stop());
const { teacher, team } = await anmelden(srv.base);

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('verkleinert')]);
const datei = (name: string, inhalt: Buffer, type: string) => {
  const fd = new FormData();
  fd.append('file', new Blob([inhalt], { type }), name);
  return fd;
};
const ablage = async () => (await fs.readdir(path.join(srv.storageDir, 'ablage'), { recursive: true })).map(String);

let itemId: string;
let bilder: string[];
test('Vorbereitung: Druckteil mit zwei Bildern', async () => {
  itemId = (await team.req('GET', '/api/items?all=1')).json[0].id;
  for (const n of ['eins.png', 'zwei.png']) {
    const r = await team.req('POST', `/api/items/${itemId}/images`, undefined, { form: form(n, PNG_1PX, 'image/png') });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    bilder = r.json.images;
  }
  assert.ok(bilder.length >= 2);
});

test('Ohne Recht zum Bearbeiten von Druckteilen: 403', async () => {
  const r = await teacher.req('PUT', `/api/items/${itemId}/images/${bilder[0]}`, undefined, { form: datei('a.jpg', JPG, 'image/jpeg') });
  assert.equal(r.status, 403);
});

test('Falscher Inhalt, fehlende Datei oder fremdes Bild werden abgelehnt', async () => {
  const url = `/api/items/${itemId}/images/${bilder[0]}`;
  assert.equal((await team.req('PUT', url, undefined, { form: datei('a.jpg', Buffer.from('kein bild'), 'image/jpeg') })).status, 400);
  assert.equal((await team.req('PUT', url, undefined, { form: datei('a.jpg', PNG_1PX, 'image/jpeg') })).status, 400, 'Endung passt nicht zum Inhalt');
  assert.equal((await team.req('PUT', url, undefined, { form: datei('a.exe', JPG, 'image/jpeg') })).status, 400);
  assert.equal((await team.req('PUT', url, undefined, { form: new FormData() })).status, 400);
  const fremd = `/api/items/${itemId}/images/00000000-0000-0000-0000-000000000000.png`;
  assert.equal((await team.req('PUT', fremd, undefined, { form: datei('a.jpg', JPG, 'image/jpeg') })).status, 404);
});

test('PNG wird durch JPG ersetzt: gleiche ID, gleiche Reihenfolge, alte Datei weg', async () => {
  const [erstes, ...rest] = bilder;
  const id = erstes.replace(/\.png$/, '');
  const r = await team.req('PUT', `/api/items/${itemId}/images/${erstes}`, undefined, { form: datei('eins.jpg', JPG, 'image/jpeg') });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.images, [`${id}.jpg`, ...rest]);
  const dateien = await ablage();
  assert.ok(dateien.some((p) => p.endsWith(`${id}.jpg`)), 'neue Datei liegt in der Ablage');
  assert.ok(!dateien.some((p) => p.endsWith(erstes)), 'alte PNG-Datei ist gelöscht');
  const bild = await team.req('GET', `/api/files/images/${id}.jpg`);
  assert.equal(bild.status, 200);
  assert.match(bild.headers.get('content-type') ?? '', /image\/jpeg/);
  const pfad = dateien.find((p) => p.endsWith(`${id}.jpg`))!;
  assert.deepEqual(await fs.readFile(path.join(srv.storageDir, 'ablage', pfad)), JPG);
  assert.equal((await team.req('GET', `/api/files/images/${erstes}`)).status, 404);
});

test('Gleiche Endung: Inhalt wird überschrieben', async () => {
  const zweites = bilder[1];
  const neu = Buffer.concat([PNG_1PX, Buffer.from('x')]);
  const r = await team.req('PUT', `/api/items/${itemId}/images/${zweites}`, undefined, { form: datei('zwei.png', neu, 'image/png') });
  assert.equal(r.status, 200);
  assert.equal(r.json.images[1], zweites);
  const pfad = (await ablage()).find((p) => p.endsWith(zweites))!;
  assert.equal((await fs.readFile(path.join(srv.storageDir, 'ablage', pfad))).length, neu.length);
  assert.ok(!(await ablage()).some((p) => p.endsWith('.neu')), 'keine Zwischendateien übrig');
});
