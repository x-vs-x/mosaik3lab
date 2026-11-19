// Stammdaten: Kategorien, Materialien, Farbrollen (inkl. leer/verfügbar) und feste Status.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { anmelden, Client, demoTeile, orderBodyFor, startServer } from './helfer';

const srv = await startServer({ allowDemoAccounts: true, seedDemoData: true });
after(() => srv.stop());
const { anon, teacher, team, admin } = await anmelden(srv.base);
const { publishedItem } = await demoTeile(teacher, team);
const orderBody = orderBodyFor(publishedItem);
// Stand wie im Ablauf zuvor: „In Druck“ ist eingeschaltet (Status-Test schaltet ihn wieder aus).
await admin.req('PATCH', '/api/admin/settings/order-statuses/in_druck', { active: true });
const putList = (c: Client, list: string, entries: unknown[]) =>
  c.req('PUT', `/api/admin/settings/masterdata/${list}`, { entries });
const md = async () => (await admin.req('GET', '/api/admin/settings')).json.masterData;
test('Stammdaten ändern: Admin ja, Druck-Team und Lehrkraft nein', async () => {
  const { categories } = await md();
  assert.equal((await putList(team, 'categories', categories)).status, 403);
  assert.equal((await putList(teacher, 'categories', categories)).status, 403);
  assert.equal((await team.req('GET', '/api/admin/settings')).status, 403);
  const r = await putList(admin, 'categories', categories);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.categories, categories);
  assert.equal((await putList(admin, 'unbekannt', [])).status, 404);
  // Auch Namen, die jedes Objekt von Haus aus kennt, sind keine Liste (früher 500 statt 404).
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.equal((await putList(admin, name, [])).status, 404, name);
});
test('Verwendete Kategorie kann nicht gelöscht werden (409)', async () => {
  const { categories } = await md();
  const r = await putList(admin, 'categories', categories.filter((c: any) => c.name !== 'Kommunikation'));
  assert.equal(r.status, 409);
  assert.ok((await md()).categories.some((c: any) => c.name === 'Kommunikation'));
});
test('Umbenennen einer Kategorie zieht Druckteile nach (Bezug per ID, ohne die Druckteile neu zu schreiben)', async () => {
  const { categories } = await md();
  const stand = new Map(((await team.req('GET', '/api/items?all=1')).json as any[]).map((i) => [i.id, i.updatedAt]));
  const next = categories.map((c: any) => (c.name === 'Sonstiges' ? { ...c, name: 'Sonstiges & Weiteres' } : c));
  const r = await putList(admin, 'categories', next);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const items = (await team.req('GET', '/api/items?all=1')).json;
  assert.ok(!items.some((i: any) => i.categories.includes('Sonstiges')));
  assert.ok(items.some((i: any) => i.categories.includes('Sonstiges & Weiteres')));
  assert.ok(items.every((i: any) => i.updatedAt === stand.get(i.id)), 'kein Druckteil neu geschrieben');
  const material = (await md()).materials.map((m: any) => (m.name === 'PLA' ? { ...m, name: 'PLA (Standard)' } : m));
  assert.equal((await putList(admin, 'materials', material)).status, 200);
  assert.ok((await team.req('GET', '/api/items?all=1')).json.some((i: any) => i.material === 'PLA (Standard)'));
  assert.equal((await putList(admin, 'materials', material.map((m: any) => (m.name === 'PLA (Standard)' ? { ...m, name: 'PLA' } : m)))).status, 200);
  await putList(admin, 'categories', categories);
  const back = (await team.req('GET', '/api/items?all=1')).json;
  assert.ok(back.some((i: any) => i.categories.includes('Sonstiges')));
});
test('Doppelte Namen und leere Pflichtlisten werden abgelehnt', async () => {
  const { materials } = await md();
  assert.equal((await putList(admin, 'materials', [...materials, { name: 'pla' }])).status, 400);
  assert.equal((await putList(admin, 'materials', [])).status, 400);
});
test('Ungültiger Eintrag: Meldung nennt Zeile und Feld, fields je Zeilenindex', async () => {
  const { categories, filaments } = await md();
  const leer = [...categories.slice(0, 7), { ...categories[0], id: undefined, name: '  ' }];
  const r = await putList(admin, 'categories', leer);
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'Zeile 8: Name fehlt.');
  assert.deepEqual(r.json.fields, { 7: 'Name fehlt' });
  const hex = await putList(admin, 'filaments', [{ ...filaments[0], id: undefined, katalogId: undefined, hex: 'blau' }]);
  assert.equal(hex.status, 400);
  assert.match(hex.json.error, /^Zeile 1: Farbwert: Farbwert im Format #RRGGBB\.$/);
  assert.equal((await md()).categories.length, categories.length, 'nichts gespeichert');
});
test('Farbrollen: löschbar (auch verwendete), neue erhalten eine UUID', async () => {
  const { filaments } = await md();
  const next = [
    ...filaments.filter((f: any) => f.id !== 'bambu-pla-basic-black'),
    { brand: 'Eigen', line: 'PLA', colorName: 'Testgrün', hex: '#00ff00' },
    { id: 'frei-erfunden', brand: 'Eigen', line: 'PLA', colorName: 'Testrot', hex: '#FF0000' },
  ];
  const r = await putList(admin, 'filaments', next);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(!r.json.filaments.some((f: any) => f.id === 'bambu-pla-basic-black'));
  const green = r.json.filaments.find((f: any) => f.colorName === 'Testgrün');
  const red = r.json.filaments.find((f: any) => f.colorName === 'Testrot');
  assert.match(green.id, /^[0-9a-f-]{36}$/);
  assert.match(red.id, /^[0-9a-f-]{36}$/, 'unbekannte ID wird ersetzt');
  assert.equal(green.hex, '#00FF00');
  const badHex = await putList(admin, 'filaments', [...filaments, { brand: 'X', line: 'Y', colorName: 'Z', hex: 'grün' }]);
  assert.equal(badHex.status, 400);
  // Farbrolle der Druckteile per ID → Umbenennen ändert die Druckteile nicht
  const renamed = r.json.filaments.map((f: any) => (f.id === 'bambu-tpu-95a-hf-black' ? { ...f, colorName: 'Tiefschwarz' } : f));
  assert.equal((await putList(admin, 'filaments', renamed)).status, 200);
  const items = (await team.req('GET', '/api/items?all=1')).json;
  assert.ok(items.some((i: any) => i.colors.includes('bambu-tpu-95a-hf-black')));
});
test('Status sind fest: nur an-/ausschaltbar, „Offen“ und letzter erledigt-Status bleiben an', async () => {
  const toggle = (c: Client, id: string, active: boolean) =>
    c.req('PATCH', `/api/admin/settings/order-statuses/${id}`, { active });
  assert.equal((await putList(admin, 'orderStatuses', [])).status, 404, 'keine freie Liste mehr');
  assert.equal((await toggle(team, 'abholbereit', true)).status, 403);
  assert.equal((await toggle(teacher, 'abholbereit', true)).status, 403);
  assert.equal((await toggle(admin, 'gibt-es-nicht', true)).status, 404);
  assert.equal((await admin.req('PATCH', '/api/admin/settings/order-statuses/abholbereit', { active: 'ja' })).status, 400);
  assert.equal((await toggle(admin, 'offen', false)).status, 400);
  const on = await toggle(admin, 'abholbereit', true);
  assert.equal(on.status, 200, JSON.stringify(on.json));
  assert.equal(on.json.orderStatuses.find((s: any) => s.id === 'abholbereit').active, true);
  // in_druck wird von einer Anfrage verwendet – Ausschalten ist trotzdem erlaubt, die Anfrage behält ihn.
  assert.equal((await toggle(admin, 'in_druck', false)).status, 200);
  assert.equal((await toggle(admin, 'abholbereit', false)).status, 200);
  const last = await toggle(admin, 'gedruckt', false);
  assert.equal(last.status, 400, 'mindestens ein erledigt-Status bleibt an');
  const orders = (await team.req('GET', '/api/orders')).json;
  assert.ok(orders.some((o: any) => o.status === 'in_druck'), 'Anfragen behalten ausgeschaltete Status');
  const dash = (await team.req('GET', '/api/dashboard')).json;
  assert.ok(dash.orders.byStatus.in_druck >= 1);
});
test('Farbrollen leer/verfügbar: Druck-Team schaltet, Anfragen mit leerer Farbe werden abgelehnt', async () => {
  const id = publishedItem.colors[0];
  const set = (c: Client, available: unknown) => c.req('PATCH', `/api/filaments/${id}/availability`, { available });
  assert.equal((await set(anon, false)).status, 401);
  assert.equal((await set(teacher, false)).status, 403);
  assert.equal((await set(team, 'leer')).status, 400);
  assert.equal((await team.req('PATCH', '/api/filaments/gibt-es-nicht/availability', { available: false })).status, 404);
  const off = await set(team, false);
  assert.equal(off.status, 200, JSON.stringify(off.json));
  const cfg = (await anon.req('GET', '/api/config')).json.masterData.filaments.find((f: any) => f.id === id);
  assert.equal(cfg.available, false, 'öffentliche Konfiguration kennt den Schalter');
  const r = await anon.req('POST', '/api/orders', orderBody());
  assert.equal(r.status, 400);
  assert.ok(r.json.fields?.color);
  // Speichern der Farbrollen-Liste ohne Schalter behält „leer“ bei
  const { filaments } = await md();
  const saved = await putList(admin, 'filaments', filaments.map(({ available, ...f }: any) => f));
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.equal(saved.json.filaments.find((f: any) => f.id === id).available, false);
  assert.equal((await set(admin, true)).status, 200);
});
// Bambu-Katalog (Abruf, Import, Abgleich): server/test/bambu.test.ts
