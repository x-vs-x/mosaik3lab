// Vorschläge der Lehrkräfte: einreichen mit Fotos, Sichtbarkeit, Bearbeitung durch das Team, Umwandlung in ein Produkt.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { openDb } from '../src/kern/db';
import { Client, mail, mailConfig, PNG_1PX, pw, SCHOOL, sentMails, sleep, startServer, TEACHER, TEAM_STANDARD, writeMailFile as schreibeMail } from './helfer';

const srv = await startServer({ allowDemoAccounts: true, seedDemoData: true });
after(() => srv.stop());
const anon = new Client(srv.base);
const writeMailFile = (content: Record<string, unknown>) => schreibeMail(content, path.join(srv.storageDir, 'mosaik3lab.db'));
const propTeacher = new Client(srv.base);
const propOther = new Client(srv.base);
const propTeam = new Client(srv.base);
const propAdmin = new Client(srv.base);
await propTeacher.identify(TEACHER);
await propOther.req("POST", "/api/auth/register", { email: `herr.anders@${SCHOOL}` });
await propTeam.login(mail('druckteam'), pw('druckteam'));
await propAdmin.login(mail('admin'), pw('admin'));
const proposalForm = (data: unknown, photos: { name: string; content: Buffer }[] = []) => {
  const fd = new FormData();
  fd.append('data', JSON.stringify(data));
  for (const p of photos) fd.append('photos', new Blob([p.content], { type: 'image/png' }), p.name);
  return fd;
};
const proposalBody = {
  title: 'Griffverdickung für Buntstifte',
  description: 'Mehrere Kinder können dünne Stifte nicht halten. Eine Verdickung zum Aufstecken wäre hilfreich.',
  usage: 'Unterricht, Klasse 3b',
  links: ['https://example.org/stiftgriff'],
  quantity: 4,
  urgency: 'bald',
};
let proposalId = '';
let proposalNumber = '';
let proposalPhoto = '';
test('Lehrkraft reicht Vorschlag mit Fotos ein (Nummer VOR-JJJJ-NNNN, Status neu)', async () => {
  await writeMailFile(mailConfig);
  const before = sentMails.length;
  const r = await propTeacher.req('POST', '/api/proposals', undefined, {
    form: proposalForm(proposalBody, [{ name: 'foto1.png', content: PNG_1PX }, { name: 'foto2.png', content: PNG_1PX }]),
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.match(r.json.number, /^VOR-\d{4}-0001$/);
  assert.equal(r.json.status, 'neu');
  assert.equal(r.json.photos.length, 2);
  assert.ok(!('requesterEmail' in r.json), 'Lehrkraft sieht keine internen Felder');
  proposalId = r.json.id;
  proposalNumber = r.json.number;
  proposalPhoto = r.json.photos[0];
  // Bestell-Mail-Empfänger bekommen auch Vorschläge
  for (let i = 0; i < 40 && sentMails.length === before; i++) await sleep(50);
  const m = sentMails.at(-1);
  assert.ok(m.subject.includes(proposalNumber) && m.subject.includes('Neuer Vorschlag'), m.subject);
  assert.ok(m.text.includes('https://example.org/stiftgriff') && !m.html.includes('href="https://example.org'), 'Links nur als Text');
  assert.ok(m.html.includes('/verwaltung/vorschlaege?offen='));
});
test('Fotos liegen als Datei-Datensatz (objekttyp vorschlag, rolle foto) an vorhersagbarem Pfad', async () => {
  const db = openDb(path.join(srv.storageDir, 'mosaik3lab.db'), { readOnly: true });
  const rows = db.prepare("SELECT * FROM datei WHERE objekttyp = 'vorschlag' AND objekt_id = ?").all(proposalId) as any[];
  db.close();
  assert.equal(rows.length, 2);
  for (const d of rows) {
    assert.equal(d.rolle, 'foto');
    assert.ok(d.pfad.startsWith(`vorschlag/${proposalId}/foto/${d.id}.`), d.pfad);
    assert.ok(existsSync(path.join(srv.storageDir, 'ablage', ...d.pfad.split('/'))));
  }
});
test('Einreichen: nur angemeldete Lehrkräfte, Eingaben und Fotos werden geprüft', async () => {
  assert.equal((await anon.req('POST', '/api/proposals', undefined, { form: proposalForm(proposalBody) })).status, 401);
  // Ohne Häkchen „Druckteile vorschlagen“ kein Einreichen (Druck-Team-Konten haben es standardmäßig wie jede Lehrkraft).
  await propAdmin.req('PUT', '/api/personen', { email: mail('druckteam'), role: 'druckteam', bereiche: TEAM_STANDARD.filter((b) => b !== 'vorschlaege') });
  assert.equal((await propTeam.req('POST', '/api/proposals', undefined, { form: proposalForm(proposalBody) })).status, 403, 'ohne Häkchen kein Vorschlag');
  await propAdmin.req('PUT', '/api/personen', { email: mail('druckteam'), role: 'druckteam', bereiche: TEAM_STANDARD });
  assert.equal((await propTeacher.req('POST', '/api/proposals', undefined, { form: proposalForm({ ...proposalBody, title: 'ab' }) })).status, 400);
  assert.equal((await propTeacher.req('POST', '/api/proposals', undefined, { form: proposalForm({ ...proposalBody, links: ['javascript:alert(1)'] }) })).status, 400);
  assert.equal((await propTeacher.req('POST', '/api/proposals', undefined, { form: proposalForm({ ...proposalBody, links: ['ftp://example.org/x'] }) })).status, 400);
  assert.equal((await propTeacher.req('POST', '/api/proposals', undefined, { form: proposalForm({ ...proposalBody, quantity: 0 }) })).status, 400);
  assert.equal((await propTeacher.req('POST', '/api/proposals', undefined, { form: proposalForm(proposalBody, [{ name: 'fake.png', content: Buffer.from('kein bild') }]) })).status, 400);
  const six = Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.png`, content: PNG_1PX }));
  assert.equal((await propTeacher.req('POST', '/api/proposals', undefined, { form: proposalForm(proposalBody, six) })).status, 400, 'höchstens 5 Fotos');
  const list = (await propAdmin.req('GET', '/api/proposals')).json;
  assert.equal(list.length, 1, 'abgelehnte Einreichungen hinterlassen nichts');
});
test('Lehrkraft sieht nur eigene Vorschläge; Fotos nur Eigentümer und Team', async () => {
  const mine = await propTeacher.req('GET', '/api/proposals/mine');
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.json.map((p: any) => p.id), [proposalId]);
  assert.deepEqual((await propOther.req('GET', '/api/proposals/mine')).json, []);
  assert.equal((await anon.req('GET', '/api/proposals/mine')).status, 401);
  assert.equal((await propTeacher.req('GET', '/api/proposals')).status, 403, 'Verwaltungsliste gesperrt');
  assert.equal((await propTeacher.req('GET', `/api/proposals/${proposalId}`)).status, 403);
  const url = `/api/proposals/${proposalId}/photos/${proposalPhoto}`;
  assert.equal((await propTeacher.req('GET', url)).status, 200);
  assert.equal((await propTeam.req('GET', url)).status, 200);
  assert.equal((await propOther.req('GET', url)).status, 404, 'fremde Lehrkraft');
  assert.ok([401, 403].includes((await anon.req('GET', url)).status));
  assert.equal((await propTeam.req('GET', `/api/proposals/${proposalId}/photos/..%2F..%2Fmosaik3lab.db`)).status, 404);
});
test('Team sieht und bearbeitet Vorschläge; Ablehnen braucht eine Antwort; Fremdzugriff verboten', async () => {
  const list = (await propTeam.req('GET', '/api/proposals?status=neu')).json;
  assert.equal(list.length, 1);
  assert.equal(list[0].requesterEmail, TEACHER);
  assert.equal((await propTeacher.req('PATCH', `/api/proposals/${proposalId}`, { status: 'in_pruefung', reply: '' })).status, 403);
  assert.equal((await propTeam.req('PATCH', `/api/proposals/${proposalId}`, { status: 'abgelehnt', reply: '' })).status, 400);
  assert.equal((await propTeam.req('PATCH', `/api/proposals/${proposalId}`, { status: 'unbekannt', reply: '' })).status, 400);
  const r = await propTeam.req('PATCH', `/api/proposals/${proposalId}`, { status: 'in_pruefung', reply: 'Wir schauen uns das an.' });
  assert.equal(r.status, 200);
  const mine = (await propTeacher.req('GET', '/api/proposals/mine')).json[0];
  assert.equal(mine.status, 'in_pruefung');
  assert.equal(mine.reply, 'Wir schauen uns das an.');
  assert.equal((await propTeam.req('PATCH', '/api/proposals/gibt-es-nicht', { status: 'neu', reply: '' })).status, 404);
});
test('Häkchen: ohne „Vorschläge bearbeiten“ gesperrt, ohne „Druckteile pflegen“ keine Umwandlung', async () => {
  const set = (bereiche: string[]) => propAdmin.req('PUT', '/api/personen', { email: mail('druckteam'), role: 'druckteam', bereiche });
  try {
    assert.equal((await set(TEAM_STANDARD.filter((b) => b !== 'team-druckteile'))).status, 200);
    assert.equal((await propTeam.req('POST', `/api/proposals/${proposalId}/convert`)).status, 403);
    assert.equal((await set(TEAM_STANDARD.filter((b) => b !== 'team-vorschlaege'))).status, 200);
    assert.equal((await propTeam.req('GET', '/api/proposals')).status, 403);
    assert.equal((await propTeam.req('PATCH', `/api/proposals/${proposalId}`, { status: 'neu', reply: '' })).status, 403);
    assert.equal((await propTeam.req('POST', `/api/proposals/${proposalId}/convert`)).status, 403);
  } finally {
    assert.equal((await set(TEAM_STANDARD)).status, 200);
  }
  assert.equal((await propTeam.req('GET', '/api/proposals')).status, 200);
});
test('„In Produkt umwandeln“: Entwurf mit Titel, Beschreibung und kopierten Fotos, Verknüpfung, nur einmal', async () => {
  assert.equal((await propTeacher.req('POST', `/api/proposals/${proposalId}/convert`)).status, 403);
  assert.equal((await anon.req('POST', `/api/proposals/${proposalId}/convert`)).status, 401);
  const r = await propTeam.req('POST', `/api/proposals/${proposalId}/convert`);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.proposal.status, 'umgesetzt');
  assert.equal(r.json.proposal.itemId, r.json.itemId);
  const item = (await propTeam.req('GET', `/api/items/${r.json.itemId}`)).json;
  assert.equal(item.published, false, 'nur Entwurf');
  assert.equal(item.name, proposalBody.title);
  assert.equal(item.description, proposalBody.description);
  assert.equal(item.images.length, 2);
  assert.ok(item.images.every((f: string) => !r.json.proposal.photos.includes(f)), 'Fotos haben neue IDs');
  assert.equal((await propTeam.req('GET', `/api/files/images/${item.images[0]}`)).status, 200, 'Team sieht das Bild des Entwurfs');
  assert.equal((await anon.req('GET', `/api/files/images/${item.images[0]}`)).status, 404, 'Entwurf nicht öffentlich');
  assert.equal((await propTeam.req('GET', `/api/proposals/${proposalId}/photos/${proposalPhoto}`)).status, 200, 'Original-Fotos bleiben');
  assert.ok(!(await anon.req('GET', '/api/items')).json.some((i: any) => i.id === item.id), 'nicht im Katalog');
  assert.equal((await propTeam.req('POST', `/api/proposals/${proposalId}/convert`)).status, 409, 'nicht doppelt');
  assert.equal((await propTeam.req('PUT', `/api/items/${item.id}`, { ...item, shortDescription: 'Griffverdickung zum Aufstecken auf Stifte.', price: '' })).status, 200, 'Entwurf lässt sich bearbeiten');
  const mine = (await propTeacher.req('GET', '/api/proposals/mine')).json[0];
  assert.equal(mine.status, 'umgesetzt');
  assert.ok(!('itemId' in mine), 'Lehrkraft sieht keine interne Artikel-ID');
});
test('Löschen des Entwurfs entfernt nur dessen Bilder; der Vorschlag bleibt erhalten', async () => {
  const p = (await propTeam.req('GET', `/api/proposals/${proposalId}`)).json;
  assert.ok(p.itemId);
  assert.equal((await propTeam.req('DELETE', `/api/items/${p.itemId}`)).status, 200);
  const after = (await propTeam.req('GET', `/api/proposals/${proposalId}`)).json;
  assert.equal(after.itemId, null);
  assert.equal(after.photos.length, 2);
  assert.equal((await propTeam.req('GET', `/api/proposals/${proposalId}/photos/${proposalPhoto}`)).status, 200);
});
test('Zweiter Vorschlag erhält die nächste Nummer', async () => {
  const r = await propOther.req('POST', '/api/proposals', undefined, { form: proposalForm({ title: 'Rutschfeste Unterlage', description: 'Teller rutscht auf dem Tisch hin und her.' }) });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.match(r.json.number, /^VOR-\d{4}-0002$/);
  assert.equal(r.json.quantity, 1);
  assert.equal(r.json.urgency, 'normal');
  assert.deepEqual(r.json.photos, []);
});
