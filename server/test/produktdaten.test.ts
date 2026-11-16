// Produktdaten: Farbbereiche, Preis, Personalisierung, Videos.
// Eigener Server, damit das Anfrage-Limit (30/h je IP) der übrigen Tests nicht greift.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { buildOrderMail } from '../src/module/anfragen/anfragen.mail';
import { Client, mail, PNG_1PX, pw, SCHOOL, startServer } from './helfer';
const pd = await startServer({ allowDemoAccounts: true, seedDemoData: true });
const pdAnon = new Client(pd.base);
const pdTeam = new Client(pd.base);
await pdTeam.login(mail('druckteam'), pw('druckteam'));
const RED = 'bambu-pla-basic-red';
const CYAN = 'bambu-pla-basic-cyan';
const YELLOW = 'bambu-pla-basic-yellow';
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(32)]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('\x9fB\x82\x84webm'), Buffer.alloc(32)]);
const videoForm = (name: string, content: Buffer, title = '') => {
  const fd = new FormData();
  fd.append('title', title);
  fd.append('file', new Blob([content]), name);
  return fd;
};
const multiBody = {
  name: 'Mehrfarbiges Lineal', shortDescription: 'Lineal mit Griff in eigener Farbe.', category: 'Sonstiges',
  useAreas: [], sizes: ['15 cm'], material: 'PLA', printTimeMinutes: 60, published: true, price: 'ca. 2 € Material',
  colorAreas: [
    { id: '', name: 'Lineal', colors: [RED, CYAN] },
    { id: '', name: 'Griff', colors: [YELLOW] },
  ],
  customFields: [
    { id: '', label: 'Beschriftung', type: 'text', required: true, maxLength: 8, hint: 'z. B. Klasse' },
    { id: '', label: 'Buchstabe', type: 'select', required: false, options: ['A', 'B'] },
    { id: '', label: 'Höhe in mm', type: 'number', required: false, maxLength: 4 },
  ],
};
let multi: any;
test('Mehrfarbiges Druckteil mit Preis und Personalisierung anlegen', async () => {
  const r = await pdTeam.req('POST', '/api/items', multiBody);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  multi = r.json;
  assert.equal(multi.price, 'ca. 2 € Material');
  assert.equal(multi.colorAreas.length, 2);
  assert.ok(multi.colorAreas.every((a: any) => a.id), 'Bereiche erhalten IDs');
  assert.deepEqual(multi.colors.sort(), [CYAN, RED, YELLOW].sort(), 'colors = alle Farben aller Bereiche');
  assert.equal(multi.customFields.length, 3);
  assert.ok(multi.customFields.every((f: any) => f.id));
  assert.deepEqual(multi.videos, []);
  // IDs bleiben beim Speichern erhalten (Anfragen bleiben zuordenbar).
  const again = await pdTeam.req('PUT', `/api/items/${multi.id}`, { ...multiBody, colorAreas: multi.colorAreas, customFields: multi.customFields });
  assert.equal(again.status, 200);
  assert.deepEqual(again.json.colorAreas.map((a: any) => a.id), multi.colorAreas.map((a: any) => a.id));
});
test('Ungültige Produktdaten werden abgelehnt', async () => {
  const cases: [string, unknown][] = [
    ['colorAreas', { ...multiBody, colorAreas: [{ name: 'A', colors: [RED] }, { name: 'a', colors: [CYAN] }] }],
    ['colorAreas', { ...multiBody, colorAreas: [{ name: 'Griff', colors: [] }] }],
    ['colorAreas', { ...multiBody, colorAreas: [{ name: 'Griff', colors: ['gibt-es-nicht'] }] }],
    ['customFields', { ...multiBody, customFields: [{ label: 'Auswahl', type: 'select', options: [] }] }],
    ['customFields', { ...multiBody, customFields: [{ label: 'X', type: 'text', maxLength: 5000 }] }],
    ['price', { ...multiBody, price: 'x'.repeat(81) }],
  ];
  for (const [field, body] of cases) {
    const r = await pdTeam.req('POST', '/api/items', body);
    assert.equal(r.status, 400, `${field}: ${JSON.stringify(r.json)}`);
    assert.ok(r.json.fields?.[field], `${field}: ${JSON.stringify(r.json)}`);
  }
  assert.equal((await pdAnon.req('POST', '/api/items', multiBody)).status, 401);
});
test('Anfrage: Farbe je Bereich und Personalisierung werden geprüft', async () => {
  const [lineal, griff] = multi.colorAreas;
  const [text, select, num] = multi.customFields;
  const base = {
    itemId: multi.id, quantity: 1, size: '15 cm', requesterEmail: `test.lehrkraft@${SCHOOL}`, classOrTeam: '2a',
    colors: { [lineal.id]: CYAN, [griff.id]: YELLOW }, personalization: { [text.id]: '2a' },
  };
  const missing = await pdAnon.req('POST', '/api/orders', { ...base, colors: { [lineal.id]: CYAN } });
  assert.equal(missing.status, 400);
  assert.ok(missing.json.fields?.[`color.${griff.id}`]);
  const wrong = await pdAnon.req('POST', '/api/orders', { ...base, colors: { [lineal.id]: YELLOW, [griff.id]: YELLOW } });
  assert.ok(wrong.json.fields?.[`color.${lineal.id}`], 'Farbe aus anderem Bereich ist nicht erlaubt');
  for (const personalization of [{}, { [text.id]: 'zu lang!!' }, { [text.id]: 'ok', [select.id]: 'C' }, { [text.id]: 'ok', [num.id]: 'zehn' }]) {
    const r = await pdAnon.req('POST', '/api/orders', { ...base, personalization });
    assert.equal(r.status, 400, JSON.stringify(personalization));
    assert.ok(Object.keys(r.json.fields ?? {}).some((k) => k.startsWith('custom.')), JSON.stringify(r.json));
  }
  const ok = await pdAnon.req('POST', '/api/orders', { ...base, personalization: { [text.id]: ' 2a ', [select.id]: 'B', [num.id]: '12,5', fremd: 'x' } });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  const order = (await pdTeam.req('GET', `/api/orders/${ok.json.id}`)).json;
  assert.deepEqual(order.colorChoices.map((c: any) => [c.area, c.colorId]), [['Lineal', CYAN], ['Griff', YELLOW]]);
  assert.match(order.color, /^Lineal: .+; Griff: .+$/);
  assert.equal(order.colorId, CYAN);
  assert.deepEqual(order.personalization.map((p: any) => [p.label, p.value]), [['Beschriftung', '2a'], ['Buchstabe', 'B'], ['Höhe in mm', '12,5']]);
  // Anfragende sehen nur den Farbnamen, nicht Marke/Linie der Rolle.
  for (const c of order.colorChoices) assert.doesNotMatch(c.color, /Bambu|PLA/, c.color);
  // Bestell-Mail: Farbe je Bereich und Personalisierung stehen drin; das Team sieht zusätzlich die Rolle.
  const { filaments } = (await pdTeam.req('GET', '/api/config')).json.masterData;
  const mailText = buildOrderMail(order, null, { appBaseUrl: '' }, filaments).text;
  assert.match(mailText, /Farbe Lineal.*\(Bambu Lab PLA Basic, Nr\. \d{5}\)/, 'Team-Mail nennt Rolle und Bambu-Nummer');
  for (const t of ['Farbe Lineal', 'Farbe Griff', 'Beschriftung', '2a', 'Buchstabe', 'Höhe in mm']) assert.ok(mailText.includes(t), `Mail enthält ${t}`);
});
test('Anfrage: leere Farbrolle wird je Farbbereich abgelehnt', async () => {
  const [lineal, griff] = multi.colorAreas;
  const [text] = multi.customFields;
  const body = {
    itemId: multi.id, quantity: 1, size: '15 cm', requesterEmail: `test.lehrkraft@${SCHOOL}`, classOrTeam: '2a',
    colors: { [lineal.id]: CYAN, [griff.id]: YELLOW }, personalization: { [text.id]: '2a' },
  };
  const toggle = (available: boolean) => pdTeam.req('PATCH', `/api/filaments/${YELLOW}/availability`, { available });
  assert.equal((await toggle(false)).status, 200);
  try {
    const r = await pdAnon.req('POST', '/api/orders', body);
    assert.equal(r.status, 400, JSON.stringify(r.json));
    assert.ok(r.json.fields?.[`color.${griff.id}`], 'Griff: Farbe leer');
    assert.ok(!r.json.fields?.[`color.${lineal.id}`], 'Lineal ist nicht betroffen');
  } finally {
    await toggle(true);
  }
  assert.equal((await pdAnon.req('POST', '/api/orders', body)).status, 201, 'wieder vorrätig → Anfrage möglich');
});
test('Einfarbige Teile: ältere Clients mit „color“ funktionieren weiter', async () => {
  const item = (await pdAnon.req('GET', '/api/items')).json.find((i: any) => i.colorAreas.length === 1 && i.customFields.length === 0);
  assert.ok(item, 'Demo-Druckteile wurden migriert (ein Bereich)');
  const r = await pdAnon.req('POST', '/api/orders', {
    itemId: item.id, quantity: 1, color: item.colors[0], size: item.sizes[0], requesterEmail: `test.lehrkraft@${SCHOOL}`, classOrTeam: '2a',
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const order = (await pdTeam.req('GET', `/api/orders/${r.json.id}`)).json;
  assert.equal(order.colorChoices.length, 1);
  assert.equal(order.colorId, item.colors[0]);
  assert.ok(!order.color.includes(':'), 'einfarbig: Farbname ohne Bereich');
});
test('Videos: MP4/WebM mit Prüfung des Inhalts, Links nur http(s)', async () => {
  const fake = await pdTeam.req('POST', `/api/items/${multi.id}/videos`, undefined, { form: videoForm('fake.mp4', PNG_1PX) });
  assert.equal(fake.status, 400, 'PNG als .mp4 wird abgelehnt');
  const wrongExt = await pdTeam.req('POST', `/api/items/${multi.id}/videos`, undefined, { form: videoForm('film.avi', MP4) });
  assert.equal(wrongExt.status, 400);
  const mp4 = await pdTeam.req('POST', `/api/items/${multi.id}/videos`, undefined, { form: videoForm('anleitung.mp4', MP4, 'So geht es') });
  assert.equal(mp4.status, 201, JSON.stringify(mp4.json));
  const [v] = mp4.json.videos;
  assert.match(v.file, /^[a-f0-9-]{36}\.mp4$/);
  assert.equal(v.title, 'So geht es');
  assert.ok(existsSync(path.join(pd.storageDir, 'ablage', 'artikel', multi.id, 'video', v.file)), 'Video liegt im Ablageordner des Artikels');
  const webm = await pdTeam.req('POST', `/api/items/${multi.id}/videos`, undefined, { form: videoForm('clip.webm', WEBM) });
  assert.equal(webm.status, 201, JSON.stringify(webm.json));
  assert.equal(webm.json.videos[1].title, 'clip');
  const js = await pdTeam.req('POST', `/api/items/${multi.id}/videos/link`, { title: 'X', url: 'javascript:alert(1)' });
  assert.equal(js.status, 400);
  const link = await pdTeam.req('POST', `/api/items/${multi.id}/videos/link`, { title: 'Erklärvideo', url: 'https://example.org/video' });
  assert.equal(link.status, 201);
  const extra = await pdTeam.req('POST', `/api/items/${multi.id}/videos/link`, { url: 'https://example.org/2' });
  assert.equal(extra.status, 201);
  const tooMany = await pdTeam.req('POST', `/api/items/${multi.id}/videos/link`, { url: 'https://example.org/3' });
  assert.equal(tooMany.status, 400, 'höchstens 4 Videos');
  assert.equal((await pdAnon.req('POST', `/api/items/${multi.id}/videos/link`, { url: 'https://example.org/4' })).status, 401);
  // Auslieferung: öffentlich bei veröffentlichten Teilen, mit Range (Vorspulen), Entwürfe verborgen.
  const res = await fetch(`${pd.base}/api/files/videos/${v.file}`, { headers: { Range: 'bytes=0-7' } });
  assert.equal(res.status, 206);
  assert.match(res.headers.get('content-type') ?? '', /video\/mp4/);
  await pdTeam.req('PATCH', `/api/items/${multi.id}/publish`, { published: false });
  assert.equal((await pdAnon.req('GET', `/api/files/videos/${v.file}`)).status, 404);
  assert.equal((await pdTeam.req('GET', `/api/files/videos/${v.file}`)).status, 200);
  assert.equal((await pdAnon.req('GET', '/api/files/videos/..%2Fsettings.json')).status, 404);
  // Löschen entfernt die Datei.
  const del = await pdTeam.req('DELETE', `/api/items/${multi.id}/videos/${v.id}`);
  assert.equal(del.status, 200);
  assert.equal(del.json.videos.length, 3);
  assert.equal(existsSync(path.join(pd.storageDir, 'ablage', 'artikel', multi.id, 'video', v.file)), false);
  const webmFile = webm.json.videos[1].file;
  await pdTeam.req('DELETE', `/api/items/${multi.id}`);
  assert.equal(existsSync(path.join(pd.storageDir, 'ablage', 'artikel', multi.id, 'video', webmFile)), false, 'Druckteil löschen entfernt Videos');
});
after(() => pd.stop());
