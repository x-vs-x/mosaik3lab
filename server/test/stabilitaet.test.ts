// Stabilität vor 1.7.0: Katalog nach Update ohne Vorschaubilder, Speichergrenzen (Pi), dauerhaft gemerkte Fehlschläge,
// Export und Sicherung ohne verschwindende Dateien, schnelles Beenden, Komprimierung, Bildnamen nach PNG → JPG,
// abgebrochene Import-Vorschauen und Export-Downloads.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream, existsSync, type ReadStream } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { anmelden, form, sleep, startServer, storageAt, tmp } from './helfer';
import { verarbeite } from '../src/kern/bilder/verarbeitung';
import { speicherGrenzen } from '../src/kern/bilder/groessen';
import { BildDienst, Bildpflege, BildRechner, bildpflegeWartetAuf, SICHERUNG_MARKER, vorschauRel } from '../src/kern/bilder';
import { lockContent } from '../src/kern/lock';
import { zipStrom } from '../src/module/datenaustausch/datenaustausch.zip';

const srv = await startServer({ allowDemoAccounts: true, seedDemoData: true });
after(() => srv.stop());
const { anon, team, admin } = await anmelden(srv.base);
const ablage = path.join(srv.storageDir, 'ablage');
const vorschauDatei = (root: string, id: string, g: 'karte' | 'mini') => path.join(root, ...vorschauRel(g, id).split('/'));
const idVon = (name: string) => name.replace(/[.][a-z]+$/, '');

function rgba(breite: number, hoehe: number, rauschen = false) {
  const d = Buffer.alloc(breite * hoehe * 4);
  for (let i = 0; i < d.length; i += 4) {
    const x = (i / 4) % breite;
    d[i] = x < breite / 2 ? 230 : 20;
    d[i + 1] = rauschen ? (i * 7919) % 251 : 20;
    d[i + 2] = x < breite / 2 ? 20 : 230;
    d[i + 3] = 255;
  }
  return d;
}
const jpg = (b: number, h: number, q = 90, rauschen = false) => Buffer.from(jpeg.encode({ data: rgba(b, h, rauschen), width: b, height: h }, q).data);
function png(b: number, h: number, rauschen = false) {
  const p = new PNG({ width: b, height: h });
  p.data = rgba(b, h, rauschen);
  return PNG.sync.write(p);
}
const KAPUTT = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('kein echtes Bild '.repeat(50))]);

const items = (await team.req('GET', '/api/items?all=1')).json;
const itemId: string = items.find((i: { published: boolean }) => i.published).id;
const zweitesId: string = items.find((i: { id: string }) => i.id !== itemId).id;

/** Speicher ohne HTTP in einem eigenen Ordner, mit einem Druckteil „a1“. */
async function speicher(name: string) {
  const dir = await tmp(name);
  const { storage } = await storageAt(dir);
  storage.sqlite.db.prepare("INSERT INTO artikel (id, nummer, name, erstellt_am, geaendert_am) VALUES ('a1', 'T-1', 'Test', '2026-01-01', '2026-01-01')").run();
  const speichern = (buffer: Buffer, ext: string) => storage.files.save({ objekttyp: 'artikel', objektId: 'a1', rolle: 'bild', buffer, ext });
  const pflege = new Bildpflege(storage.files, storage.bilder, { pauseMs: 0, warteMs: 20, log: () => undefined, warn: () => undefined });
  const weg = async () => {
    await storage.close();
    await fs.rm(dir, { recursive: true, force: true });
  };
  return { dir, storage, speichern, pflege, weg };
}

// --- Fund 1: Katalog nach Update/Wiederherstellen -----------------------------------------------------------------------
test('Rechen-Thread belegt: sofort das Original (kurz zwischengespeichert), das Bild kommt in die Bildpflege', async () => {
  const r = await team.req('POST', `/api/items/${itemId}/images`, undefined, { form: form('klein.png', png(600, 400), 'image/png') });
  assert.equal(r.status, 201);
  const name: string = r.json.images.at(-1);
  for (const g of ['karte', 'mini'] as const) await fs.rm(vorschauDatei(ablage, idVon(name), g), { force: true });
  const rechner = srv.storage.bilder.rechner;
  Object.defineProperty(rechner, 'last', { get: () => 1, configurable: true }); // wie nach einem Update: viele Bilder in Arbeit
  try {
    const t0 = Date.now();
    const a = await anon.roh(`/api/files/images/${name}?groesse=karte`);
    await a.arrayBuffer();
    assert.equal(a.status, 200);
    assert.match(a.headers.get('content-type') ?? '', /image\/png/, 'Original statt Warten auf die Vorschau');
    assert.equal(a.headers.get('cache-control'), 'private, max-age=60', 'kurz zwischenspeichern, kein no-store');
    assert.ok(Date.now() - t0 < 1500, `ohne Warten (${Date.now() - t0} ms)`);
  } finally {
    delete (rechner as unknown as Record<string, unknown>).last;
  }
  await srv.storage.bildpflege.nachholen([]); // Ende des laufenden Bildpflege-Laufs
  assert.ok(existsSync(vorschauDatei(ablage, idVon(name), 'karte')), 'Bildpflege hat die Vorschau nachgeholt');
});

test('Bildpflege startet nach einer Minute statt nach fünf, wenn viele Vorschaubilder fehlen', async () => {
  const s = await speicher('bald');
  try {
    for (let i = 0; i < 12; i++) await s.speichern(jpg(40, 30), 'jpg');
    assert.equal(await s.pflege.fehlendeVorschau(), 12);
    await s.pflege.planeStart(300_000, 30);
    for (let i = 0; i < 200 && s.pflege.letzterBericht?.vorschau !== 24; i++) await sleep(25);
    assert.equal(s.pflege.letzterBericht?.vorschau, 24, 'Lauf schon gestartet');
  } finally {
    await s.pflege.beenden();
    await s.weg();
  }
});

// --- Fund 2: Speicher auf kleinem Pi, dauerhaft gemerkte Fehlschläge -----------------------------------------------------
test('Speichergrenzen nach Arbeitsspeicher; 16-Bit-Riesen-PNG wird vor dem Dekodieren abgelehnt', () => {
  assert.deepEqual(speicherGrenzen(1024 ** 3), { megapixel: 16, speicherMb: 256 }, '1 GB');
  assert.deepEqual(speicherGrenzen(1.85 * 1024 ** 3), { megapixel: 16, speicherMb: 256 }, '2 GB (gemeldet etwas weniger)');
  assert.deepEqual(speicherGrenzen(8 * 1024 ** 3), { megapixel: 40, speicherMb: 512 }, '8 GB');
  const riesig = Buffer.from(png(10, 10));
  riesig.writeUInt32BE(6000, 16);
  riesig.writeUInt32BE(6000, 20);
  riesig[24] = 16; // 16 Bit je Kanal: 36 MP brauchen entpackt weit über 512 MB
  assert.throws(() => verarbeite({ daten: riesig, original: true, vorschau: [] }), /zu groß/);
});

test('Gescheitertes Bild bleibt über den Neustart gemerkt; neuer Inhalt → neuer Versuch', async () => {
  const s = await speicher('gescheitert');
  let zweit: Awaited<ReturnType<typeof storageAt>> | undefined;
  try {
    const d = await s.speichern(KAPUTT, 'jpg');
    await assert.rejects(s.storage.bilder.verarbeite(d, 'sofort'));
    const merker = path.join(s.storage.files.root, 'vorschau', '.gescheitert', d.id);
    assert.equal(await fs.readFile(merker, 'utf8'), d.sha256);
    await s.storage.close();
    zweit = await storageAt(s.dir); // Neustart
    assert.equal(await zweit.storage.bilder.istGescheitert(d), true);
    const pflege = new Bildpflege(zweit.storage.files, zweit.storage.bilder, { pauseMs: 0, log: () => undefined, warn: () => undefined });
    await pflege.alle();
    assert.equal(pflege.letzterBericht?.fehler, 0, 'nicht erneut verarbeitet');
    assert.ok(existsSync(merker), 'Aufräumen lässt den Merker eines vorhandenen Bildes stehen');
    const neu = await zweit.storage.files.replace(d.id, jpg(100, 50), 'jpg');
    assert.equal(await zweit.storage.bilder.istGescheitert(neu), false);
    assert.ok(!existsSync(merker));
  } finally {
    await zweit?.storage.close();
    await fs.rm(s.dir, { recursive: true, force: true });
  }
});

// --- Fund 3: Export hält die Bildpflege an -----------------------------------------------------------------------------
test('Während eines Exports pausiert die Bildpflege (bis der Download fertig ist)', async () => {
  const gross = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), crypto.randomBytes(8 * 1024 * 1024)]); // „3MF“, nicht komprimierbar
  const m = await team.req('POST', `/api/items/${zweitesId}/models`, undefined, { form: form('gross.3mf', gross) });
  assert.equal(m.status, 201, JSON.stringify(m.json));
  const res = await admin.roh(`/api/admin/daten/export?artikel=${zweitesId}`);
  assert.equal(res.status, 200);
  assert.equal(bildpflegeWartetAuf(ablage), 'Austausch', 'Download läuft noch');
  assert.ok((await res.arrayBuffer()).byteLength > gross.length);
  for (let i = 0; i < 50 && bildpflegeWartetAuf(ablage); i++) await sleep(20);
  assert.equal(bildpflegeWartetAuf(ablage), null, 'nach dem Download wieder frei');
});

// --- Fund 4: Beenden wartet nicht aufs laufende Bild, Zwischendateien weg -----------------------------------------------
test('Beenden bricht das laufende Bild sofort ab; verwaiste *.neu-Dateien verschwinden beim Start', async () => {
  const dir = await tmp('beenden');
  const reste = [path.join(dir, 'ablage', 'artikel', 'a1', 'bild', 'x.jpg.abc123.neu'), path.join(dir, 'ablage', 'vorschau', 'karte-1080', 'y.jpg.def456.neu')];
  for (const f of reste) {
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, 'rest');
  }
  const { storage } = await storageAt(dir);
  const haengt = path.join(dir, 'haengt.mjs');
  await fs.writeFile(haengt, "import { parentPort } from 'node:worker_threads';\nparentPort.on('message', () => {});\n");
  const dienst = new BildDienst(storage.files, new BildRechner({ datei: new URL(`file:///${haengt.replace(/\\/g, '/')}`), zeitgrenzeMs: 20_000 }));
  const pflege = new Bildpflege(storage.files, dienst, { pauseMs: 0, log: () => undefined, warn: () => undefined });
  try {
    for (const f of reste) assert.ok(!existsSync(f), `${path.basename(f)} entfernt`);
    storage.sqlite.db.prepare("INSERT INTO artikel (id, nummer, name, erstellt_am, geaendert_am) VALUES ('a1', 'T-1', 'Test', '2026-01-01', '2026-01-01')").run();
    const d = await storage.files.save({ objekttyp: 'artikel', objektId: 'a1', rolle: 'bild', buffer: jpg(50, 50), ext: 'jpg' });
    const lauf = pflege.nachholen([d.id]);
    for (let i = 0; i < 100 && dienst.rechner.last === 0; i++) await sleep(10);
    assert.equal(dienst.rechner.last, 1, 'Bild in Arbeit');
    const t0 = Date.now();
    await pflege.beenden();
    await lauf;
    assert.ok(Date.now() - t0 < 3000, `beendet nach ${Date.now() - t0} ms statt nach der Zeitgrenze`);
    assert.equal(await dienst.istGescheitert(d), false, 'Abbruch beim Beenden zählt nicht als gescheitert');
  } finally {
    await pflege.beenden();
    await storage.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// --- Fund 6 und 7: nicht jedes Mal neu rechnen; während Sicherung keine Originale ersetzen ------------------------------
test('Verkleinern bringt < 20 %: Bild gilt danach als erledigt und wird nicht bei jedem Start neu berechnet', async () => {
  const s = await speicher('erledigt');
  try {
    const d = await s.speichern(jpg(2600, 1300, 10, true), 'jpg'); // verrauscht, schlechte Qualität: neu gespeichert wäre es größer
    await s.pflege.alle();
    assert.equal(s.pflege.letzterBericht?.verkleinert, 0);
    assert.equal(s.pflege.letzterBericht?.vorschau, 2);
    assert.equal(s.storage.files.find(d.id)?.sha256, d.sha256, 'Original bleibt');
    await s.pflege.alle();
    assert.equal(s.pflege.letzterBericht?.vorschau, 0, 'zweiter Lauf: nichts zu tun');
  } finally {
    await s.pflege.beenden();
    await s.weg();
  }
});

test('Während einer Sicherung: nur Vorschaubilder, kein Original ersetzt; danach holt die Bildpflege es nach. Alte Markierung zählt nicht', async () => {
  const s = await speicher('sicherung');
  const marker = path.join(s.storage.files.root, SICHERUNG_MARKER);
  try {
    const d = await s.speichern(jpg(2600, 1300), 'jpg');
    await fs.writeFile(marker, lockContent(process.ppid));
    const r = await s.storage.bilder.verarbeite(d, 'sofort');
    assert.equal(r.verkleinert, undefined, 'Original nicht ersetzt');
    assert.equal(r.vorschauNeu, 2);
    assert.equal(s.storage.files.find(d.id)?.sha256, d.sha256);
    assert.equal(await s.storage.bilder.erledigt(d), false, 'Verkleinern steht noch aus');
    // Markierung eines hängengebliebenen Prozesses (älter als 6 Stunden) zählt nicht
    const alt = new Date(Date.now() - 7 * 3600_000);
    await fs.utimes(marker, alt, alt);
    assert.equal(bildpflegeWartetAuf(s.storage.files.root), null);
    await fs.rm(marker);
    await s.pflege.nachholen([d.id]);
    assert.equal(s.pflege.letzterBericht?.verkleinert, 1, 'nach der Sicherung verkleinert');
  } finally {
    await fs.rm(marker, { force: true });
    await s.pflege.beenden();
    await s.weg();
  }
});

// --- Fund 10, 12, 13 -----------------------------------------------------------------------------------------------------
test('?groesse= nimmt nur karte und mini an (nicht constructor, __proto__, toString)', async () => {
  const name: string = (await team.req('GET', `/api/items/${itemId}`)).json.images[0];
  for (const g of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal((await anon.req('GET', `/api/files/images/${name}?groesse=${g}`)).status, 400, g);
  }
});

test('Ersetzen eines inzwischen gelöschten Bildes hinterlässt keine Datei', async () => {
  const s = await speicher('ersetzen');
  try {
    const d = await s.speichern(jpg(400, 300), 'jpg');
    const ersetzen = s.storage.files.replace(d.id, jpg(100, 50), 'jpg');
    s.storage.sqlite.db.prepare('DELETE FROM datei WHERE id = ?').run(d.id); // gelöscht, während die neue Datei entsteht
    await assert.rejects(ersetzen, /gelöscht/);
    assert.ok(!existsSync(s.storage.files.absPath(d)), 'keine Waise');
  } finally {
    await s.weg();
  }
});

test('Druckteil-Editor: Sortieren und Löschen klappen mit dem alten Namen nach PNG → JPG', async () => {
  const r = await team.req('POST', `/api/items/${zweitesId}/images`, undefined, { form: form('foto.png', png(3000, 1500, true), 'image/png') });
  assert.equal(r.status, 201);
  const name: string = r.json.images.at(-1);
  assert.match(name, /\.jpg$/);
  const alt = name.replace(/\.jpg$/, '.png');
  const bilder: string[] = r.json.images;
  const order = await team.req('PUT', `/api/items/${zweitesId}/images/order`, { images: [alt, ...bilder.filter((n) => n !== name)] });
  assert.equal(order.status, 200, JSON.stringify(order.json));
  assert.equal(order.json.images[0], name, 'aktueller Name');
  const weg = await team.req('DELETE', `/api/items/${zweitesId}/images/${alt}`);
  assert.equal(weg.status, 200, JSON.stringify(weg.json));
  assert.ok(!weg.json.images.includes(name));
});

// --- Fund 9 und 11: Import-Vorschauen, abgebrochener Export --------------------------------------------------------------
test('Höchstens eine wartende Import-Vorschau je Person: die ältere wird verworfen', async () => {
  const exp = await admin.roh(`/api/admin/daten/export?artikel=${itemId}`);
  const zip = Buffer.from(await exp.arrayBuffer());
  const hochladen = () => {
    const fd = new FormData();
    fd.append('datei', new Blob([zip]), 'paket.zip');
    return admin.req('POST', '/api/admin/daten/import/vorschau', undefined, { form: fd });
  };
  const erste = await hochladen();
  const zweite = await hochladen();
  assert.equal(erste.status, 200);
  assert.equal(zweite.status, 200);
  const dateien = await fs.readdir(path.join(srv.storageDir, 'import-tmp'));
  assert.equal(dateien.length, 1, 'nur die neueste Vorschau belegt Platz');
  assert.equal((await admin.req('POST', '/api/admin/daten/import/ausfuehren', { importId: erste.json.importId })).status, 404);
  assert.equal((await admin.req('DELETE', `/api/admin/daten/import/${zweite.json.importId}`)).status, 204);
});

test('Abgebrochener Export schließt die gerade gelesene Datei', async () => {
  const dir = await tmp('zip');
  const datei = path.join(dir, 'gross.bin');
  await fs.writeFile(datei, crypto.randomBytes(16 * 1024 * 1024));
  let strom: ReadStream | undefined;
  const out = zipStrom('{}', [{ pfad: 'bilder/abc.jpg', quelle: datei, groesse: 16 * 1024 * 1024 }], (d) => (strom = createReadStream(d, { highWaterMark: 16 * 1024 })));
  try {
    await new Promise<void>((r) => out.on('data', () => strom && r()));
    out.destroy();
    for (let i = 0; i < 50 && !strom!.destroyed; i++) await sleep(10);
    assert.equal(strom!.destroyed, true);
  } finally {
    strom?.destroy();
    await sleep(50);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// --- Fund 5: Komprimierung ------------------------------------------------------------------------------------------------
test('Komprimierung: API-JSON gzip; Bilder, Videos (Range) und Export unverändert', async () => {
  const gz = { 'Accept-Encoding': 'gzip' };
  const liste = await anon.roh('/api/items', gz);
  await liste.arrayBuffer();
  assert.equal(liste.headers.get('content-encoding'), 'gzip');
  assert.match(liste.headers.get('vary') ?? '', /Accept-Encoding/i);

  const name: string = (await team.req('GET', `/api/items/${itemId}`)).json.images[0];
  const bild = await anon.roh(`/api/files/images/${name}`, gz);
  await bild.arrayBuffer();
  assert.equal(bild.headers.get('content-encoding'), null);
  assert.ok(Number(bild.headers.get('content-length')) > 0);

  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(5000, 1)]);
  const fd = new FormData();
  fd.append('file', new Blob([mp4], { type: 'video/mp4' }), 'film.mp4');
  const v = await team.req('POST', `/api/items/${itemId}/videos`, undefined, { form: fd });
  assert.equal(v.status, 201, JSON.stringify(v.json));
  const datei: string = v.json.videos.at(-1).file;
  const teil = await anon.roh(`/api/files/videos/${datei}`, { ...gz, Range: 'bytes=0-99' });
  assert.equal(teil.status, 206);
  assert.equal(teil.headers.get('content-encoding'), null);
  assert.equal((await teil.arrayBuffer()).byteLength, 100);

  const exp = await admin.roh(`/api/admin/daten/export?artikel=${itemId}`, gz);
  await exp.arrayBuffer();
  assert.equal(exp.headers.get('content-encoding'), null);
});
