// Bilder der Druckteile: Größen (Original ≤ 2000 px, karte 720, mini 240), Seitenverhältnis, EXIF-Drehung, Transparenz,
// Rechen-Thread (Zeitgrenze, Absturz), Hochladen mit fertigen Vorschaubildern, Abruf ?groesse=, Rechte, Aufräumen,
// Bildpflege (überspringt Erledigtes, übersteht kaputte Bilder, verkleinert große Originale, pausiert bei Import/Sicherung).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { anmelden, form, startServer, storageAt, tmp } from './helfer';
import { verarbeite, NichtUnterstuetzt } from '../src/kern/bilder/verarbeitung';
import { leseKopf } from '../src/kern/bilder/format';
import { BildRechner, importLaeuft, SICHERUNG_MARKER, vorschauRel } from '../src/kern/bilder';
import { lockContent } from '../src/kern/lock';

// Server zuerst starten (vor allen Tests), wie in den anderen Testdateien
const srv = await startServer({ allowDemoAccounts: true, seedDemoData: true });
after(() => srv.stop());
const { anon, team } = await anmelden(srv.base);

// --- Testbilder (echte JPEG/PNG, erzeugt mit denselben Bibliotheken) ---------------------------------------------------
/** Links rot, rechts blau (zum Prüfen der Drehung). */
function rgba(breite: number, hoehe: number, alpha?: (x: number, y: number) => number) {
  const d = Buffer.alloc(breite * hoehe * 4);
  for (let y = 0; y < hoehe; y++)
    for (let x = 0; x < breite; x++) {
      const i = (y * breite + x) * 4;
      const links = x < breite / 2;
      d[i] = links ? 230 : 20;
      d[i + 1] = 20;
      d[i + 2] = links ? 20 : 230;
      d[i + 3] = alpha ? alpha(x, y) : 255;
    }
  return d;
}
const jpg = (breite: number, hoehe: number) => jpeg.encode({ data: rgba(breite, hoehe), width: breite, height: hoehe }, 90).data;
function png(breite: number, hoehe: number, alpha?: (x: number, y: number) => number, rauschen = false) {
  const p = new PNG({ width: breite, height: hoehe });
  p.data = rgba(breite, hoehe, alpha);
  // Rauschen wie bei einem Foto: PNG wird groß, JPEG lohnt sich
  if (rauschen) for (let i = 0; i < p.data.length; i++) if (i % 4 !== 3) p.data[i] = (p.data[i] + ((i * 7919) % 61)) & 255;
  return PNG.sync.write(p);
}
/** JPEG mit EXIF-Ausrichtung (APP1 direkt nach SOI). */
function mitExif(bild: Buffer, orientierung: number) {
  const tiff = Buffer.from([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientierung, 0, 0, 0, 0, 0, 0, 0, 0]);
  const inhalt = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const kopf = Buffer.from([0xff, 0xe1, 0, 0]);
  kopf.writeUInt16BE(inhalt.length + 2, 2);
  return Buffer.concat([bild.subarray(0, 2), kopf, inhalt, bild.subarray(2)]);
}
const KAPUTT = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('kein echtes Bild '.repeat(50))]);
const masse = (b: Uint8Array) => {
  const k = leseKopf(b)!;
  return [k.breite, k.hoehe];
};
const pixel = (b: Uint8Array, x: number, y: number) => {
  const r = jpeg.decode(b, { useTArray: true });
  const i = (y * r.width + x) * 4;
  return [r.data[i], r.data[i + 1], r.data[i + 2]];
};
const VORSCHAU = [
  { name: 'karte', breite: 1080 },
  { name: 'mini', breite: 360 },
];

// --- Verarbeitung (ohne Server) ----------------------------------------------------------------------------------------
test('Größen: Original höchstens 2000 px, karte 1080 und mini 360 breit, Seitenverhältnis bleibt', () => {
  const e = verarbeite({ daten: jpg(3000, 2000), original: true, vorschau: VORSCHAU });
  assert.deepEqual([e.breite, e.hoehe], [3000, 2000]);
  assert.equal(e.original?.ext, 'jpg');
  assert.deepEqual(masse(e.original!.daten), [2000, 1333]);
  const [karte, mini] = e.vorschau;
  assert.deepEqual(masse(karte.daten), [1080, 720]);
  assert.deepEqual(masse(mini.daten), [360, 240]);
  // kleine Bilder werden nie vergrößert, das Original bleibt
  const klein = verarbeite({ daten: jpg(300, 200), original: true, vorschau: VORSCHAU });
  assert.equal(klein.original, undefined);
  assert.deepEqual(masse(klein.vorschau[0].daten), [300, 200]);
  assert.deepEqual(masse(klein.vorschau[1].daten), [300, 200]);
});

test('EXIF-Drehung (6 = 90° im Uhrzeigersinn): Vorschau und verkleinertes Original stehen richtig', () => {
  const e = verarbeite({ daten: mitExif(jpg(2400, 1200), 6), original: true, vorschau: VORSCHAU });
  assert.deepEqual([e.breite, e.hoehe], [1200, 2400], 'Maße wie angezeigt');
  assert.deepEqual(masse(e.original!.daten), [1000, 2000]);
  const karte = e.vorschau[0].daten;
  assert.deepEqual(masse(karte), [1000, 2000], 'nie größer als das verkleinerte Original');
  // gespeichert links rot / rechts blau → nach der Drehung oben rot, unten blau
  const oben = pixel(karte, 500, 100);
  const unten = pixel(karte, 500, 1900);
  assert.ok(oben[0] > 180 && oben[2] < 80, `oben rot: ${oben}`);
  assert.ok(unten[2] > 180 && unten[0] < 80, `unten blau: ${unten}`);
});

test('Transparenz: Vorschau ist JPEG auf Weiß, Original mit Transparenz bleibt PNG', () => {
  const daten = png(800, 400, (x) => (x < 400 ? 0 : 255)); // linke Hälfte durchsichtig
  const e = verarbeite({ daten, original: true, vorschau: VORSCHAU });
  assert.equal(e.original, undefined, 'klein genug: Original bleibt');
  const karte = e.vorschau[0].daten;
  assert.equal(leseKopf(karte)?.format, 'jpg');
  const links = pixel(karte, 50, 100);
  assert.ok(links.every((c) => c > 240), `durchsichtig → weiß: ${links}`);
  // zu groß und transparent → verkleinert, aber weiterhin PNG
  const gross = verarbeite({ daten: png(2600, 600, (x) => (x < 100 ? 0 : 255)), original: true, vorschau: [] });
  assert.equal(gross.original?.ext, 'png');
  assert.deepEqual(masse(gross.original!.daten), [2000, 462]);
});

test('Kaputte und nicht unterstützte Bilder werden klar abgelehnt', () => {
  assert.throws(() => verarbeite({ daten: Buffer.from('nichts'), original: true, vorschau: VORSCHAU }), NichtUnterstuetzt);
  assert.throws(() => verarbeite({ daten: KAPUTT, original: true, vorschau: VORSCHAU }));
  // Riesenbild: schon am Kopf abgelehnt, ohne Speicher zu belegen
  const riesig = Buffer.from(png(10, 10));
  riesig.writeUInt32BE(20000, 16);
  riesig.writeUInt32BE(20000, 20);
  assert.throws(() => verarbeite({ daten: riesig, original: true, vorschau: VORSCHAU }), /zu groß/);
});

// --- Rechen-Thread ------------------------------------------------------------------------------------------------------
test('Rechen-Thread: Zeitgrenze und Absturz beenden nur den Auftrag, danach geht es weiter', async () => {
  const r = new BildRechner({ zeitgrenzeMs: 1 });
  try {
    await assert.rejects(r.rechne({ daten: jpg(1500, 1000), original: true, vorschau: VORSCHAU }), /Zeitgrenze/);
    (r as unknown as { opts: { zeitgrenzeMs: number } }).opts.zeitgrenzeMs = 60_000;
    const e = await r.rechne({ daten: jpg(100, 50), original: true, vorschau: VORSCHAU });
    assert.equal(e.vorschau.length, 2, 'neuer Thread nach Zeitüberschreitung');
    await assert.rejects(r.rechne({ daten: KAPUTT, original: true, vorschau: VORSCHAU }));
  } finally {
    await r.beenden();
  }
  const dir = await tmp('worker');
  const datei = path.join(dir, 'kaputt.mjs');
  await fs.writeFile(datei, "throw new Error('Thread stürzt ab');");
  const kaputt = new BildRechner({ datei: new URL(`file:///${datei.replace(/\\/g, '/')}`) });
  await assert.rejects(kaputt.rechne({ daten: jpg(10, 10), original: true, vorschau: [] }), /Rechen-Thread/);
  await assert.rejects(kaputt.rechne({ daten: jpg(10, 10), original: true, vorschau: [] }), /Rechen-Thread/, 'App läuft weiter, nächster Versuch scheitert ebenso sauber');
  await kaputt.beenden();
  await fs.rm(dir, { recursive: true, force: true });
});

// --- Über die API -------------------------------------------------------------------------------------------------------
const ablage = path.join(srv.storageDir, 'ablage');
const vorschauDatei = (name: string, g: 'karte' | 'mini') => path.join(ablage, ...vorschauRel(g, name.replace(/\.[a-z]+$/, '')).split('/'));
const hole = (url: string) => fetch(srv.base + url);

let itemId: string;
test('Hochladen: großes Bild wird verkleinert, Vorschaubilder liegen sofort bereit; /api/health bleibt schnell', async () => {
  const items = (await team.req('GET', '/api/items?all=1')).json;
  itemId = items.find((i: { published: boolean }) => i.published).id;
  const hochladen = team.req('POST', `/api/items/${itemId}/images`, undefined, { form: form('gross.png', png(3000, 1500, undefined, true), 'image/png') });
  const t0 = Date.now();
  const health = await hole('/api/health');
  assert.equal(health.status, 200);
  assert.ok(Date.now() - t0 < 2000, `health antwortet während der Verarbeitung (${Date.now() - t0} ms)`);
  const r = await hochladen;
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const name: string = r.json.images.at(-1);
  assert.match(name, /\.jpg$/, 'PNG ohne Transparenz → JPG');
  const d = (await fs.readdir(ablage, { recursive: true })).map(String).find((p) => p.endsWith(name) && p.startsWith('artikel'))!;
  assert.deepEqual(masse(await fs.readFile(path.join(ablage, d))), [2000, 1000]);
  assert.deepEqual(masse(await fs.readFile(vorschauDatei(name, 'karte'))), [1080, 540]);
  assert.deepEqual(masse(await fs.readFile(vorschauDatei(name, 'mini'))), [360, 180]);

  const karte = await hole(`/api/files/images/${name}?groesse=karte`);
  assert.equal(karte.status, 200);
  assert.match(karte.headers.get('content-type') ?? '', /image\/jpeg/);
  assert.equal(Number(karte.headers.get('content-length')), (await fs.stat(vorschauDatei(name, 'karte'))).size);
  assert.equal((await hole(`/api/files/images/${name}?groesse=riesig`)).status, 400);
  // alter Name (vor dem Verkleinern PNG) wird über die ID weiter gefunden – offene Seiten zeigen das Bild weiter
  assert.equal((await hole(`/api/files/images/${name.replace(/\.jpg$/, '.png')}?groesse=mini`)).status, 200);
});

test('Hochladen: Transparenz bleibt PNG, kaputtes Bild wird trotzdem gespeichert (Original kommt beim Abruf)', async () => {
  const r = await team.req('POST', `/api/items/${itemId}/images`, undefined, { form: form('frei.png', png(500, 300, (x) => (x < 50 ? 0 : 255)), 'image/png') });
  assert.equal(r.status, 201);
  const name: string = r.json.images.at(-1);
  assert.match(name, /\.png$/);
  assert.ok(existsSync(vorschauDatei(name, 'karte')) && existsSync(vorschauDatei(name, 'mini')));

  const k = await team.req('POST', `/api/items/${itemId}/images`, undefined, { form: form('kaputt.jpg', KAPUTT, 'image/jpeg') });
  assert.equal(k.status, 201, 'Upload klappt trotz Fehler bei der Vorschau');
  const kaputt: string = k.json.images.at(-1);
  assert.ok(!existsSync(vorschauDatei(kaputt, 'karte')));
  const antwort = await hole(`/api/files/images/${kaputt}?groesse=karte`);
  assert.equal(antwort.status, 200);
  assert.equal(antwort.headers.get('cache-control'), 'no-store', 'Original als Ersatz, nicht zwischenspeichern');
  assert.equal(Number(antwort.headers.get('content-length')), KAPUTT.length);
});

test('Rechte wie beim Original: Vorschau eines Entwurfs nur für das Druck-Team', async () => {
  const items = (await team.req('GET', '/api/items?all=1')).json;
  const entwurf = items.find((i: { published: boolean }) => !i.published) ?? items[1];
  if (entwurf.published) await team.req('PATCH', `/api/items/${entwurf.id}/publish`, { published: false });
  const r = await team.req('POST', `/api/items/${entwurf.id}/images`, undefined, { form: form('e.jpg', jpg(400, 300), 'image/jpeg') });
  const name: string = r.json.images.at(-1);
  assert.equal((await anon.req('GET', `/api/files/images/${name}?groesse=karte`)).status, 404);
  assert.equal((await anon.req('GET', `/api/files/images/${name}?groesse=mini`)).status, 404);
  assert.equal((await team.req('GET', `/api/files/images/${name}?groesse=karte`)).status, 200);
});

test('Fehlendes Vorschaubild wird beim Abruf sofort berechnet', async () => {
  const items = (await team.req('GET', '/api/items?all=1')).json;
  const name: string = items.find((i: { id: string }) => i.id === itemId).images[0];
  await fs.rm(vorschauDatei(name, 'karte'), { force: true });
  await fs.rm(vorschauDatei(name, 'mini'), { force: true });
  const r = await hole(`/api/files/images/${name}?groesse=mini`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /image\/jpeg/);
  assert.ok(existsSync(vorschauDatei(name, 'mini')) && existsSync(vorschauDatei(name, 'karte')));
});

test('Löschen räumt die Vorschaubilder mit auf (Bild und ganzes Druckteil)', async () => {
  const item = (await team.req('GET', `/api/items/${itemId}`)).json;
  const [erstes, ...rest] = item.images as string[];
  assert.ok(existsSync(vorschauDatei(erstes, 'karte')));
  assert.equal((await team.req('DELETE', `/api/items/${itemId}/images/${erstes}`)).status, 200);
  assert.ok(!existsSync(vorschauDatei(erstes, 'karte')) && !existsSync(vorschauDatei(erstes, 'mini')));
  const mitVorschau = rest.filter((n) => existsSync(vorschauDatei(n, 'karte')));
  assert.ok(mitVorschau.length > 0);
  assert.equal((await team.req('DELETE', `/api/items/${itemId}`)).status, 200);
  for (const n of mitVorschau) assert.ok(!existsSync(vorschauDatei(n, 'karte')), `${n}: Vorschau gelöscht`);
});

// --- Speicher direkt: Ersetzen und Bildpflege ----------------------------------------------------------------------------
test('Ersetzen räumt veraltete Vorschaubilder auf; Bildpflege verkleinert, überspringt Erledigtes und übersteht kaputte Bilder', async () => {
  const dir = await tmp('bildpflege');
  const { storage } = await storageAt(dir);
  try {
    const db = storage.sqlite.db;
    db.prepare("INSERT INTO artikel (id, nummer, name, erstellt_am, geaendert_am) VALUES ('a1', 'T-1', 'Test', '2026-01-01', '2026-01-01')").run();
    const speichern = (buffer: Buffer, ext: string) => storage.files.save({ objekttyp: 'artikel', objektId: 'a1', rolle: 'bild', buffer, ext });
    const vorschau = (id: string, g: 'karte' | 'mini') => path.join(storage.files.root, ...vorschauRel(g, id).split('/'));

    // Ersetzen: Vorschaubilder des alten Inhalts verschwinden
    const ersatz = await speichern(jpg(400, 300), 'jpg');
    await storage.bilder.verarbeite(ersatz, 'sofort');
    assert.ok(existsSync(vorschau(ersatz.id, 'karte')));
    await storage.files.replace(ersatz.id, jpg(200, 100), 'jpg');
    assert.ok(!existsSync(vorschau(ersatz.id, 'karte')) && !existsSync(vorschau(ersatz.id, 'mini')));

    const gross = await speichern(jpg(2600, 1300), 'jpg');
    const kaputt = await speichern(KAPUTT, 'jpg');
    // Reste: veraltete Größe und Vorschaubild eines gelöschten Bildes
    await fs.mkdir(path.join(storage.files.root, 'vorschau', 'karte-720'), { recursive: true });
    await fs.writeFile(path.join(storage.files.root, 'vorschau', 'karte-720', `${gross.id}.jpg`), 'alt');
    await fs.mkdir(path.dirname(vorschau('weg', 'mini')), { recursive: true });
    await fs.writeFile(vorschau('weg', 'mini'), 'waise');

    const warnungen: string[] = [];
    const { Bildpflege } = await import('../src/kern/bilder');
    const pflege = new Bildpflege(storage.files, storage.bilder, { pauseMs: 0, warteMs: 20, log: () => undefined, warn: (t) => warnungen.push(t) });
    await pflege.alle();
    const b1 = pflege.letzterBericht!;
    assert.equal(b1.geprueft, 3);
    assert.equal(b1.verkleinert, 1, 'großes Original verkleinert');
    assert.equal(b1.vorschau, 4, 'je 2 Vorschaubilder für das ersetzte und das große Bild');
    assert.equal(b1.fehler, 1, 'kaputtes Bild übersprungen');
    assert.equal(b1.aufgeraeumt, 2);
    assert.match(warnungen[0], /übersprungen, Original bleibt/);
    assert.ok(!existsSync(path.join(storage.files.root, 'vorschau', 'karte-720')), 'veralteter Größen-Ordner gelöscht');
    assert.ok(!existsSync(vorschau('weg', 'mini')));
    const neu = storage.files.find(gross.id)!;
    assert.deepEqual(masse(await fs.readFile(storage.files.absPath(neu))), [2000, 1000]);
    assert.ok(neu.groesse < gross.groesse * 0.8);
    assert.ok(existsSync(storage.files.absPath(kaputt)), 'kaputtes Original bleibt');

    // zweiter Lauf: alles erledigt → nichts zu tun
    await pflege.alle();
    assert.deepEqual({ ...pflege.letzterBericht!, geprueft: 0 }, { geprueft: 0, verkleinert: 0, vorher: 0, nachher: 0, vorschau: 0, fehler: 0, aufgeraeumt: 0 });

    // pausiert während eines Imports und einer Sicherung des Server-Managers
    const spaet = await speichern(jpg(300, 200), 'jpg');
    const fertig = importLaeuft();
    let ende = false;
    const lauf = pflege.nachholen([spaet.id]).then(() => (ende = true));
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(ende, false, 'wartet auf den Import');
    assert.ok(!existsSync(vorschau(spaet.id, 'karte')));
    await fs.writeFile(path.join(storage.files.root, SICHERUNG_MARKER), lockContent(process.ppid));
    fertig();
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(ende, false, 'wartet auf die Sicherung');
    await fs.rm(path.join(storage.files.root, SICHERUNG_MARKER));
    await lauf;
    assert.ok(existsSync(vorschau(spaet.id, 'karte')));
    await pflege.beenden();
  } finally {
    await storage.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
