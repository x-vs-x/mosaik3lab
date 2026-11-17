// Konten: Anmeldung (E-Mail-Schritt, Passwort, Konto anlegen), Sitzungen, Personen, Rollen und Häkchen, Passwort per Link, Sperre.
import assert from 'node:assert/strict';
import path from 'node:path';
import { after, test } from 'node:test';
import { openDb } from '../src/kern/db';
import { Client, mail, mailConfig, personMitRechten, pw, SCHOOL, sentMails, sleep, startServer, TEACHER, TEAM_STANDARD, TEST_PASSWORT, writeMailFile } from './helfer';

const srv = await startServer({ allowDemoAccounts: true, seedDemoData: true });
after(() => srv.stop());
const anon = new Client(srv.base);
const teacher = new Client(srv.base);
const team = new Client(srv.base);
const admin = new Client(srv.base);
// Irgendeine Demo-Anfrage für Rechteprüfungen (die Anmeldung der Clients oben prüfen die Tests selbst).
const vorab = new Client(srv.base);
await vorab.login(mail('admin'), pw('admin'));
const order = (await vorab.req('GET', '/api/orders')).json[0];

test('Ohne Anmeldung: Katalog lesbar, Verwaltung gesperrt', async () => {
  const r = await anon.req('GET', '/api/items?all=1');
  assert.equal(r.status, 200);
  assert.ok(r.json.length >= 8 && r.json.every((i: any) => i.published && i.modelFiles.length === 0));
  assert.equal((await anon.req('GET', '/api/orders')).status, 401);
  assert.equal((await anon.req('GET', '/api/orders/requesters')).status, 401);
  assert.equal((await anon.req('GET', '/api/dashboard')).status, 401);
  assert.equal((await anon.req('GET', '/api/admin/settings')).status, 401);
  assert.equal((await anon.req('GET', '/api/personen')).status, 401);
  assert.equal((await anon.req('POST', '/api/items', {})).status, 401);
});
test('Falsches Passwort wird abgelehnt', async () => {
  assert.equal((await anon.login(mail('admin'), 'falsch-falsch')).status, 401);
});
test('E-Mail-Schritt: Admin und Druck-Team brauchen ein Passwort', async () => {
  for (const u of ['admin', 'druckteam']) {
    const c = new Client(srv.base);
    const r = await c.identify(mail(u).toUpperCase());
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { result: 'password' }, 'keine weiteren Kontodaten vor dem Passwort');
    assert.equal((await c.req('GET', '/api/auth/me')).json.user, null, 'noch nicht angemeldet');
  }
});
test('Login Druck-Team und Admin mit E-Mail + Passwort', async () => {
  for (const [c, u] of [[team, 'druckteam'], [admin, 'admin']] as const) {
    const r = await c.login(mail(u), pw(u));
    assert.equal(r.status, 200, `${u}: ${JSON.stringify(r.json)}`);
    assert.equal(r.json.user.passwordHash, undefined, 'Passwort-Hash darf nicht ausgeliefert werden');
    assert.equal(r.json.user.role, u);
    assert.equal(r.json.user.email, mail(u));
  }
  assert.ok((await admin.req('GET', '/api/auth/me')).json.permissions.includes('users:manage'));
  assert.ok(!(await team.req('GET', '/api/auth/me')).json.permissions.includes('users:manage'));
});
test('Bekannte Lehrkraft ist ohne Passwort direkt angemeldet', async () => {
  const r = await teacher.identify(` ${TEACHER.toUpperCase()} `);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.result, 'signed-in');
  assert.equal(r.json.user.role, 'lehrkraft');
  assert.equal(r.json.user.email, TEACHER);
  assert.deepEqual(r.json.permissions, ['orders:own', 'vorschlaege:eigene']);
  assert.equal((await teacher.req('GET', '/api/auth/me')).json.user.email, TEACHER);
});
test('Unbekannte E-Mail: Hinweis, keine Anmeldung', async () => {
  const c = new Client(srv.base);
  const r = await c.identify(`ganz.neu@${SCHOOL}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { result: 'unknown' });
  assert.equal(r.headers.get('set-cookie'), null, 'keine Session');
  assert.equal((await c.req('GET', '/api/auth/me')).json.user, null);
  assert.equal((await c.identify('keine-mail')).status, 400);
  assert.equal((await c.login(`ganz.neu@${SCHOOL}`, 'irgendwas-123')).status, 401);
});
test('Unbekannte E-Mail: „Jetzt Konto anlegen“ legt Lehrkraft an und meldet an', async () => {
  const c = new Client(srv.base);
  const email = `neue.lehrkraft@${SCHOOL}`;
  const r = await c.req('POST', '/api/auth/register', { email: email.toUpperCase() });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.result, 'signed-in');
  assert.equal(r.json.user.role, 'lehrkraft');
  assert.equal(r.json.user.email, email);
  assert.deepEqual(r.json.permissions, ['orders:own', 'vorschlaege:eigene']);
  assert.match(r.headers.get('set-cookie') ?? '', /Expires=/i, 'dauerhaftes Cookie');
  assert.deepEqual((await c.req('GET', '/api/orders/mine')).json, []);
  assert.equal((await c.req('GET', '/api/dashboard')).status, 403);
  const requester = (await team.req('GET', '/api/orders/requesters')).json.find((x: any) => x.email === email);
  assert.ok(requester, 'erscheint unter „Lehrkräfte“');
  assert.equal(requester.lastOrderAt, '', 'noch keine Anfrage');
  // Danach: erneute Anmeldung ohne Passwort
  const again = new Client(srv.base);
  assert.equal((await again.identify(email)).json.result, 'signed-in');
  // Doppeltes Anlegen meldet einfach an
  assert.equal((await again.req('POST', '/api/auth/register', { email })).status, 201);
  assert.equal((await team.req('GET', '/api/orders/requesters')).json.filter((x: any) => x.email === email).length, 1);
});
test('Konto anlegen: fremde Domain abgelehnt, nie Admin/Druck-Team', async () => {
  const c = new Client(srv.base);
  const foreign = await c.req('POST', '/api/auth/register', { email: 'jemand@example.org' });
  assert.equal(foreign.status, 400);
  assert.ok(foreign.json.fields.email);
  assert.equal(foreign.headers.get('set-cookie'), null);
  assert.equal((await c.identify('jemand@example.org')).json.result, 'unknown');
  const account = await c.req('POST', '/api/auth/register', { email: mail('admin') });
  assert.equal(account.status, 409, 'Konto-Adresse bleibt beim Passwort');
  assert.equal((await c.req('GET', '/api/auth/me')).json.user, null);
  assert.equal((await c.req('POST', '/api/auth/register', { email: 'kaputt' })).status, 400);
  assert.equal((await c.req('POST', '/api/auth/register', { email: `x@${SCHOOL}` }, { csrf: false })).status, 403);
  const p = (await admin.req('GET', '/api/personen')).json.find((x: any) => x.email === `x@${SCHOOL}`);
  assert.equal(p, undefined, 'ohne CSRF-Header nichts angelegt');
});
test('Session-Cookie ist dauerhaft (30 Tage) und wird bei Nutzung verlängert', async () => {
  const c = new Client(srv.base);
  const r = await c.login(mail('druckteam'), pw('druckteam'));
  const cookie = r.headers.get('set-cookie') ?? '';
  const expires = Date.parse(/Expires=([^;]+)/i.exec(cookie)?.[1] ?? '');
  const days = (expires - Date.now()) / (24 * 3600 * 1000);
  assert.ok(days > 29.9 && days <= 30.01, `läuft in ${days} Tagen ab`);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  const next = await c.req('GET', '/api/auth/me');
  assert.match(next.headers.get('set-cookie') ?? '', /Expires=/i, 'rollierend erneuert');
  await c.req('POST', '/api/auth/logout');
  assert.equal((await c.req('GET', '/api/auth/me')).json.user, null, 'Abmelden beendet die Session');
});
test('Lehrkraft kann sich nicht per Passwort anmelden', async () => {
  const c = new Client(srv.base);
  assert.equal((await c.login(TEACHER, 'irgendwas-123')).status, 401);
  const change = await teacher.req('POST', '/api/auth/password', { currentPassword: 'x', newPassword: 'Sicheres-Passwort-1' });
  assert.equal(change.status, 401);
});
test('Lehrkraft darf nicht in die Verwaltung', async () => {
  for (const url of ['/api/orders', '/api/orders/requesters', '/api/dashboard', '/api/admin/settings', '/api/personen']) {
    assert.equal((await teacher.req('GET', url)).status, 403, url);
  }
  assert.equal((await teacher.req('POST', '/api/items', {})).status, 403);
  assert.equal((await teacher.req('PUT', '/api/admin/settings/features', { requesterTracking: true })).status, 403);
  const items = await teacher.req('GET', '/api/items?all=1');
  assert.ok(items.json.every((i: any) => i.published), 'nur veröffentlichte Druckteile');
});
test('Lehrkraft sieht nur eigene Anfragen (ohne Status, solange ausgeschaltet)', async () => {
  const r = await teacher.req('GET', '/api/orders/mine');
  assert.equal(r.status, 200);
  const own = (await team.req('GET', '/api/orders')).json.filter((o: any) => o.requesterEmail === TEACHER);
  assert.ok(own.length >= 1);
  assert.deepEqual(r.json.map((o: any) => o.id).sort(), own.map((o: any) => o.id).sort());
  assert.ok(r.json.every((o: any) => o.status === undefined && o.history === undefined && o.trackingCode === undefined));
  assert.equal((await anon.req('GET', '/api/orders/mine')).status, 401);
  assert.deepEqual((await admin.req('GET', '/api/orders/mine')).json, [], 'Konten ohne eigene Anfragen: leere Liste');
});
test('Anmeldung vergibt eine neue Session-ID und ersetzt die alte Anmeldung', async () => {
  const c = new Client(srv.base);
  const first = await c.login(mail('druckteam'), pw('druckteam'));
  const cookieTeam = first.headers.get('set-cookie')?.split(';')[0];
  const second = await c.identify(TEACHER);
  const cookieTeacher = second.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookieTeam && cookieTeacher && cookieTeam !== cookieTeacher);
  assert.equal((await c.req('GET', '/api/dashboard')).status, 403, 'Rechte des Druck-Teams sind weg');
});
test('Session-Cookie ist HttpOnly und SameSite=Strict', async () => {
  const c = new Client(srv.base);
  const r = await c.login(mail('admin'), pw('admin'));
  const cookie = r.headers.get('set-cookie') ?? '';
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
});
test('Ändernde Anfrage ohne CSRF-Header wird abgelehnt', async () => {
  const r = await teacher.req('POST', '/api/orders', {}, { csrf: false });
  assert.equal(r.status, 403);
});
const personen = async () => (await admin.req('GET', '/api/personen')).json as any[];
const person = async (email: string) => (await personen()).find((p) => p.email === email);

test('Rechte geben: Lehrkraft wird Druck-Team, legt Passwort über den Link fest (ohne Mailversand zum Weitergeben)', async () => {
  const email = `test.team@${SCHOOL}`;
  const r = await admin.req('PUT', '/api/personen', { email: `Test.Team@${SCHOOL}`, name: 'Test Team', role: 'druckteam', bereiche: TEAM_STANDARD });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.person.email, email, 'klein geschrieben');
  assert.equal(r.json.person.passwort, 'ausstehend');
  assert.equal(r.json.passwortLink.gesendet, false);
  assert.match(r.json.passwortLink.grund, /nicht eingerichtet/);
  const token = r.json.passwortLink.token;
  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);

  // Bis das Passwort festgelegt ist: Anmeldung wie eine Lehrkraft, ohne Team-Rechte.
  const c = new Client(srv.base);
  assert.equal((await c.identify(email)).json.result, 'signed-in');
  assert.equal((await c.req('GET', '/api/dashboard')).status, 403);

  assert.deepEqual((await anon.req('POST', '/api/auth/passwort-link', { token })).json, { email, name: 'Test Team', zweck: 'einrichten' });
  assert.equal((await anon.req('POST', '/api/auth/passwort-setzen', { token, password: 'kurz' })).status, 400, 'mindestens 8 Zeichen');
  const set = await c.req('POST', '/api/auth/passwort-setzen', { token, password: 'achtzei8' });
  assert.equal(set.status, 200, JSON.stringify(set.json));
  assert.equal(set.json.user.role, 'druckteam');
  assert.equal((await c.req('GET', `/api/orders/${order.id}`)).status, 200, 'direkt angemeldet mit Team-Rechten');
  assert.equal((await anon.req('POST', '/api/auth/passwort-setzen', { token, password: 'nochmal-123' })).status, 404, 'Link gilt nur einmal');

  const other = new Client(srv.base);
  assert.equal((await other.identify(email)).json.result, 'password');
  assert.equal((await other.login(email, 'achtzei8')).status, 200);
  assert.equal((await person(email)).passwort, 'gesetzt');
});
test('Personen-Liste nur für Admin: Lehrkräfte und Konten zusammen, ohne Passwörter', async () => {
  assert.equal((await team.req('GET', '/api/personen')).status, 403);
  assert.equal((await teacher.req('GET', '/api/personen')).status, 403);
  assert.equal((await anon.req('GET', '/api/personen')).status, 401);
  const list = await personen();
  assert.ok(list.every((p) => p.passwordHash === undefined && !('token' in p)));
  const lehrkraft = list.find((p) => p.email === TEACHER);
  assert.equal(lehrkraft.role, 'lehrkraft');
  assert.deepEqual(lehrkraft.bereiche, ['anfragen', 'vorschlaege']);
  assert.ok(lehrkraft.orderCount >= 1);
  assert.equal((list.find((p) => p.email === mail('admin'))).role, 'admin');
  assert.equal(list.filter((p) => p.email === mail('druckteam')).length, 1, 'eine Zeile je E-Mail');
});
test('Ungültige Eingaben: unbekannte Häkchen, falsche Rolle oder E-Mail → 400', async () => {
  for (const body of [
    { email: `x@${SCHOOL}`, role: 'druckteam', bereiche: ['users:manage'] },
    { email: `x@${SCHOOL}`, role: 'chef', bereiche: [] },
    { email: 'kaputt', role: 'lehrkraft', bereiche: [] },
  ]) {
    assert.equal((await admin.req('PUT', '/api/personen', body)).status, 400, JSON.stringify(body));
  }
});
test('Häkchen wirken sofort; zurück zur Lehrkraft meldet ab, danach Anmeldung ohne Passwort', async () => {
  const email = `wechsel@${SCHOOL}`;
  const { c } = await personMitRechten(admin, srv.base, email);
  assert.equal((await c.req('GET', '/api/dashboard')).status, 200);
  await admin.req('PUT', '/api/personen', { email, role: 'druckteam', bereiche: ['anfragen', 'team-druckteile'] });
  assert.equal((await c.req('GET', '/api/dashboard')).status, 403, 'ohne „Anfragen bearbeiten“');
  assert.equal((await c.req('GET', '/api/items?all=1')).json.some((i: any) => !i.published), true, 'Druckteile weiter');
  await admin.req('PUT', '/api/personen', { email, role: 'admin', bereiche: [] });
  assert.equal((await c.req('GET', '/api/personen')).status, 200, 'Administrator sofort');
  const back = await admin.req('PUT', '/api/personen', { email, role: 'lehrkraft', bereiche: ['anfragen', 'vorschlaege'] });
  assert.equal(back.json.person.role, 'lehrkraft');
  assert.equal(back.json.passwortLink, null);
  assert.equal((await c.req('GET', '/api/dashboard')).status, 401, 'abgemeldet');
  const again = new Client(srv.base);
  assert.equal((await again.identify(email)).json.result, 'signed-in', 'wieder Lehrkraft ohne Passwort');
  // Wieder ins Team: das alte Passwort gilt weiter, kein neuer Link nötig.
  const up = await admin.req('PUT', '/api/personen', { email, role: 'druckteam', bereiche: TEAM_STANDARD });
  assert.equal(up.json.passwortLink, null);
  assert.equal((await again.login(email, TEST_PASSWORT)).status, 200);
});
test('Druck-Team-Konto behält die Lehrkraft-Funktionen (Meine Anfragen, Vorschläge)', async () => {
  assert.deepEqual(((await team.req('GET', '/api/auth/me')).json.permissions as string[]).sort(), [
    'catalog:manage', 'catalog:view', 'dashboard:view', 'daten:export', 'daten:import', 'filaments:manage', 'files:models',
    'orders:manage', 'orders:own', 'orders:view', 'vorschlaege:bearbeiten', 'vorschlaege:eigene', 'vorschlaege:sehen', 'vorschlaege:umwandeln',
  ]);
  const { c } = await personMitRechten(admin, srv.base, TEACHER, TEAM_STANDARD);
  const mine = await c.req('GET', '/api/orders/mine');
  assert.equal(mine.status, 200);
  assert.ok(mine.json.length >= 1, 'bisherige Anfragen der Lehrkraft bleiben sichtbar');
  await admin.req('PUT', '/api/personen', { email: TEACHER, role: 'lehrkraft', bereiche: ['anfragen', 'vorschlaege'] });
  assert.equal((await teacher.identify(TEACHER)).json.result, 'signed-in');
});
test('Lehrkraft-Häkchen: ohne „anfragen“ keine Anfragen – auch nicht ohne Anmeldung', async () => {
  const email = `gesperrt@${SCHOOL}`;
  await admin.req('PUT', '/api/personen', { email, role: 'lehrkraft', bereiche: ['vorschlaege'] });
  const c = new Client(srv.base);
  const r = await c.identify(email);
  assert.deepEqual(r.json.permissions, ['vorschlaege:eigene']);
  assert.equal((await c.req('GET', '/api/orders/mine')).status, 403);
  const item = (await anon.req('GET', '/api/items')).json[0];
  const body = { itemId: item.id, quantity: 1, color: item.colors[0], size: item.sizes[0], requesterEmail: email, classOrTeam: '1a' };
  const blocked = await anon.req('POST', '/api/orders', body);
  assert.equal(blocked.status, 403);
  assert.match(blocked.json.error, /Administration/);
  await admin.req('PUT', '/api/personen', { email, role: 'lehrkraft', bereiche: ['anfragen', 'vorschlaege'] });
  assert.equal((await anon.req('POST', '/api/orders', body)).status, 201);
});
test('Druck-Team mit „Stammdaten“: Stammdaten ja – Einstellungen und Ablauf der Anfragen bleiben beim Admin', async () => {
  const { c } = await personMitRechten(admin, srv.base, `stamm@${SCHOOL}`, [...TEAM_STANDARD, 'stammdaten']);
  assert.equal((await c.req('GET', '/api/admin/settings/bambu-palette')).status, 200);
  assert.equal((await c.req('GET', '/api/admin/settings')).status, 403);
  assert.equal((await c.req('PATCH', '/api/admin/settings/order-statuses/abholbereit', { active: true })).status, 403);
  assert.equal((await admin.req('PATCH', '/api/admin/settings/order-statuses/abholbereit', { active: true })).status, 200);
});
test('Passwortwechsel beendet die anderen Sitzungen; Admin-Link setzt zurück', async () => {
  const email = `sitzung.test@${SCHOOL}`;
  const { c: a } = await personMitRechten(admin, srv.base, email);
  const b = new Client(srv.base);
  assert.equal((await b.login(email, TEST_PASSWORT)).status, 200);
  assert.equal((await a.req('POST', '/api/auth/password', { currentPassword: TEST_PASSWORT, newPassword: 'Neues-Pw' })).status, 200);
  assert.equal((await b.req('GET', '/api/dashboard')).status, 401, 'andere Sitzung beendet');
  assert.equal((await a.req('GET', '/api/dashboard')).status, 200, 'eigene bleibt');
  // Administrator: „Passwort zurücksetzen“ → Link; bis zur Nutzung gilt das alte Passwort.
  const link = await admin.req('POST', '/api/personen/passwort-link', { email });
  assert.equal(link.status, 200);
  assert.equal(link.json.gesendet, false);
  assert.equal((await b.login(email, 'Neues-Pw')).status, 200);
  assert.equal((await anon.req('POST', '/api/auth/passwort-link', { token: link.json.token })).json.zweck, 'zuruecksetzen');
  assert.equal((await anon.req('POST', '/api/auth/passwort-setzen', { token: link.json.token, password: 'Admin-Reset' })).status, 200);
  assert.equal((await a.req('GET', '/api/dashboard')).status, 401, 'Zurücksetzen beendet alle Sitzungen');
  assert.equal((await a.login(email, 'Admin-Reset')).status, 200);
  // Derselbe Link zweimal gleichzeitig eingelöst: nur eine Anfrage legt ein Passwort fest.
  const neu = await admin.req('POST', '/api/personen/passwort-link', { email });
  const beide = await Promise.all(['Erstes-Pw', 'Zweites-Pw'].map((password) => new Client(srv.base).req('POST', '/api/auth/passwort-setzen', { token: neu.json.token, password })));
  assert.deepEqual(beide.map((r) => r.status).sort(), [200, 404], 'Link gilt nur einmal, auch gleichzeitig');
  assert.equal((await a.login(email, beide[0].status === 200 ? 'Erstes-Pw' : 'Zweites-Pw')).status, 200);
  assert.equal((await admin.req('POST', '/api/personen/passwort-link', { email: TEACHER })).status, 404, 'Lehrkräfte haben kein Passwort');
  assert.equal((await team.req('POST', '/api/personen/passwort-link', { email })).status, 403);
});
test('Niemand entzieht sich selbst die Adminrolle; ein Admin mit Passwort bleibt immer', async () => {
  const me = mail('admin');
  for (const role of ['druckteam', 'lehrkraft']) {
    assert.equal((await admin.req('PUT', '/api/personen', { email: me, role, bereiche: [] })).status, 400, role);
  }
  assert.equal((await team.req('PUT', '/api/personen', { email: mail('druckteam'), role: 'admin', bereiche: [] })).status, 403, 'keine Selbst-Beförderung');
  assert.equal((await admin.req('GET', '/api/auth/me')).json.permissions.includes('users:manage'), true);
});
test('Logout beendet die Session', async () => {
  await teacher.req('POST', '/api/auth/logout');
  assert.equal((await teacher.req('GET', '/api/dashboard')).status, 401);
});
test('Nach 10 falschen Passwörtern gesperrt: Mail mit Link, neues Passwort hebt die Sperre auf', async () => {
  const email = `sperre@${SCHOOL}`;
  await personMitRechten(admin, srv.base, email);
  await writeMailFile(mailConfig, path.join(srv.storageDir, 'mosaik3lab.db'));
  const c = new Client(srv.base);
  const before = sentMails.length;
  let last: any;
  for (let i = 1; i <= 9; i++) last = await c.login(email, 'falsch-falsch');
  assert.equal(last.status, 401);
  assert.match(last.json.error, /Noch 1 Versuch/);
  const locked = await c.login(email, 'falsch-falsch');
  assert.equal(locked.status, 403);
  assert.match(locked.json.error, /gesperrt/);
  assert.equal((await c.login(email, TEST_PASSWORT)).status, 403, 'auch das richtige Passwort hilft nicht mehr');
  assert.equal(sentMails.length, before + 1, 'genau eine Mail');
  const m = sentMails.at(-1);
  assert.deepEqual(m.to.map((t: any) => t.address), [email]);
  assert.match(m.subject, /zurücksetzen/i);
  const token = /passwort#([A-Za-z0-9_-]+)/.exec(m.text)?.[1];
  assert.ok(token, 'Link in der Mail');
  assert.match(m.text, /24 Stunden/);
  assert.equal((await person(email)).passwort, 'gesperrt');
  assert.equal((await c.req('POST', '/api/auth/passwort-setzen', { token, password: 'Wieder-Da' })).status, 200);
  assert.equal((await new Client(srv.base).login(email, 'Wieder-Da')).status, 200);
});
test('Sperre endet nach einer Stunde von selbst', async () => {
  const email = `sperre.zeit@${SCHOOL}`;
  // Mailversand ist ab hier eingerichtet: Der Link zum Festlegen kommt per Mail, nicht in der Antwort.
  await admin.req('PUT', '/api/personen', { email, role: 'druckteam', bereiche: TEAM_STANDARD, name: 'Sperre Zeit' });
  const token = /passwort#([A-Za-z0-9_-]+)/.exec(sentMails.at(-1).text)?.[1];
  const c = new Client(srv.base);
  assert.equal((await c.req('POST', '/api/auth/passwort-setzen', { token, password: TEST_PASSWORT })).status, 200);
  // Das Sperren selbst prüft der Test davor; hier direkt in der Datenbank (die Login-Bremse je IP würde sonst greifen).
  const setze = (seitMinuten: number) => {
    const db = openDb(path.join(srv.storageDir, 'mosaik3lab.db'));
    db.prepare('UPDATE benutzer SET fehlversuche = 10, gesperrt_seit = ? WHERE email = ?').run(new Date(Date.now() - seitMinuten * 60_000).toISOString(), email);
    db.close();
  };
  setze(59);
  assert.equal((await c.login(email, TEST_PASSWORT)).status, 403, 'nach 59 Minuten noch gesperrt');
  assert.equal((await person(email)).passwort, 'gesperrt');
  setze(61); // wie eine Stunde Warten
  assert.equal((await person(email)).passwort, 'gesetzt', 'Verwaltung zeigt nicht mehr „gesperrt“');
  const wrong = await c.login(email, 'falsch-falsch');
  assert.equal(wrong.status, 401, 'Zählung beginnt von vorn');
  assert.doesNotMatch(wrong.json.error, /Noch \d Versuch/);
  assert.equal((await c.login(email, TEST_PASSWORT)).status, 200);
});
test('Mit Mailversand: Rechte geben schickt „Passwort festlegen“ (läuft nicht ab), „Passwort vergessen“ verrät nichts', async () => {
  const email = `mail.team@${SCHOOL}`;
  const before = sentMails.length;
  const r = await admin.req('PUT', '/api/personen', { email, role: 'druckteam', bereiche: TEAM_STANDARD });
  assert.deepEqual(r.json.passwortLink, { gesendet: true });
  const m = sentMails.at(-1);
  assert.equal(sentMails.length, before + 1);
  assert.match(m.subject, /Passwort festlegen/);
  assert.doesNotMatch(m.text, /24 Stunden/);
  assert.match(m.html, /Passwort festlegen/);
  // Knopf und Text-Fassung mit demselben Link; localhost = nur im Schulnetz → Hinweis unter dem Knopf
  const link = /http:\/\/localhost:5173\/passwort#[A-Za-z0-9_-]+/.exec(m.text)?.[0];
  assert.ok(link && m.html.includes(`href="${link}"`), 'Knopf-Link im HTML');
  assert.ok(m.text.includes('nur im Schulnetz') && m.html.includes('nur im Schulnetz'));
  // Speichern ohne Änderung schickt keine zweite Mail.
  await admin.req('PUT', '/api/personen', { email, role: 'druckteam', bereiche: TEAM_STANDARD });
  assert.equal(sentMails.length, before + 1);

  const unbekannt = await anon.req('POST', '/api/auth/passwort-vergessen', { email: `niemand@${SCHOOL}` });
  const lehrkraft = await anon.req('POST', '/api/auth/passwort-vergessen', { email: TEACHER });
  const konto = await anon.req('POST', '/api/auth/passwort-vergessen', { email: mail('druckteam') });
  assert.deepEqual([unbekannt.json, lehrkraft.json, konto.json], [{ ok: true }, { ok: true }, { ok: true }], 'immer dieselbe Antwort');
  // Der Versand läuft im Hintergrund (gleiche Antwortzeit mit und ohne Konto).
  for (let i = 0; i < 50 && sentMails.length < before + 2; i++) await sleep(20);
  assert.equal(sentMails.length, before + 2, 'nur das Konto bekommt eine Mail');
  assert.match(sentMails.at(-1).text, /24 Stunden/);
});

test('Person entfernen: markiert statt löscht – Anfragen bleiben sichtbar, Sitzung endet, E-Mail wieder frei', async () => {
  const email = `weg.lehrkraft@${SCHOOL}`;
  assert.equal((await admin.req('PUT', '/api/personen', { email, role: 'lehrkraft', bereiche: ['anfragen'] })).status, 200);
  assert.equal((await team.req('POST', '/api/personen/entfernen', { email })).status, 403);
  assert.equal((await anon.req('POST', '/api/personen/entfernen', { email })).status, 401);
  assert.equal((await admin.req('POST', '/api/personen/entfernen', { email })).status, 200);
  assert.equal(await person(email), undefined, 'aus der Liste verschwunden');
  assert.equal((await admin.req('POST', '/api/personen/entfernen', { email })).status, 404, 'zweimal → nicht gefunden');

  // Lehrkraft mit Anfragen: Anfragen bleiben samt E-Mail sichtbar, ihre Sitzung endet.
  const vorher = (await admin.req('GET', '/api/orders')).json as any[];
  const ihre = vorher.filter((o) => o.requesterEmail === TEACHER).map((o) => o.id);
  assert.ok(ihre.length >= 1);
  assert.equal((await admin.req('POST', '/api/personen/entfernen', { email: TEACHER })).status, 200);
  const nachher = (await admin.req('GET', '/api/orders')).json as any[];
  assert.equal(nachher.length, vorher.length, 'keine Anfrage verloren');
  assert.deepEqual(nachher.filter((o) => o.requesterEmail === TEACHER).map((o) => o.id), ihre, 'mit E-Mail weiter sichtbar');
  assert.equal((await teacher.req('GET', '/api/auth/me')).json.user, null, 'Lehrkraft abgemeldet');
  // Dieselbe Adresse kann sich neu anmelden (frischer Eintrag, alte Anfragen bleiben in der Verwaltung).
  const neu = new Client(srv.base);
  assert.equal((await neu.req('POST', '/api/auth/identify', { email: TEACHER })).json.result, 'unknown');
  assert.equal((await neu.req('POST', '/api/auth/register', { email: TEACHER })).status, 201);
  assert.equal((await person(TEACHER))?.role, 'lehrkraft');

  // Druck-Team-Konto: Sitzung endet sofort, Anmeldung mit Passwort geht nicht mehr, Rechte neu vergeben geht.
  const teamMail = mail('druckteam');
  assert.equal((await admin.req('POST', '/api/personen/entfernen', { email: teamMail })).status, 200);
  assert.equal((await team.req('GET', '/api/orders')).status, 401, 'Druck-Team abgemeldet');
  assert.equal((await team.login(teamMail, pw('druckteam'))).status, 401);
  const wieder = await admin.req('PUT', '/api/personen', { email: teamMail, role: 'druckteam', bereiche: TEAM_STANDARD });
  assert.equal(wieder.status, 200);
  assert.equal(wieder.json.person.passwort, 'ausstehend', 'neues Konto, Passwort neu festlegen');

  // Sich selbst entfernen geht nie – so bleibt immer mindestens ein Administrator.
  const ich = (await admin.req('GET', '/api/auth/me')).json.user.email;
  const selbst = await admin.req('POST', '/api/personen/entfernen', { email: ich });
  assert.equal(selbst.status, 400);
  assert.match(JSON.stringify(selbst.json), /selbst/);
  assert.equal((await person(ich))?.role, 'admin');
});