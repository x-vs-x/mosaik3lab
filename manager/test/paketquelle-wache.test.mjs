// Download der Updates: hängt die Verbindung (keine Antwort oder keine Daten mehr), bricht der Wächter mit klarer Meldung
// ab, statt bis zu 30 Minuten „wird heruntergeladen …“ zu zeigen. Ein normaler Download geht durch und wird geprüft.
// Berührt keine Dienste (nur Testordner unter _testdaten).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { downloadPaket } from '../lib/paketquelle.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '_testdaten', 'paketquelle-wache');
fs.mkdirSync(ROOT, { recursive: true });
const dir = fs.mkdtempSync(path.join(ROOT, 'run-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const inhalt = Buffer.from('Paketinhalt');
const sum = crypto.createHash('sha256').update(inhalt).digest('hex');
const v = { version: '9.9.9', asset: { name: 'Mosaik3LAB-Installer-9.9.9-test.zip', url: 'http://x/paket', size: inhalt.length }, sums: 'http://x/sums' };
const sums = () => new Response(`${sum}  ${v.asset.name}\n`);

test('Antwort bleibt aus → Abbruch mit verständlicher Meldung', async () => {
  const fetchImpl = (url, { signal }) =>
    url === v.sums ? Promise.resolve(sums()) : new Promise((_, rej) => signal.addEventListener('abort', () => rej(signal.reason)));
  await assert.rejects(downloadPaket(v, dir, { fetchImpl, stillMs: 200 }), (e) => e.friendly && /kommt nicht voran/.test(e.message));
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('Daten bleiben mittendrin aus → Abbruch, Teildatei entfernt', async () => {
  const fetchImpl = async (url) => {
    if (url === v.sums) return sums();
    const body = new ReadableStream({ start: (c) => c.enqueue(new Uint8Array([1, 2, 3])) }); // danach nichts mehr
    return new Response(body);
  };
  await assert.rejects(downloadPaket(v, dir, { fetchImpl, stillMs: 200 }), (e) => e.friendly && /kommt nicht voran/.test(e.message));
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('Normaler Download geht durch und wird geprüft', async () => {
  let fortschritt = 0;
  const fetchImpl = async (url) => (url === v.sums ? sums() : new Response(inhalt));
  const file = await downloadPaket(v, dir, { fetchImpl, stillMs: 200, onProgress: (d) => (fortschritt = d) });
  assert.equal(fs.readFileSync(file, 'utf8'), 'Paketinhalt');
  assert.equal(fortschritt, inhalt.length);
});
