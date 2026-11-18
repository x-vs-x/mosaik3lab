// Rechte gegen echte Endpunkte: Jede Rolle (und Personen mit einzelnen Häkchen) ruft jeden geschützten Endpunkt auf.
// Erwartung: ohne Anmeldung 401, ohne Recht 403, mit Recht eine fachliche Antwort (2xx oder 4xx wie 400/404, aber
// nie 401/403). „Mit Recht“ heißt: der Prüfpunkt steht in /api/auth/me – genau danach blendet der Client Seiten und
// Knöpfe ein. So fällt jede Abweichung zwischen Client und Server auf.
// Alle Aufrufe sind harmlos: unbekannte IDs oder leere Eingaben, es wird nichts verändert.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { Permission } from '@mosaik3lab/shared/konten';
import { Client, mail, personMitRechten, pw, SCHOOL, startServer, TEACHER, TEAM_STANDARD } from './helfer';

const srv = await startServer({ allowDemoAccounts: true, seedDemoData: true });
after(() => srv.stop());

const X = 'gibt-es-nicht';
type Guard = Permission | 'konto';
const ENDPOINTS: [Guard, string, string, unknown?][] = [
  ['orders:own', 'GET', '/api/orders/mine'],
  ['orders:own', 'GET', `/api/orders/${X}/vorlage`],
  ['orders:own', 'PUT', `/api/orders/${X}`, {}],
  ['orders:view', 'GET', '/api/orders'],
  ['orders:view', 'GET', '/api/orders/requesters'],
  ['orders:view', 'GET', `/api/orders/${X}`],
  ['orders:manage', 'PATCH', `/api/orders/${X}/status`, {}],
  ['dashboard:view', 'GET', '/api/dashboard'],
  ['catalog:manage', 'POST', '/api/items', {}],
  ['catalog:manage', 'PUT', `/api/items/${X}`, {}],
  ['catalog:manage', 'PATCH', `/api/items/${X}/publish`, {}],
  ['catalog:manage', 'DELETE', `/api/items/${X}`],
  ['catalog:manage', 'POST', `/api/items/${X}/images`],
  ['catalog:manage', 'PUT', `/api/items/${X}/images/order`, {}],
  ['catalog:manage', 'DELETE', `/api/items/${X}/images/${X}.png`],
  ['catalog:manage', 'POST', `/api/items/${X}/videos`],
  ['catalog:manage', 'POST', `/api/items/${X}/videos/link`, {}],
  ['catalog:manage', 'DELETE', `/api/items/${X}/videos/${X}`],
  ['catalog:manage', 'POST', `/api/items/${X}/models`],
  ['catalog:manage', 'DELETE', `/api/items/${X}/models/${X}`],
  ['catalog:manage', 'POST', '/api/items/farbe-zuordnen', {}],
  ['files:models', 'GET', `/api/files/models/${X}/${X}`],
  ['daten:export', 'GET', `/api/admin/daten/export?artikel=${X}`],
  ['daten:import', 'POST', '/api/admin/daten/import/vorschau'],
  ['daten:import', 'DELETE', `/api/admin/daten/import/${X}`],
  ['daten:import', 'POST', '/api/admin/daten/import/ausfuehren', {}],
  ['vorschlaege:eigene', 'GET', '/api/proposals/mine'],
  ['vorschlaege:eigene', 'POST', '/api/proposals', {}],
  ['vorschlaege:sehen', 'GET', '/api/proposals'],
  ['vorschlaege:sehen', 'GET', '/api/proposals/anzahl-neu'],
  ['vorschlaege:sehen', 'GET', `/api/proposals/${X}`],
  ['vorschlaege:bearbeiten', 'PATCH', `/api/proposals/${X}`, {}],
  ['vorschlaege:umwandeln', 'POST', `/api/proposals/${X}/convert`],
  ['filaments:manage', 'PATCH', `/api/filaments/${X}/availability`, {}],
  ['masterdata:manage', 'PUT', `/api/admin/settings/masterdata/${X}`, {}],
  ['masterdata:manage', 'GET', '/api/admin/settings/bambu-palette'],
  ['masterdata:manage', 'DELETE', '/api/admin/settings/bambu-palette/hinweis'],
  ['masterdata:manage', 'POST', '/api/admin/settings/masterdata/filaments/import', {}],
  ['settings:manage', 'GET', '/api/admin/settings'],
  ['settings:manage', 'PUT', '/api/admin/settings/orderform', {}],
  ['settings:manage', 'PUT', '/api/admin/settings/features', {}],
  ['settings:manage', 'PATCH', `/api/admin/settings/order-statuses/${X}`, {}],
  // „Was ist neu“ (seit 1.7.x über den Prüfpunkt statt der Rolle; settings:manage hat nur der Admin).
  ['settings:manage', 'GET', '/api/neuigkeiten'],
  ['settings:manage', 'POST', '/api/neuigkeiten/gelesen'],
  ['users:manage', 'GET', '/api/personen'],
  ['users:manage', 'PUT', '/api/personen', {}],
  ['users:manage', 'POST', '/api/personen/passwort-link', {}],
  ['konto', 'POST', '/api/auth/password', {}],
];

const admin = new Client(srv.base);
await admin.login(mail('admin'), pw('admin'));
const teacher = new Client(srv.base);
await teacher.identify(TEACHER);
const team = new Client(srv.base);
await team.login(mail('druckteam'), pw('druckteam'));
const nurAnfragen = await personMitRechten(admin, srv.base, `nur.anfragen@${SCHOOL}`, ['team-anfragen']);
const ohneHaekchen = await personMitRechten(admin, srv.base, `ohne.haekchen@${SCHOOL}`, []);
const stammdaten = await personMitRechten(admin, srv.base, `stammdaten.team@${SCHOOL}`, [...TEAM_STANDARD, 'stammdaten']);
const ohneDruckteile = await personMitRechten(admin, srv.base, `ohne.druckteile@${SCHOOL}`, TEAM_STANDARD.filter((b) => b !== 'team-druckteile'));
await admin.req('PUT', '/api/personen', { email: `stumm@${SCHOOL}`, role: 'lehrkraft', bereiche: [] });
const stumm = new Client(srv.base);
await stumm.identify(`stumm@${SCHOOL}`);

const PROFILE: [string, Client][] = [
  ['Lehrkraft', teacher],
  ['Lehrkraft ohne Häkchen', stumm],
  ['Druck-Team', team],
  ['Admin', admin],
  ['Druck-Team nur Anfragen', nurAnfragen.c],
  ['Druck-Team ohne Häkchen', ohneHaekchen.c],
  ['Druck-Team + Stammdaten', stammdaten.c],
  ['Druck-Team ohne Druckteile', ohneDruckteile.c],
];

const perms = async (c: Client) => (await c.req('GET', '/api/auth/me')).json.permissions as string[];

test('Rechte der Rollen und Häkchen sind wie beschrieben', async () => {
  assert.deepEqual(await perms(teacher), ['orders:own', 'vorschlaege:eigene']);
  assert.deepEqual(await perms(stumm), [], 'Lehrkraft ohne Häkchen darf nichts');
  const teamPerms = await perms(team);
  for (const p of ['users:manage', 'settings:manage', 'masterdata:manage']) assert.ok(!teamPerms.includes(p), p);
  for (const p of ['orders:own', 'catalog:manage', 'daten:import', 'vorschlaege:umwandeln']) assert.ok(teamPerms.includes(p), p);
  const adminPerms = await perms(admin);
  for (const p of ['users:manage', 'settings:manage', 'masterdata:manage', 'catalog:manage', 'orders:own']) assert.ok(adminPerms.includes(p), p);
  assert.deepEqual(await perms(ohneHaekchen.c), [], 'ohne Häkchen (auch ohne Lehrkraft-Häkchen) keine Rechte');
  assert.deepEqual(await perms(nurAnfragen.c), ['orders:view', 'orders:manage', 'dashboard:view']);
  assert.ok((await perms(stammdaten.c)).includes('masterdata:manage'));
});

test('Ohne Anmeldung: jeder geschützte Endpunkt antwortet 401', async () => {
  const anon = new Client(srv.base);
  for (const [, method, url, body] of ENDPOINTS) {
    assert.equal((await anon.req(method, url, body)).status, 401, `${method} ${url}`);
  }
});

for (const [name, c] of PROFILE) {
  test(`${name}: Server erlaubt genau, was /api/auth/me (und damit der Client) anzeigt`, async () => {
    const me = (await c.req('GET', '/api/auth/me')).json;
    const isAccount = me.user.role !== 'lehrkraft';
    const fehler: string[] = [];
    for (const [guard, method, url, body] of ENDPOINTS) {
      const allowed = guard === 'konto' ? isAccount : me.permissions.includes(guard);
      const { status } = await c.req(method, url, body);
      const expected = allowed ? 'fachlich (nicht 401/403)' : guard === 'konto' ? 401 : 403;
      const ok = allowed ? status !== 401 && status !== 403 : status === expected;
      // Umwandeln braucht zusätzlich „Druckteile pflegen“ – das prüft der Service mit 403 und eigener Meldung.
      const convertOhneKatalog = guard === 'vorschlaege:umwandeln' && allowed && !me.permissions.includes('catalog:manage') && status === 403;
      if (!ok && !convertOhneKatalog) fehler.push(`${method} ${url}: ${status}, erwartet ${expected}`);
    }
    assert.deepEqual(fehler, []);
  });
}

test('Niemand gibt sich selbst Rechte: ohne „Personen verwalten“ → 403', async () => {
  for (const c of [team, stammdaten.c, teacher]) {
    const me = (await c.req('GET', '/api/auth/me')).json.user;
    assert.equal((await c.req('PUT', '/api/personen', { email: me.email, role: 'admin', bereiche: [] })).status, 403);
  }
});

test('Admin-Rechte sind nicht anhakbar: unbekannte Häkchen → 400', async () => {
  for (const b of ['users:manage', 'settings:manage', 'admin']) {
    const r = await admin.req('PUT', '/api/personen', { email: `stammdaten.team@${SCHOOL}`, role: 'druckteam', bereiche: [b] });
    assert.equal(r.status, 400, b);
  }
  assert.ok(!(await perms(stammdaten.c)).includes('users:manage'));
});

test('Lehrkraft: fremde Anfrage → 404 und taucht nicht in „Meine Anfragen“ auf', async () => {
  const fremde = (await admin.req('GET', '/api/orders')).json.find((o: any) => o.requesterEmail !== TEACHER);
  assert.ok(fremde, 'Demo-Daten enthalten fremde Anfragen');
  assert.equal((await teacher.req('GET', `/api/orders/${fremde.id}/vorlage`)).status, 404);
  const body = { itemId: fremde.itemId, quantity: 1, color: fremde.color, size: fremde.size, requesterEmail: TEACHER, classOrTeam: 'Klasse 1a' };
  assert.equal((await teacher.req('PUT', `/api/orders/${fremde.id}`, body)).status, 404);
  assert.equal((await team.req('PUT', `/api/orders/${fremde.id}`, body)).status, 404, 'auch ein Konto ändert keine fremde Anfrage');
  const mine = (await teacher.req('GET', '/api/orders/mine')).json;
  assert.ok(mine.length > 0 && mine.every((o: any) => o.id !== fremde.id));
});

test('Entwürfe und Druckdatei-Liste nur mit „Druckteile pflegen“', async () => {
  for (const c of [teacher, ohneDruckteile.c]) {
    const items = (await c.req('GET', '/api/items?all=1')).json;
    assert.ok(items.every((i: any) => i.published && i.modelFiles.length === 0));
  }
  assert.ok((await team.req('GET', '/api/items?all=1')).json.some((i: any) => !i.published));
});

test('/api/admin/settings: unbekannte Pfade und Methoden wie bisher nur mit dem Einstellungsrecht (dann 404)', async () => {
  const anon = new Client(srv.base);
  for (const [method, url] of [
    ['GET', '/api/admin/settings/gibt-es-nicht'],
    ['GET', '/api/admin/settings/masterdata/categories'],
    ['POST', '/api/admin/settings/order-statuses/offen'],
  ] as const) {
    assert.equal((await anon.req(method, url)).status, 401, `anonym ${method} ${url}`);
    for (const c of [teacher, team, stammdaten.c]) assert.equal((await c.req(method, url)).status, 403, `${method} ${url}`);
    assert.equal((await admin.req(method, url)).status, 404, `Admin ${method} ${url}`);
  }
  // Stammdaten-Recht ohne Einstellungsrecht: Stammdaten ja, Ablauf der Anfragen und Einstellungen nein.
  assert.equal((await stammdaten.c.req('GET', '/api/admin/settings/bambu-palette')).status, 200);
  assert.equal((await stammdaten.c.req('PATCH', '/api/admin/settings/order-statuses/offen', { active: true })).status, 403);
  assert.equal((await stammdaten.c.req('GET', '/api/admin/settings')).status, 403);
});
