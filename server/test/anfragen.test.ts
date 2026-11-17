// Anfragen (Bestellungen): Anfrage stellen, Besteller-Verzeichnis, Status, erneut anfragen, Dashboard.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { anmelden, demoTeile, SCHOOL, startServer, TEACHER } from './helfer';

const srv = await startServer({ allowDemoAccounts: true, seedDemoData: true });
after(() => srv.stop());
const { anon, teacher, team, admin } = await anmelden(srv.base);
const { publishedItem, hiddenItem } = await demoTeile(teacher, team);

let order: any;
const orderBody = () => ({
  itemId: publishedItem.id, quantity: 1, color: publishedItem.colors[0], size: publishedItem.sizes[0],
  requesterEmail: `test.lehrkraft@${SCHOOL}`, classOrTeam: 'Klasse 1a',
});
test('Anfrage ohne Anmeldung mit Schul-E-Mail → nur Eingangsbestätigung', async () => {
  const r = await anon.req('POST', '/api/orders', { ...orderBody(), customization: 'Bitte etwas größer.' });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.deepEqual(Object.keys(r.json).sort(), ['id', 'itemName', 'number']);
  assert.match(r.json.number, /^ANF-\d{4}-\d{4}$/);
  assert.equal(r.json.itemName, publishedItem.name);
  order = r.json;
});
test('E-Mail mit falscher Domain oder ohne E-Mail wird abgelehnt', async () => {
  const wrong = await anon.req('POST', '/api/orders', { ...orderBody(), requesterEmail: 'jemand@gmail.com' });
  assert.equal(wrong.status, 400);
  assert.ok(wrong.json.fields?.requesterEmail);
  const sub = await anon.req('POST', '/api/orders', { ...orderBody(), requesterEmail: `x@falsch-${SCHOOL}` });
  assert.equal(sub.status, 400, 'ähnliche Domain ist nicht erlaubt');
  const { requesterEmail: _e, ...noMail } = orderBody();
  const missing = await anon.req('POST', '/api/orders', noMail);
  assert.equal(missing.status, 400);
  assert.ok(missing.json.fields?.requesterEmail);
  const old = await anon.req('POST', '/api/orders', { ...noMail, requesterName: 'Frau Test' });
  assert.equal(old.status, 400, 'ein Name allein reicht nicht mehr');
});
test('Gleiche E-Mail zweimal → ein Eintrag im Besteller-Verzeichnis mit 2 Anfragen', async () => {
  const r = await anon.req('POST', '/api/orders', { ...orderBody(), requesterEmail: ` Test.Lehrkraft@${SCHOOL.toUpperCase()} ` });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const list = await team.req('GET', '/api/orders/requesters');
  assert.equal(list.status, 200);
  const mine = list.json.filter((x: any) => x.email === `test.lehrkraft@${SCHOOL}`);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].orderCount, 2);
  assert.ok(mine[0].id && mine[0].createdAt && mine[0].lastOrderAt);
  const demo = list.json.find((x: any) => x.email === `frau.beispiel@${SCHOOL}`);
  assert.equal(demo?.orderCount, 2, 'Demo-Anfragen sind Lehrkräften zugeordnet');
});
test('Anfrage enthält für das Team E-Mail, Farbname, Filament-ID und Farbwert', async () => {
  const all = (await team.req('GET', '/api/orders')).json;
  const full = all.find((o: any) => o.id === order.id);
  const filament = (await anon.req('GET', '/api/config')).json.masterData.filaments.find(
    (f: any) => f.id === publishedItem.colors[0],
  );
  assert.equal(full.requesterEmail, `test.lehrkraft@${SCHOOL}`);
  assert.ok(full.requesterId);
  assert.equal(full.status, 'offen');
  assert.equal(full.colorId, filament.id);
  assert.equal(full.colorHex, filament.hex);
  // Nur der Farbname – Marke/Linie zeigt die Verwaltung über colorId.
  assert.equal(full.color, filament.colorName);
  const demo = all.filter((o: any) => o.isDemo);
  assert.ok(demo.length >= 5 && demo.every((o: any) => o.requesterEmail.endsWith(`@${SCHOOL}`) && o.colorId && o.colorHex));
  const q = await team.req('GET', `/api/orders?q=${encodeURIComponent('test.lehrkraft')}`);
  assert.equal(q.json.length, 2);
});
test('Besteller-Verzeichnis nur für Team und Admin', async () => {
  assert.equal((await anon.req('GET', '/api/orders/requesters')).status, 401);
  assert.equal((await teacher.req('GET', '/api/orders/requesters')).status, 403);
  assert.equal((await admin.req('GET', '/api/orders/requesters')).status, 200);
});
test('Statusabfrage per Code ist ausgeschaltet (404)', async () => {
  const r = await anon.req('POST', '/api/orders/track', { codes: ['ABCDEFGH'] });
  assert.equal(r.status, 404);
  assert.equal((await anon.req('GET', `/api/orders/${order.id}`)).status, 401, 'kein Abruf per ID ohne Login');
});
test('Ungültige Farbe, Größe oder Menge wird abgelehnt', async () => {
  const base = orderBody();
  const otherFilament = (await anon.req('GET', '/api/config')).json.masterData.filaments.find(
    (f: any) => !publishedItem.colors.includes(f.id),
  );
  const label = await anon.req('POST', '/api/orders', { ...base, color: 'Türkis' });
  assert.equal(label.status, 400);
  assert.ok(label.json.fields?.color);
  assert.equal((await anon.req('POST', '/api/orders', { ...base, color: otherFilament.id })).status, 400, 'Farbrolle nicht beim Druckteil');
  assert.equal((await anon.req('POST', '/api/orders', { ...base, size: 'XXL' })).status, 400);
  assert.equal((await anon.req('POST', '/api/orders', { ...base, quantity: 0 })).status, 400);
  assert.equal((await anon.req('POST', '/api/orders', { ...base, itemId: hiddenItem.id })).status, 400);
});
test('Lehrkraft-Rolle sieht keine Anfragen und darf Status nicht ändern', async () => {
  assert.equal((await teacher.req('GET', '/api/orders')).status, 403);
  assert.equal((await teacher.req('GET', `/api/orders/${order.id}`)).status, 403);
  assert.equal((await teacher.req('PATCH', `/api/orders/${order.id}/status`, { status: 'in_druck' })).status, 403);
  const r = await teacher.req('POST', '/api/orders', { ...orderBody(), requesterEmail: `demo.lehrkraft@${SCHOOL}` });
  assert.equal(r.status, 201);
  assert.deepEqual(Object.keys(r.json).sort(), ['id', 'itemName', 'number'], 'auch angemeldet nur Bestätigung');
});
test('Angemeldet gilt die eigene E-Mail: andere Adresse im Body wird ersetzt (Lehrkraft und Konto)', async () => {
  const fremd = `jemand.anderes@${SCHOOL}`;
  const r = await teacher.req('POST', '/api/orders', { ...orderBody(), requesterEmail: fremd });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const stored = (await team.req('GET', `/api/orders/${r.json.id}`)).json;
  assert.equal(stored.requesterEmail, TEACHER, 'Anfrage gehört der angemeldeten Lehrkraft');
  const mine = (await teacher.req('GET', '/api/orders/mine')).json;
  assert.ok(mine.some((o: any) => o.id === r.json.id), 'erscheint unter „Meine Anfragen“');
  // Auch eine fremde Domain spielt angemeldet keine Rolle – es zählt die Adresse der Sitzung.
  const gmail = await teacher.req('POST', '/api/orders', { ...orderBody(), requesterEmail: 'jemand@gmail.com' });
  assert.equal(gmail.status, 201, JSON.stringify(gmail.json));
  // Konto (Druck-Team): ebenfalls die eigene Adresse
  const me = (await team.req('GET', '/api/auth/me')).json.user;
  const t = await team.req('POST', '/api/orders', { ...orderBody(), requesterEmail: fremd });
  assert.equal(t.status, 201, JSON.stringify(t.json));
  assert.equal(t.json.requesterEmail, me.email);
  assert.ok((await team.req('GET', '/api/orders/mine')).json.some((o: any) => o.id === t.json.id));
  const list = (await team.req('GET', '/api/orders/requesters')).json;
  assert.ok(!list.some((x: any) => x.email === fremd), 'fremde Adresse wird nicht angelegt');
});
test('Ausgeschalteter Status ist nicht wählbar', async () => {
  const r = await team.req('PATCH', `/api/orders/${order.id}/status`, { status: 'in_druck' });
  assert.equal(r.status, 400, JSON.stringify(r.json));
  assert.match(r.json.error, /ausgeschaltet/);
  const comment = await team.req('PATCH', `/api/orders/${order.id}/status`, { status: 'offen', comment: 'Gesehen' });
  assert.equal(comment.status, 200, 'Kommentar zum aktuellen Status geht immer');
});
test('Druck-Team ändert Status nur auf Status aus den Stammdaten', async () => {
  assert.equal((await admin.req('PATCH', '/api/admin/settings/order-statuses/in_druck', { active: true })).status, 200);
  const r = await team.req('PATCH', `/api/orders/${order.id}/status`, { status: 'in_druck', comment: 'Läuft' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.history.at(-1).status, 'in_druck');
  assert.equal(r.json.history.at(-1).comment, 'Läuft');
  const old = await team.req('PATCH', `/api/orders/${order.id}/status`, { status: 'fertig' });
  assert.equal(old.status, 400, 'alter Status „fertig“ existiert nicht mehr');
  assert.equal((await team.req('PATCH', `/api/orders/${order.id}/status`, { status: 'unbekannt' })).status, 400);
  const done = await team.req('PATCH', `/api/orders/${order.id}/status`, { status: 'gedruckt' });
  assert.equal(done.status, 200);
  await team.req('PATCH', `/api/orders/${order.id}/status`, { status: 'in_druck' });
});
test('Erneut anfragen: Vorlage nur für die eigene Anfrage, neue Nummer, leere Farbe → Hinweis', async () => {
  const mine = await teacher.req('POST', '/api/orders', {
    ...orderBody(), requesterEmail: TEACHER, quantity: 3, classOrTeam: 'Klasse 2c', customization: 'Etwas dicker.',
  });
  assert.equal(mine.status, 201, JSON.stringify(mine.json));
  // Vorlage: eigene Anfrage vorbelegt
  const t = await teacher.req('GET', `/api/orders/${mine.json.id}/vorlage`);
  assert.equal(t.status, 200, JSON.stringify(t.json));
  assert.equal(t.json.available, true);
  assert.equal(t.json.quantity, 3);
  assert.equal(t.json.classOrTeam, 'Klasse 2c');
  assert.equal(t.json.customization, 'Etwas dicker.');
  assert.equal(t.json.size, publishedItem.sizes[0]);
  assert.deepEqual(Object.values(t.json.colors), [publishedItem.colors[0]]);
  assert.deepEqual(t.json.hinweise, []);
  // Fremde Anfrage, Gast und Druck-Team: keine Vorlage
  const foreign = (await team.req('GET', '/api/orders')).json.find((o: any) => o.requesterEmail !== TEACHER);
  assert.ok(foreign, 'es gibt Anfragen anderer Lehrkräfte');
  assert.equal((await teacher.req('GET', `/api/orders/${foreign.id}/vorlage`)).status, 404);
  assert.equal((await anon.req('GET', `/api/orders/${mine.json.id}/vorlage`)).status, 401);
  assert.equal((await team.req('GET', `/api/orders/${mine.json.id}/vorlage`)).status, 404, 'fremde Anfrage, auch für Konten');
  // Erneut anfragen = neuer Datensatz mit neuer Nummer und Verweis auf die Ursprungsanfrage
  const again = await teacher.req('POST', '/api/orders', {
    ...orderBody(), requesterEmail: TEACHER, quantity: 2, repeatOf: mine.json.id,
  });
  assert.equal(again.status, 201, JSON.stringify(again.json));
  assert.notEqual(again.json.id, mine.json.id);
  assert.notEqual(again.json.number, mine.json.number);
  const stored = (await team.req('GET', `/api/orders/${again.json.id}`)).json;
  assert.equal(stored.repeatOf, mine.json.id);
  assert.equal(stored.quantity, 2);
  // Verweis auf fremde Anfrage wird nicht übernommen
  const bad = await teacher.req('POST', '/api/orders', { ...orderBody(), requesterEmail: TEACHER, repeatOf: foreign.id });
  assert.equal(bad.status, 201);
  assert.equal((await team.req('GET', `/api/orders/${bad.json.id}`)).json.repeatOf, undefined);
  // Farbe inzwischen leer → Hinweis, Feld bleibt leer
  const id = publishedItem.colors[0];
  assert.equal((await team.req('PATCH', `/api/filaments/${id}/availability`, { available: false })).status, 200);
  const empty = await teacher.req('GET', `/api/orders/${mine.json.id}/vorlage`);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.json.colors, {});
  assert.ok(empty.json.hinweise.some((h: string) => h.includes('nicht mehr verfügbar')), JSON.stringify(empty.json.hinweise));
  assert.equal((await team.req('PATCH', `/api/filaments/${id}/availability`, { available: true })).status, 200);
});
test('Dashboard nur für Team und Admin', async () => {
  assert.equal((await teacher.req('GET', '/api/dashboard')).status, 403);
  const r = await team.req('GET', '/api/dashboard');
  assert.equal(r.status, 200);
  assert.ok(r.json.items.total >= 9);
  assert.ok(r.json.orders.printing >= 1);
});

// Mehrere Farben in einer Anfrage und nachträgliches Ändern durch die Lehrkraft.
const areasOf = (item: any) => (item.colorAreas?.length ? item.colorAreas : [{ id: 'farbe', colors: item.colors }]);
async function availableColors() {
  const filaments = (await anon.req('GET', '/api/config')).json.masterData.filaments;
  return areasOf(publishedItem).map((a: any) => ({ id: a.id, colors: a.colors.filter((c: string) => filaments.some((f: any) => f.id === c && f.available)) }));
}
/** Farbe je Bereich: die n-te vorrätige Farbe. */
const pick = (areas: { id: string; colors: string[] }[], n: number) => Object.fromEntries(areas.map((a) => [a.id, a.colors[n % a.colors.length]]));
const mineOf = async (id: string) => (await teacher.req('GET', '/api/orders/mine')).json.find((o: any) => o.id === id);

test('Mehrere Farben: Summe als Stückzahl, Aufteilung gespeichert, erste Variante als bisherige Farbe', async () => {
  const areas = await availableColors();
  assert.ok(areas[0].colors.length >= 2, 'Demo-Druckteil braucht zwei vorrätige Farben');
  const r = await teacher.req('POST', '/api/orders', {
    ...orderBody(), requesterEmail: TEACHER, quantity: 7,
    variants: [{ quantity: 3, colors: pick(areas, 0) }, { quantity: 4, colors: pick(areas, 1) }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const stored = (await team.req('GET', `/api/orders/${r.json.id}`)).json;
  assert.equal(stored.quantity, 7);
  assert.deepEqual(stored.colorVariants.map((v: any) => v.quantity), [3, 4]);
  assert.equal(stored.colorVariants[1].colorChoices[0].colorId, areas[0].colors[1]);
  assert.equal(stored.colorId, areas[0].colors[0], 'erste Variante gilt als bisherige Farbe');
  assert.deepEqual(stored.colorChoices, stored.colorVariants[0].colorChoices);
  assert.match(stored.color, /^3 × .+, 4 × .+$/);
  const own = await mineOf(r.json.id);
  assert.equal(own.colorVariants.length, 2);
  // Eine einzige Variante = wie bisher, ohne Aufteilung
  const one = await teacher.req('POST', '/api/orders', { ...orderBody(), requesterEmail: TEACHER, variants: [{ quantity: 2, colors: pick(areas, 0) }] });
  assert.equal(one.status, 201, JSON.stringify(one.json));
  const single = (await team.req('GET', `/api/orders/${one.json.id}`)).json;
  assert.equal(single.quantity, 2);
  assert.deepEqual(single.colorVariants, []);
});
test('Mehrere Farben: falsche Farbe oder Summe über 20 → 400', async () => {
  const areas = await availableColors();
  const otherFilament = (await anon.req('GET', '/api/config')).json.masterData.filaments.find((f: any) => !publishedItem.colors.includes(f.id));
  const wrong = await anon.req('POST', '/api/orders', {
    ...orderBody(), quantity: 2,
    variants: [{ quantity: 1, colors: pick(areas, 0) }, { quantity: 1, colors: { [areas[0].id]: otherFilament.id } }],
  });
  assert.equal(wrong.status, 400);
  assert.ok(Object.keys(wrong.json.fields ?? {}).some((k) => k.startsWith('variants.1.')), JSON.stringify(wrong.json));
  const tooMany = await anon.req('POST', '/api/orders', {
    ...orderBody(), quantity: 20,
    variants: [{ quantity: 15, colors: pick(areas, 0) }, { quantity: 10, colors: pick(areas, 1) }],
  });
  assert.equal(tooMany.status, 400);
  assert.ok(tooMany.json.fields?.quantity);
  assert.equal((await anon.req('POST', '/api/orders', { ...orderBody(), variants: [] })).status, 400);
});
test('Alte Anfrage ohne Varianten bleibt unverändert', async () => {
  const stored = (await team.req('GET', `/api/orders/${order.id}`)).json;
  assert.deepEqual(stored.colorVariants, []);
  assert.equal(stored.quantity, 1);
  assert.equal(stored.colorId, publishedItem.colors[0]);
  const demo = (await team.req('GET', '/api/orders')).json.filter((o: any) => o.isDemo);
  assert.ok(demo.every((o: any) => Array.isArray(o.colorVariants) && o.colorVariants.length === 0));
});
test('Anfrage bearbeiten: eigene offene ändern, fremde 404, nach Statuswechsel 409', async () => {
  const areas = await availableColors();
  const mine = await teacher.req('POST', '/api/orders', { ...orderBody(), requesterEmail: TEACHER, quantity: 2 });
  assert.equal(mine.status, 201, JSON.stringify(mine.json));
  const id = mine.json.id;
  assert.equal((await mineOf(id)).editable, true);
  // Ändern: zwei Farben, andere Klasse
  const body = {
    ...orderBody(), requesterEmail: TEACHER, quantity: 5, classOrTeam: 'Klasse 3d',
    variants: [{ quantity: 2, colors: pick(areas, 0) }, { quantity: 3, colors: pick(areas, 1) }],
  };
  const put = await teacher.req('PUT', `/api/orders/${id}`, body);
  assert.equal(put.status, 200, JSON.stringify(put.json));
  assert.equal(put.json.editable, true);
  const stored = (await team.req('GET', `/api/orders/${id}`)).json;
  assert.equal(stored.number, mine.json.number);
  assert.equal(stored.quantity, 5);
  assert.equal(stored.classOrTeam, 'Klasse 3d');
  assert.equal(stored.colorVariants.length, 2);
  assert.equal(stored.status, 'offen');
  assert.equal(stored.history.length, 2);
  assert.equal(stored.history.at(-1).comment, 'Von der Lehrkraft geändert');
  assert.equal(stored.history.at(-1).status, 'offen');
  assert.ok(stored.updatedAt >= stored.createdAt);
  // Gleiche Prüfung wie beim Anlegen; Druckteil nicht änderbar
  assert.equal((await teacher.req('PUT', `/api/orders/${id}`, { ...body, variants: undefined, color: 'Türkis' })).status, 400);
  const otherItem = (await teacher.req('GET', '/api/items?all=1')).json.find((i: any) => i.id !== publishedItem.id);
  assert.equal((await teacher.req('PUT', `/api/orders/${id}`, { ...body, itemId: otherItem.id })).status, 400);
  // Fremde Anfrage, Gast, Druck-Team
  const foreign = (await team.req('GET', '/api/orders')).json.find((o: any) => o.requesterEmail !== TEACHER && o.status === 'offen');
  assert.equal((await teacher.req('PUT', `/api/orders/${foreign.id}`, body)).status, 404);
  assert.equal((await anon.req('PUT', `/api/orders/${id}`, body)).status, 401);
  assert.equal((await team.req('PUT', `/api/orders/${id}`, body)).status, 404, 'fremde Anfrage, auch für Konten');
  // Team sieht die Anfrage an (anderer Status) → gesperrt
  assert.equal((await team.req('PATCH', `/api/orders/${id}/status`, { status: 'in_druck' })).status, 200);
  const locked = await teacher.req('PUT', `/api/orders/${id}`, body);
  assert.equal(locked.status, 409);
  assert.match(locked.json.error, /schon bearbeitet/);
  assert.equal((await mineOf(id)).editable, false);
  // Vorlage enthält die Farbvarianten (für Bearbeiten und Erneut anfragen)
  const t = (await teacher.req('GET', `/api/orders/${id}/vorlage`)).json;
  assert.deepEqual(t.variants.map((v: any) => v.quantity), [2, 3]);
});
test('„Farbe egal“ wird angenommen (auch in Varianten und Vorlage), unbekannte Farbe weiter 400', async () => {
  const areas = await availableColors();
  const egal = Object.fromEntries(areas.map((a: any) => [a.id, 'egal']));
  const r = await teacher.req('POST', '/api/orders', {
    ...orderBody(), requesterEmail: TEACHER, quantity: 3,
    variants: [{ quantity: 1, colors: egal }, { quantity: 2, colors: pick(areas, 0) }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const stored = (await team.req('GET', `/api/orders/${r.json.id}`)).json;
  assert.equal(stored.colorId, 'egal');
  assert.equal(stored.colorChoices[0].color, 'Farbe egal');
  assert.equal(stored.colorChoices[0].colorHex, '');
  assert.match(stored.color, /^1 × .*Farbe egal.*, 2 × /);
  const t = (await teacher.req('GET', `/api/orders/${r.json.id}/vorlage`)).json;
  assert.deepEqual(t.variants[0].colors, egal);
  const single = await anon.req('POST', '/api/orders', { ...orderBody(), color: 'egal' });
  assert.equal(single.status, 201, JSON.stringify(single.json));
  assert.equal((await anon.req('POST', '/api/orders', { ...orderBody(), color: 'gibt-es-nicht' })).status, 400);
});
