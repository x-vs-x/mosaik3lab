// Fehler, die an der Anfrage selbst liegen (kaputte Adresse, unbekannte Kodierung, abgebrochener oder unvollständiger
// Upload), sind kein „unerwarteter Serverfehler“: Antwort 4xx mit verständlichem Text, kein Stacktrace im Protokoll.
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, test } from 'node:test';
import { anmelden, sleep, startServer } from './helfer';

const srv = await startServer({ allowDemoAccounts: true, seedDemoData: true });
after(() => srv.stop());
const { team, admin } = await anmelden(srv.base);
const cookie = (team as unknown as { cookie: string }).cookie;
const item = (await team.req('GET', '/api/items?all=1')).json[0];

/** Rohe Anfrage (fetch bereinigt Adresse und Kopfzeilen); `abbrechenNach`: nur so viele Zeichen senden, dann Verbindung kappen. */
const roh = (method: string, pfad: string, headers: Record<string, string> = {}, body = '', abbrechenNach?: number) =>
  new Promise<{ status: number; json: any }>((ok) => {
    const u = new URL(srv.base);
    const r = http.request({ host: u.hostname, port: u.port, method, path: pfad, headers: { Cookie: cookie, 'X-Requested-With': 'mosaik3lab', ...headers } }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => {
        let json: unknown;
        try {
          json = JSON.parse(b);
        } catch {
          json = b;
        }
        ok({ status: res.statusCode ?? 0, json });
      });
    });
    r.on('error', () => ok({ status: -1, json: undefined }));
    if (abbrechenNach === undefined) return void r.end(body);
    r.write(body.slice(0, abbrechenNach));
    setTimeout(() => r.destroy(), 50);
  });

/** Sammelt, was währenddessen als „[Fehler]“ im Protokoll landet. */
async function protokoll<T>(fn: () => Promise<T>): Promise<{ wert: T; fehler: unknown[][] }> {
  const fehler: unknown[][] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => void fehler.push(a);
  try {
    return { wert: await fn(), fehler };
  } finally {
    console.error = original;
  }
}

const GRENZE = '----m3l';
const multipart = { 'Content-Type': `multipart/form-data; boundary=${GRENZE}` };
const bild = `--${GRENZE}\r\nContent-Disposition: form-data; name="files"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n${'x'.repeat(5000)}\r\n--${GRENZE}--\r\n`;
const upload = `/api/items/${item.id}/images`;

test('Kaputte Adresse und unbekannte Kodierung: 400 bzw. 415 statt 500, nichts im Fehlerprotokoll', async () => {
  const { wert, fehler } = await protokoll(async () => [
    await roh('GET', '/api/items/%E0%A4%A'),
    await roh('POST', '/api/orders', { 'Content-Type': 'application/json; charset=klingon' }, '{}'),
    await roh('POST', '/api/orders', { 'Content-Type': 'application/json', 'Content-Encoding': 'br2' }, '{}'),
  ]);
  assert.deepEqual(wert.map((r) => r.status), [400, 415, 415]);
  assert.equal(wert[0].json.error, 'Ungültige Anfrage.');
  assert.match(wert[1].json.error, /nicht unterstützt/);
  assert.deepEqual(fehler, [], 'kein Stacktrace im Protokoll');
});

test('Unvollständiger Upload (abgeschnitten, ohne Trennzeichen, kaputter Teil): 400 mit verständlichem Text', async () => {
  const { wert, fehler } = await protokoll(async () => [
    await roh('POST', upload, multipart, bild.slice(0, 300)),
    await roh('POST', upload, { 'Content-Type': 'multipart/form-data' }, bild),
    await roh('POST', upload, multipart, `--${GRENZE}\r\nkaputt\r\n\r\nxx\r\n--${GRENZE}--\r\n`),
  ]);
  for (const r of wert) {
    assert.equal(r.status, 400, JSON.stringify(r.json));
    assert.match(r.json.error, /Upload ist unvollständig angekommen/);
  }
  assert.deepEqual(fehler, []);
  assert.equal((await team.req('GET', `/api/items/${item.id}`)).json.images.length, item.images.length, 'kein Bild gespeichert');
});

test('Abgebrochene Anfrage (WLAN weg, Fenster geschlossen): kein „unerwarteter Serverfehler“ im Protokoll', async () => {
  const { fehler } = await protokoll(async () => {
    await roh('POST', upload, { ...multipart, 'Content-Length': String(bild.length) }, bild, 200);
    await roh('POST', '/api/orders', { 'Content-Type': 'application/json', 'Content-Length': '5000' }, `{"a":"${'x'.repeat(4000)}`, 200);
    await sleep(300);
  });
  assert.deepEqual(fehler, []);
});

test('Echte Serverfehler bleiben 500 und stehen im Protokoll', async () => {
  // Fehler im Speicher während einer Anfrage (hier: Tabelle fehlt) – nicht mit einem Fehler der Anfrage verwechseln.
  const db = srv.storage.sqlite.db;
  db.exec('ALTER TABLE vorschlag RENAME TO vorschlag_weg');
  try {
    const { wert, fehler } = await protokoll(() => admin.req('GET', '/api/proposals'));
    assert.equal(wert.status, 500);
    assert.equal(wert.json.error, 'Ein unerwarteter Serverfehler ist aufgetreten.');
    assert.equal(fehler.length, 1);
  } finally {
    db.exec('ALTER TABLE vorschlag_weg RENAME TO vorschlag');
  }
});
