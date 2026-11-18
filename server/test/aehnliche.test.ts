// Ähnliche Druckteile: gegenseitige Verknüpfung, Rechte, Aufräumen beim Löschen, Sichtbarkeit für Besucher.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { anmelden, startServer } from './helfer';

const srv = await startServer({ allowDemoAccounts: true, seedDemoData: true });
after(() => srv.stop());
const { anon, teacher, team } = await anmelden(srv.base);

const alle = (await team.req('GET', '/api/items?all=1')).json as any[];
const [a, b, c] = alle.filter((i) => i.published);
const entwurf = alle.find((i) => !i.published);
const ids = (r: { json: any[] }) => r.json.map((x) => x.id).sort();

test('Verknüpfung gilt gegenseitig und liefert kleine Karten', async () => {
  const r = await team.req('POST', `/api/items/${a.id}/aehnliche`, { id: b.id });
  assert.equal(r.status, 201);
  assert.deepEqual(ids(r), [b.id]);
  assert.deepEqual(Object.keys(r.json[0]).sort(), ['category', 'id', 'image', 'name', 'published', 'shortDescription']);
  // doppelt anlegen (auch andersherum) schadet nicht
  assert.equal((await team.req('POST', `/api/items/${b.id}/aehnliche`, { id: a.id })).status, 201);
  assert.deepEqual(ids(await anon.req('GET', `/api/items/${b.id}/aehnliche`)), [a.id]);
  assert.deepEqual(ids(await anon.req('GET', `/api/items/${a.id}/aehnliche`)), [b.id]);
  // Entfernen von der anderen Seite aus hebt sie überall auf
  assert.deepEqual((await team.req('DELETE', `/api/items/${b.id}/aehnliche/${a.id}`)).json, []);
  assert.deepEqual((await anon.req('GET', `/api/items/${a.id}/aehnliche`)).json, []);
});

test('Pflegen nur mit catalog:manage; sich selbst und unbekannte IDs werden abgelehnt', async () => {
  assert.equal((await anon.req('POST', `/api/items/${a.id}/aehnliche`, { id: b.id })).status, 401);
  assert.equal((await teacher.req('POST', `/api/items/${a.id}/aehnliche`, { id: b.id })).status, 403);
  assert.equal((await teacher.req('DELETE', `/api/items/${a.id}/aehnliche/${b.id}`)).status, 403);
  assert.equal((await team.req('POST', `/api/items/${a.id}/aehnliche`, { id: a.id })).status, 400);
  assert.equal((await team.req('POST', `/api/items/${a.id}/aehnliche`, { id: 'gibt-es-nicht' })).status, 400);
  assert.equal((await team.req('POST', `/api/items/${a.id}/aehnliche`, {})).status, 400);
  assert.equal((await team.req('POST', '/api/items/gibt-es-nicht/aehnliche', { id: a.id })).status, 404);
  assert.deepEqual((await team.req('GET', `/api/items/${a.id}/aehnliche`)).json, []);
});

test('Unveröffentlichte Teile sehen Besucher nicht', async () => {
  assert.ok(entwurf, 'Demo-Daten haben einen Entwurf');
  await team.req('POST', `/api/items/${a.id}/aehnliche`, { id: entwurf.id });
  await team.req('POST', `/api/items/${a.id}/aehnliche`, { id: c.id });
  assert.deepEqual(ids(await anon.req('GET', `/api/items/${a.id}/aehnliche`)), [c.id]);
  assert.deepEqual(ids(await teacher.req('GET', `/api/items/${a.id}/aehnliche`)), [c.id]);
  assert.deepEqual(ids(await team.req('GET', `/api/items/${a.id}/aehnliche`)), [c.id, entwurf.id].sort());
  // Seite des Entwurfs selbst: für Besucher nicht vorhanden
  assert.equal((await anon.req('GET', `/api/items/${entwurf.id}/aehnliche`)).status, 404);
});

test('Löschen eines Druckteils räumt seine Verknüpfungen auf', async () => {
  assert.equal((await team.req('DELETE', `/api/items/${c.id}`)).status, 200);
  assert.deepEqual(ids(await team.req('GET', `/api/items/${a.id}/aehnliche`)), [entwurf.id]);
  assert.equal((await team.req('GET', `/api/items/${c.id}/aehnliche`)).status, 404);
});
