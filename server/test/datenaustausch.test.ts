// Druckteile exportieren/einspielen: Rechte, einer/mehrere/alle, Rundreise in leere Datenbank mit identischen Dateien (SHA-256),
// vorhandene überspringen oder ersetzen, Zuordnung über den Namen, Bezüge ergänzen, kaputte Dateien, Rückabwicklung, altes Format,
// ZIP (Format 2) samt Sicherheitsregeln, ähnliche Druckteile (anlegen, vormerken, später auflösen).
import { APP_VERSION } from '../src/kern/version';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createApp } from '../src/app';
import { hashPassword } from '../src/kern/auth/password';
import { loadConfig } from '../src/config';
import { newId } from '../src/kern/ids';
import { DEMO_USERS } from '../src/seed/demoData';
import { rechteFuer } from '@mosaik3lab/shared/konten';
import { leseKopf, pruefeDateien } from '../src/module/datenaustausch/datenaustausch.paket';
import { fuehreAus } from '../src/module/datenaustausch/datenaustausch.service';
import { alsJson, entpacke, packe } from './zippaket';

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'), Buffer.from('mosaik')]);
const PNG2 = Buffer.concat([PNG, Buffer.from('zwei')]);
const STL = Buffer.from('solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid test\n');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(40, 7)]);

async function start(opts: { demo: boolean }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-exim-'));
  const config = loadConfig({ storageDir: dir, rootDir: dir, logRequests: false, seedDemoData: opts.demo, clientDistDir: path.join(dir, 'none') });
  const instance = await createApp(config);
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    dir,
    config,
    storage: instance.storage,
    async stop() {
      await new Promise((r) => server.close(r));
      await instance.close();
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

class Client {
  private cookie = '';
  constructor(private base: string) {}
  async req(method: string, url: string, body?: unknown, form?: FormData) {
    const headers: Record<string, string> = { 'X-Requested-With': 'mosaik3lab' };
    if (this.cookie) headers.Cookie = this.cookie;
    let payload: FormData | string | undefined = form;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(this.base + url, { method, headers, body: payload });
    const c = res.headers.get('set-cookie');
    if (c) this.cookie = c.split(';')[0];
    const bytes = Buffer.from(await res.arrayBuffer());
    const text = bytes.toString('utf8');
    let json: any;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, json, text, body: bytes, headers: res.headers };
  }
  login(email: string, password: string) {
    return this.req('POST', '/api/auth/login', { email, password });
  }
  upload(url: string, content: Buffer | string, name = 'paket.zip') {
    const fd = new FormData();
    fd.append('datei', new Blob([content]), name);
    return this.req('POST', url, undefined, fd);
  }
}

const sourceSrv = await start({ demo: true });
const targetSrv = await start({ demo: false });
const admin = DEMO_USERS.find((u) => u.username === 'admin')!;
const team = DEMO_USERS.find((u) => u.username === 'druckteam')!;
const src = new Client(sourceSrv.base);
const srcTeam = new Client(sourceSrv.base);
const dst = new Client(targetSrv.base);

// Zielsystem: eigenes Admin-Konto (keine Demo-Daten)
await targetSrv.storage.users.create({
  id: newId(), username: 'zieladmin', email: 'ziel.admin@schule.example', displayName: 'Ziel Admin', role: 'admin',
  passwordHash: await hashPassword('Ziel-Admin-Passwort-1'), active: true, isDemo: false,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastLoginAt: null, teamBereiche: [], fehlversuche: 0,
});


await src.login(admin.email, admin.password);
await srcTeam.login(team.email, team.password);
assert.equal((await dst.login('ziel.admin@schule.example', 'Ziel-Admin-Passwort-1')).status, 200);

// Quelle: ein Artikel mit Bild, Druckdatei und Video
const cfg = (await src.req('GET', '/api/config')).json.masterData;
const created = await src.req('POST', '/api/items', {
  name: 'Export-Testteil', shortDescription: 'Ein Teil zum Testen des Exports', description: 'Beschreibung', categories: [cfg.categories[0].name],
  useAreas: [cfg.useAreas[0].name], colorAreas: [{ id: 'koerper', name: 'Körper', colors: [cfg.filaments[0].id, cfg.filaments[1].id] }],
  price: 'ca. 2 €', customFields: [{ id: 'name', label: 'Name', type: 'text', required: false, maxLength: 20, hint: '', options: [] }],
  sizes: ['M'], material: cfg.materials[0].name, materialInfo: '', printTimeMinutes: 30, safetyNotes: ['Aufsicht'], published: true,
});
assert.equal(created.status, 201, created.text);
const itemId = created.json.id as string;
const fileForm = (field: string, name: string, content: Buffer) => {
  const fd = new FormData();
  fd.append(field, new Blob([content]), name);
  return fd;
};
assert.equal((await src.req('POST', `/api/items/${itemId}/images`, undefined, fileForm('files', 'a.png', PNG))).status, 201);
assert.equal((await src.req('POST', `/api/items/${itemId}/images`, undefined, fileForm('files', 'b.png', PNG2))).status, 201);
assert.equal((await src.req('POST', `/api/items/${itemId}/models`, undefined, fileForm('files', 'teil.stl', STL))).status, 201);
const vf = fileForm('file', 'clip.mp4', MP4);
vf.append('title', 'Anleitung');
assert.equal((await src.req('POST', `/api/items/${itemId}/videos`, undefined, vf)).status, 201);
assert.equal((await src.req('POST', `/api/items/${itemId}/videos/link`, { title: 'Link', url: 'https://example.org/v' })).status, 201);

const sha = (storage: typeof sourceSrv.storage, id: string) =>
  storage.files
    .list('artikel', id)
    .map((d) => `${d.rolle}:${d.sha256}:${d.groesse}`)
    .sort();

let paketMit = Buffer.alloc(0);
let kopfMit: any;
let dateienMit = new Map<string, Buffer>();

const exportiere = (c: Client, ids?: string[]) => c.req('GET', `/api/admin/daten/export${ids ? `?artikel=${ids.join(',')}` : ''}`);
/** Frische Installation ohne Demo-Daten mit eigenem Admin (eigenes Import-Limit). */
async function frischesZiel() {
  const srv = await start({ demo: false });
  const c = new Client(srv.base);
  await srv.storage.users.create({
    id: newId(), username: 'frisch', email: 'frisch.admin@schule.example', displayName: 'Frisch', role: 'admin',
    passwordHash: await hashPassword('Frisch-Admin-Passwort-1'), active: true, isDemo: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastLoginAt: null, teamBereiche: [], fehlversuche: 0,
  });
  assert.equal((await c.login('frisch.admin@schule.example', 'Frisch-Admin-Passwort-1')).status, 200);
  return { srv, c };
}
const exportZip = async (c: Client, ids?: string[]) => {
  const r = await exportiere(c, ids);
  assert.equal(r.status, 200, r.text);
  return r.body;
};
const einspielen = async (c: Client, paket: Buffer | string, modus: 'ueberspringen' | 'ersetzen') => {
  const vor = await c.upload('/api/admin/daten/import/vorschau', paket);
  assert.equal(vor.status, 200, vor.text);
  const ok = await c.req('POST', '/api/admin/daten/import/ausfuehren', { importId: vor.json.importId, modus });
  assert.equal(ok.status, 200, ok.text);
  return { vorschau: vor.json, bericht: ok.json.bericht, sicherung: ok.json.sicherung as string };
};

test('Rechte: Administration und Druck-Team dürfen exportieren und einspielen, ohne Anmeldung nichts', async () => {
  const anon = new Client(sourceSrv.base);
  assert.equal((await anon.req('GET', '/api/admin/daten/export')).status, 401);
  assert.equal((await anon.upload('/api/admin/daten/import/vorschau', '{}')).status, 401);
  for (const c of [src, srcTeam]) {
    const rights = (await c.req('GET', '/api/auth/me')).json.permissions as string[];
    assert.ok(rights.includes('daten:export') && rights.includes('daten:import'));
  }
  assert.equal((await exportiere(srcTeam, [itemId])).status, 200);
  // Exportieren/Einspielen gehört zum Häkchen „Druckteile pflegen“; ohne es nicht, Lehrkräfte nie.
  assert.ok(rechteFuer('druckteam', ['team-druckteile']).includes('daten:import'));
  assert.ok(!rechteFuer('druckteam', ['team-anfragen', 'team-vorschlaege']).includes('daten:export'));
  assert.ok(!rechteFuer('lehrkraft', ['anfragen', 'vorschlaege', 'team-druckteile']).includes('daten:import'));
});

test('Export: einer, mehrere, alle – mit Dateien, nur gebrauchte Stammdaten, ohne Anfragen/Konten/Geheimnisse', async () => {
  const alle = (await src.req('GET', '/api/items?all=1')).json as any[];
  assert.ok(alle.length >= 3);
  // alle
  const res = await exportiere(src);
  assert.equal(res.status, 200, res.text);
  assert.match(res.headers.get('content-disposition') ?? '', /mosaik3lab-druckteile-\d{4}-\d{2}-\d{2}\.zip/);
  assert.equal(res.headers.get('content-type'), 'application/zip');
  paketMit = res.body;
  assert.deepEqual([...paketMit.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04], 'ZIP');
  const { kopf: j, dateien } = await entpacke(paketMit);
  kopfMit = j;
  dateienMit = dateien;
  assert.equal(j.format, 'mosaik3lab-stammdaten');
  assert.equal(j.version, 2);
  assert.ok(j.exportiertAm && j.schemaVersion >= 1);
  assert.equal(j.appVersion, APP_VERSION, 'Version aus kern/version.ts (wie /api/health)');
  assert.equal(j.mitDateien, true);
  assert.equal(j.auswahl, true);
  assert.equal(j.artikel.length, alle.length);
  assert.ok(dateien.size >= 4);
  // Jede beschriebene Datei liegt als echte Binärdatei unter ihrem Pfad (Ordner nach Rolle), Bytes wie in der Ablage.
  const metas = j.artikel.flatMap((a: any) => a.dateien);
  assert.equal(metas.length, dateien.size);
  for (const m of metas) {
    assert.match(m.pfad, /^(bilder|druckdateien|videos)\/[0-9a-f-]+\.(png|stl|mp4|jpg|webp)$/);
    const { createHash } = await import('node:crypto');
    assert.equal(createHash('sha256').update(dateien.get(m.pfad)!).digest('hex'), m.sha256, m.pfad);
  }
  const teilMeta = j.artikel.find((a: any) => a.id === itemId).dateien.find((d: any) => d.rolle === 'bild');
  assert.deepEqual(dateien.get(teilMeta.pfad), PNG, 'Bild unverändert und ohne Base64');
  assert.ok(j.artikel.every((a: any) => Array.isArray(a.aehnliche)), 'ähnliche Druckteile je Druckteil (auch leer)');
  assert.deepEqual(j.stammdaten.statusarten, []);
  const kategorien = new Set(alle.flatMap((i) => i.categories));
  assert.deepEqual(new Set(j.stammdaten.kategorien.map((k: any) => k.name)), kategorien, 'nur gebrauchte Kategorien');
  const lower = JSON.stringify(j).toLowerCase();
  for (const verboten of ['passwordhash', 'passwort_hash', 'requesteremail', 'abruf', 'smtp', DEMO_USERS[0].password.toLowerCase()]) {
    assert.ok(!lower.includes(verboten), `enthält nicht: ${verboten}`);
  }
  assert.ok(!('orders' in j) && !('benutzer' in j) && !('lehrkraefte' in j));

  // einer: Dateiname mit Nummer, nur seine Dateien und Stammdaten
  const eins = await exportiere(src, [itemId]);
  const nr = alle.find((i) => i.id === itemId).number;
  assert.match(eins.headers.get('content-disposition') ?? '', new RegExp(`mosaik3lab-druckteil-${nr}\\.zip`));
  const { kopf: je, dateien: dateienEins } = await entpacke(eins.body);
  assert.deepEqual(je.artikel.map((a: any) => a.id), [itemId]);
  assert.equal(dateienEins.size, 4);
  const teil = je.artikel[0];
  assert.deepEqual(je.stammdaten.kategorien.map((k: any) => k.name).sort(), [...teil.categories].sort());
  assert.deepEqual(je.stammdaten.materialien.map((m: any) => m.name), [teil.material]);
  assert.deepEqual(je.stammdaten.einsatzbereiche.map((e: any) => e.name).sort(), [...teil.useAreas].sort());
  assert.deepEqual(je.stammdaten.filamente.map((f: any) => f.id).sort(), [...new Set(teil.colorAreas.flatMap((a: any) => a.colors))].sort());

  // mehrere
  const zwei = [itemId, alle.find((i) => i.id !== itemId).id];
  const jm = (await entpacke(await exportZip(src, zwei))).kopf;
  assert.deepEqual(jm.artikel.map((a: any) => a.id).sort(), [...zwei].sort());

  // Fehler: leer, ungültig, unbekannt
  assert.equal((await src.req('GET', '/api/admin/daten/export?artikel=')).status, 400);
  assert.equal((await src.req('GET', '/api/admin/daten/export?artikel=../x')).status, 400);
  const weg = await exportiere(src, [itemId, newId()]);
  assert.equal(weg.status, 404);
  assert.match(weg.json.error, /gibt es nicht/);
});

test('Alle einspielen in leere Installation: gleiche Druckteile, identische Dateien, Bezüge angelegt, vorher gesichert', async () => {
  const vor = await dst.upload('/api/admin/daten/import/vorschau', paketMit);
  assert.equal(vor.status, 200, vor.text);
  const n = kopfMit.artikel.length;
  assert.equal(vor.json.kopf.artikel, n);
  assert.equal(vor.json.kopf.vorhanden, 0);
  // Vertrag ImportVorschau (shared/src/datenaustausch.ts): genau diese Felder, Bericht mit Verknüpfungen
  assert.deepEqual(Object.keys(vor.json).sort(), ['berichte', 'dateigroesse', 'gueltigBis', 'importId', 'kopf']);
  assert.deepEqual(Object.keys(vor.json.kopf).sort(), ['appVersion', 'artikel', 'dateien', 'exportiertAm', 'hinweise', 'mitDateien', 'version', 'vorhanden']);
  assert.ok(Date.parse(vor.json.gueltigBis) > Date.now());
  assert.deepEqual(Object.keys(vor.json.berichte.ersetzen.verknuepfungen).sort(), ['neu', 'wartend']);
  assert.equal(vor.json.berichte.ueberspringen.abschnitte.artikel.neu, n);
  assert.ok(vor.json.berichte.ueberspringen.abschnitte.dateien.neu >= 4);
  assert.equal((await dst.req('GET', '/api/items?all=1')).json.length, 0, 'Vorschau ändert nichts');
  const ok = await dst.req('POST', '/api/admin/daten/import/ausfuehren', { importId: vor.json.importId });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.bericht.modus, 'ueberspringen', 'Standard: überspringen');
  assert.ok(ok.json.sicherung.startsWith('mosaik3lab-vor-import-'));
  assert.ok(existsSync(path.join(targetSrv.dir, 'sicherungen', ok.json.sicherung)), 'Datenbank-Sicherung vorher');

  const a = (await src.req('GET', '/api/items?all=1')).json as any[];
  const b = (await dst.req('GET', '/api/items?all=1')).json as any[];
  const norm = (x: any) => ({ id: x.id, number: x.number, name: x.name, categories: x.categories, material: x.material, useAreas: x.useAreas, colorAreas: x.colorAreas, price: x.price, customFields: x.customFields.map((f: any) => f.label), sizes: x.sizes, safetyNotes: x.safetyNotes, published: x.published, printTimeMinutes: x.printTimeMinutes, links: x.videos.map((v: any) => v.url || (v.file ? 'datei' : '')) });
  const sortiert = (l: any[]) => [...l].sort((x, y) => x.id.localeCompare(y.id)).map(norm);
  assert.deepEqual(sortiert(b), sortiert(a));
  // Jede Kategorie, jedes Material und jede Farbe der Druckteile gibt es jetzt hier.
  const md = (await dst.req('GET', '/api/config')).json.masterData;
  for (const i of b) {
    for (const c of i.categories) assert.ok(md.categories.some((k: any) => k.name === c), c);
    assert.ok(md.materials.some((m: any) => m.name === i.material), i.material);
    for (const c of i.colorAreas.flatMap((x: any) => x.colors)) assert.ok(md.filaments.some((f: any) => f.id === c), c);
  }

  // Dateien: gleiche Prüfsummen, Bytes liegen wirklich in der Ablage
  assert.deepEqual(sha(targetSrv.storage, itemId), sha(sourceSrv.storage, itemId));
  assert.equal(sha(targetSrv.storage, itemId).length, 4);
  for (const d of targetSrv.storage.files.list('artikel', itemId)) {
    const buf = await fs.readFile(targetSrv.storage.files.absPath(d));
    const { createHash } = await import('node:crypto');
    assert.equal(createHash('sha256').update(buf).digest('hex'), d.sha256);
  }
  const img = (b.find((x) => x.id === itemId).images as string[])[0];
  const get = await fetch(`${targetSrv.base}/api/files/images/${img}`);
  assert.equal(get.status, 200);
  assert.deepEqual(Buffer.from(await get.arrayBuffer()), PNG);
  assert.ok(!existsSync(path.join(targetSrv.storage.files.root, '.import-tmp', vor.json.importId)), 'Temp-Bereich aufgeräumt');
});

test('Noch einmal einspielen: vorhandene werden übersprungen, nichts doppelt', async () => {
  const before = await dst.req('GET', '/api/items?all=1');
  const filesBefore = targetSrv.storage.files.listByTyp('artikel').length;
  const n = kopfMit.artikel.length;
  const { vorschau, bericht } = await einspielen(dst, paketMit, 'ueberspringen');
  assert.equal(vorschau.kopf.vorhanden, n);
  assert.equal(bericht.abschnitte.artikel.neu, 0);
  assert.equal(bericht.abschnitte.artikel.uebersprungen, n);
  assert.equal(bericht.abschnitte.kategorien.neu + bericht.abschnitte.filamente.neu + bericht.abschnitte.materialien.neu, 0);
  assert.deepEqual((await dst.req('GET', '/api/items?all=1')).json, before.json);
  assert.equal(targetSrv.storage.files.listByTyp('artikel').length, filesBefore);
  // „Ersetzen“ mit unverändertem Stand ändert ebenfalls nichts.
  const gleich = await einspielen(dst, paketMit, 'ersetzen');
  assert.equal(gleich.bericht.abschnitte.artikel.unveraendert, n);
  assert.equal(gleich.bericht.abschnitte.artikel.ersetzt, 0);
  assert.equal(targetSrv.storage.files.listByTyp('artikel').length, filesBefore);
});

test('Ersetzen: vorhandenes Druckteil bekommt Texte und Dateien aus der Datei, behält Nummer; neues mit belegter Nummer bekommt eine neue', async () => {
  // Quelle ändert Namen und Preis und löscht ein Bild; dazu ein neues Teil, dessen Nummer im Ziel schon vergeben ist.
  assert.equal((await src.req('PUT', `/api/items/${itemId}`, { ...created.json, name: 'Export-Testteil neu', price: '3 €', images: undefined })).status, 200);
  const quelle = (await src.req('GET', `/api/items/${itemId}`)).json;
  assert.ok((await src.req('DELETE', `/api/items/${itemId}/images/${quelle.images[1]}`)).status < 300);
  const fremd = await dst.req('POST', '/api/items', {
    name: 'Fremdes Teil im Ziel', shortDescription: 'Teil mit gleicher Nummer wie in der Datei', categories: [cfg.categories[0].name], useAreas: [], colorAreas: [{ id: 'a', name: 'Farbe', colors: [cfg.filaments[0].id] }],
    price: '', customFields: [], sizes: ['M'], material: cfg.materials[0].name, materialInfo: '', printTimeMinutes: 5, safetyNotes: [], published: false,
  });
  assert.equal(fremd.status, 201, fremd.text);
  const { kopf, dateien } = await entpacke(await exportZip(src, [itemId]));
  kopf.artikel.push({ ...kopf.artikel[0], id: newId(), number: fremd.json.number, name: 'Kopie mit Nummernkonflikt', dateien: [], videos: [] });
  const text = await packe(kopf, dateien);
  const nrZiel = (await dst.req('GET', `/api/items/${itemId}`)).json.number;

  const skip = await dst.upload('/api/admin/daten/import/vorschau', text);
  assert.equal(skip.json.kopf.vorhanden, 1);
  assert.equal(skip.json.berichte.ueberspringen.abschnitte.artikel.uebersprungen, 1);
  assert.equal(skip.json.berichte.ersetzen.abschnitte.artikel.ersetzt, 1);
  await dst.req('DELETE', `/api/admin/daten/import/${skip.json.importId}`);

  const { bericht } = await einspielen(dst, text, 'ersetzen');
  assert.equal(bericht.abschnitte.artikel.ersetzt, 1);
  assert.equal(bericht.abschnitte.artikel.neu, 1);
  const items = (await dst.req('GET', '/api/items?all=1')).json as any[];
  const t = items.find((i) => i.id === itemId);
  assert.equal(t.name, 'Export-Testteil neu');
  assert.equal(t.price, '3 €');
  assert.equal(t.number, nrZiel, 'Nummer bleibt');
  assert.deepEqual(sha(targetSrv.storage, itemId), sha(sourceSrv.storage, itemId), 'Dateien wie in der Quelle (ein Bild weniger)');
  assert.equal(sha(targetSrv.storage, itemId).length, 3);
  for (const d of targetSrv.storage.files.list('artikel', itemId)) assert.ok(existsSync(targetSrv.storage.files.absPath(d)), 'Datei da: ' + d.pfad);
  const k = items.find((i) => i.name === 'Kopie mit Nummernkonflikt');
  assert.ok(k.number && k.number !== fremd.json.number, 'neue Nummer statt Konflikt');
  assert.equal(new Set(items.map((i) => i.number)).size, items.length, 'Nummern eindeutig');
  assert.ok(bericht.details.some((d: any) => d.status === 'hinweis' && /Nummer/.test(d.text)));
  assert.ok(items.some((i) => i.id === fremd.json.id), 'nichts anderes gelöscht');
  // Ablage hat keine Waisen (ersetztes Bild entfernt)
  let onDisk = 0;
  const walk = async (d: string): Promise<void> => {
    for (const e of await fs.readdir(d, { withFileTypes: true })) e.isDirectory() ? await walk(path.join(d, e.name)) : onDisk++;
  };
  await walk(targetSrv.storage.files.root);
  assert.equal(onDisk, targetSrv.storage.files.listByTyp('artikel').length, 'Dateien auf der Platte = Datensätze');
});

test('Datei von einer anderen Installation: gleicher Name gilt als vorhanden; fehlende Bezüge werden angelegt, vorhandene nicht geändert', async () => {
  const repo = targetSrv.storage.settings;
  const s = repo.read();
  const { kopf } = await entpacke(await exportZip(src, [itemId]));
  const kat = s.masterData.categories.find((k) => k.name === kopf.artikel[0].category)!;
  kat.color = kat.color === 'rot' ? 'blau' : 'rot'; // abweichende Farbe hier muss bleiben
  repo.write(s);
  const vorher = (await dst.req('GET', '/api/config')).json.masterData;

  // Gleiches Teil mit fremder ID → „gibt es schon“ über den Namen.
  kopf.artikel[0] = { ...kopf.artikel[0], id: newId(), price: 'anderer Preis', dateien: [], videos: [] };
  // Ein zweites Teil mit neuer Kategorie, neuem Material und einer Farbe, die in der Datei fehlt.
  kopf.artikel.push({ ...kopf.artikel[0], id: newId(), number: '', name: 'Ganz neues Teil', categories: ['Neue Kategorie'], material: 'Neues Material', useAreas: ['Neuer Bereich'],
    colorAreas: [{ id: 'a', name: 'Farbe', colors: [kopf.artikel[0].colorAreas[0].colors[0], 'gibt-es-nicht'] }] });
  kopf.stammdaten.kategorien = [...kopf.stammdaten.kategorien, { id: newId(), name: 'Neue Kategorie', color: 'lila', icon: kat.icon }];
  // Neue Farbrolle (gibt es hier nicht) und eine vorhandene unter fremder ID mit anderer Verfügbarkeit (muss unverändert bleiben).
  const vorhFarbe = s.masterData.filaments[0];
  const gelb = { ...kopf.stammdaten.filamente[0], id: newId(), brand: 'Bambu', line: 'PLA Basic', colorName: 'Gelb', hex: '#FFD000', available: true, katalogId: null, herstellerNummer: '' };
  const fremdeId = { ...vorhFarbe, id: newId(), available: !vorhFarbe.available };
  // Bambu-Farben: ältere Datei nur mit Bambu-Nummer (alter Name) bzw. mit Katalog-ID einer hier vorhandenen Rolle.
  const nurNummer = { ...gelb, id: newId(), brand: 'Bambu Lab', line: 'ABS', colorName: 'Azur (alt)', hex: '#000001', herstellerNummer: '40601', katalogId: undefined };
  const perKatalog = { ...gelb, id: newId(), brand: 'Bambu Lab', colorName: 'Schwarz (alter Name)', hex: '#000002', katalogId: 'bambu-pla-basic-black' };
  kopf.stammdaten.filamente = [...kopf.stammdaten.filamente, gelb, fremdeId, nurNummer, perKatalog];
  kopf.artikel[1].colorAreas.push({ id: 'b', name: 'Griff', colors: [gelb.id, fremdeId.id, nurNummer.id, perKatalog.id] });
  // Kategorie in anderer Schreibweise → die vorhandene wird benutzt, nicht neu angelegt.
  kopf.artikel.push({ ...kopf.artikel[1], id: newId(), name: 'Teil mit Kategorie in Großbuchstaben', categories: [kat.name.toUpperCase()], colorAreas: [{ id: 'a', name: 'Farbe', colors: [gelb.id] }] });
  // Nichts zu retten: keine seiner Farben ist beschrieben.
  kopf.artikel.push({ ...kopf.artikel[1], id: newId(), name: 'Teil ohne beschriebene Farbe', colorAreas: [{ id: 'a', name: 'Farbe', colors: ['unbekannt-1'] }] });
  const text = await packe(kopf);
  const vor = await dst.upload('/api/admin/daten/import/vorschau', text);
  assert.equal(vor.status, 200, vor.text);
  assert.equal(vor.json.kopf.vorhanden, 1);
  const neuIn = vor.json.berichte.ueberspringen.details.filter((d: any) => d.status === 'neu' && d.bereich !== 'Druckteil').map((d: any) => `${d.bereich} „${d.name}“`);
  assert.ok(neuIn.includes('Kategorie „Neue Kategorie“'), neuIn.join(', '));
  assert.ok(neuIn.includes('Farbrolle „Gelb (Bambu PLA Basic)“'), 'Vorschau nennt die neue Farbrolle: ' + neuIn.join(', '));
  assert.equal(neuIn.filter((x: string) => x.startsWith('Kategorie')).length, 1, 'Großschreibung legt keine zweite Kategorie an');
  assert.ok(!neuIn.some((x: string) => x.includes(vorhFarbe.colorName)), 'vorhandene Farbrolle wird nicht neu angelegt');
  const grund = vor.json.berichte.ueberspringen.details.find((d: any) => d.status === 'uebersprungen' && /ohne beschriebene Farbe/.test(d.name));
  assert.match(grund?.text ?? '', /keine seiner Farben/, 'klarer Grund in der Vorschau');
  await dst.req('DELETE', `/api/admin/daten/import/${vor.json.importId}`);
  const { bericht } = await einspielen(dst, text, 'ueberspringen');
  assert.equal(bericht.abschnitte.artikel.uebersprungen, 2, 'vorhandenes + nicht zu rettendes');
  assert.equal(bericht.abschnitte.artikel.neu, 2);
  assert.equal(bericht.abschnitte.filamente.neu, 2, 'Gelb + Azure aus dem Katalog');
  const mdNach = (await dst.req('GET', '/api/config')).json.masterData;
  assert.deepEqual(mdNach.filaments.find((f: any) => f.id === vorhFarbe.id), vorher.filaments.find((f: any) => f.id === vorhFarbe.id), 'vorhandene Farbrolle unverändert');
  const neuesTeil = ((await dst.req('GET', '/api/items?all=1')).json as any[]).find((i) => i.name === 'Ganz neues Teil');
  const griff = neuesTeil.colorAreas.find((a: any) => a.name === 'Griff').colors;
  assert.ok(griff.includes(vorhFarbe.id), 'fremde ID auf vorhandene Farbrolle umgeschrieben');
  assert.ok(griff.includes('bambu-pla-basic-black'), 'Katalog-ID → vorhandene Bambu-Rolle');
  const azure = mdNach.filaments.find((f: any) => f.herstellerNummer === '40601');
  assert.equal(azure?.katalogId, 'bambu-abs-azure', 'Bambu-Nummer → Katalogfarbe mit Katalog-Daten');
  assert.notEqual(azure?.colorName, 'Azur (alt)');
  assert.ok(griff.includes(azure.id));
  assert.equal(bericht.abschnitte.kategorien.neu, 1);
  assert.equal(bericht.abschnitte.materialien.neu, 1);
  assert.equal(bericht.abschnitte.einsatzbereiche.neu, 1);
  assert.ok(bericht.details.some((d: any) => d.status === 'hinweis' && /Farbe/.test(d.text ?? '')), 'fehlende Farbe nicht still');
  const md = (await dst.req('GET', '/api/config')).json.masterData;
  assert.deepEqual(md.categories.find((k: any) => k.name === kat.name), vorher.categories.find((k: any) => k.name === kat.name), 'vorhandene Kategorie unverändert');
  assert.equal(md.categories.find((k: any) => k.name === 'Neue Kategorie').color, 'lila', 'Kategorie samt Farbe aus der Datei');
  assert.ok(md.materials.some((m: any) => m.name === 'Neues Material'));
  assert.ok(md.useAreas.some((u: any) => u.name === 'Neuer Bereich'));
  assert.equal(md.orderStatuses.length, vorher.orderStatuses.length);
  const items = (await dst.req('GET', '/api/items?all=1')).json as any[];
  assert.equal(items.filter((i) => i.name === 'Export-Testteil neu').length, 1, 'nicht doppelt angelegt');
  assert.notEqual(items.find((i) => i.id === itemId).price, 'anderer Preis', 'übersprungen = unverändert');
  // Ersetzen über den Namen: das vorhandene Teil (ID hier) wird aktualisiert, Dateien bleiben (Datei ohne Dateien).
  const filesBefore = sha(targetSrv.storage, itemId);
  kopf.artikel = [kopf.artikel[0]];
  kopf.mitDateien = false;
  const r = await einspielen(dst, await packe(kopf), 'ersetzen');
  assert.equal(r.bericht.abschnitte.artikel.ersetzt, 1);
  assert.equal((await dst.req('GET', `/api/items/${itemId}`)).json.price, 'anderer Preis');
  assert.deepEqual(sha(targetSrv.storage, itemId), filesBefore, 'ohne Dateien in der Datei bleiben vorhandene');
});

test('Kaputte, abgeschnittene und fremde Dateien werden abgelehnt – nichts wird verändert', async () => {
  const { srv, c } = await frischesZiel(); // eigene Instanz: eigenes Import-Limit
  after(() => srv.stop());
  const kopie = () => ({ kopf: structuredClone(kopfMit), dateien: new Map(dateienMit) });
  const ablehnen = async (inhalt: Buffer | string, muster: RegExp) => {
    const r = await c.upload('/api/admin/daten/import/vorschau', inhalt);
    assert.equal(r.status, 400, r.text);
    assert.match(r.json.error, muster);
  };
  // 1) Inhalt einer Datei verändert (SHA bleibt) – im ZIP und in der älteren JSON-Datei
  {
    const { kopf, dateien } = kopie();
    const [pfad, buf] = [...dateien][0];
    const anders = Buffer.from(buf);
    anders[anders.length - 1] ^= 0xff;
    dateien.set(pfad, anders);
    await ablehnen(await packe(kopf, dateien), /Prüfsumme/);
    await ablehnen(alsJson(kopf, dateien), /Prüfsumme/);
  }
  // 2) SHA im Kopf verändert
  const { kopf: j } = kopie();
  j.artikel.find((a: any) => a.dateien.length).dateien[0].sha256 = 'f'.repeat(64);
  await ablehnen(await packe(j, dateienMit), /Prüfsumme/);
  await ablehnen(alsJson(j, dateienMit), /Prüfsumme/);
  // 3) abgeschnitten (abgebrochener Download)
  await ablehnen(paketMit.subarray(0, Math.floor(paketMit.length / 2)), /unvollständig|beschädigt/);
  const json = alsJson(kopfMit, dateienMit);
  await ablehnen(json.slice(0, Math.floor(json.length / 2)), /unvollständig|beschädigt/);
  // 4) keine Export-Datei / falsches Format / neuere Version
  await ablehnen('hallo', /keine Export-Datei/);
  await ablehnen(await packe({ format: 'anders' }), /Format unbekannt/);
  await ablehnen(await packe({ ...kopfMit, version: 99 }), /neueren Mosaik³LAB-Version/);
  // 5) Bild, das keines ist (richtige Prüfsumme, falscher Inhalt)
  const { createHash } = await import('node:crypto');
  const fake = Buffer.from('das ist kein bild');
  const { kopf: jj } = kopie();
  const art = jj.artikel.find((a: any) => a.dateien.length);
  const fid = newId();
  art.dateien = [{ ...art.dateien[0], id: fid, rolle: 'bild', originalname: 'x.png', groesse: fake.length, sha256: createHash('sha256').update(fake).digest('hex'), pfad: `bilder/${fid}.png` }];
  art.videos = [];
  const nurFake = new Map([[`bilder/${fid}.png`, fake]]);
  for (const a of jj.artikel) if (a !== art) for (const d of a.dateien) nurFake.set(d.pfad, dateienMit.get(d.pfad)!);
  await ablehnen(await packe(jj, nurFake), /Bild/);
  // 6) Video-Link mit javascript: (wäre im Katalog ein anklickbarer Link)
  const { kopf: jl } = kopie();
  jl.artikel[0].videos = [{ id: newId(), title: 'Böse', url: 'javascript:alert(1)', dateiId: '', uploadedAt: '' }];
  await ablehnen(await packe(jl, dateienMit), /http/);
  assert.equal(await srv.storage.items.count(), 0, 'nichts eingespielt');
  assert.ok(!existsSync(path.join(srv.dir, 'import-tmp')) || (await fs.readdir(path.join(srv.dir, 'import-tmp'))).length === 0, 'hochgeladene Dateien entfernt');
});

test('ZIP-Sicherheit: Zip-Slip, unerwartete und fehlende Einträge, Zip-Bombe, falscher Ordner – abgelehnt, nichts verändert', async () => {
  const { srv, c } = await frischesZiel(); // eigene Instanz: eigenes Import-Limit
  after(() => srv.stop());
  const ablehnen = async (inhalt: Buffer, muster: RegExp, wozu: string) => {
    const r = await c.upload('/api/admin/daten/import/vorschau', inhalt);
    assert.equal(r.status, 400, `${wozu}: ${r.text}`);
    assert.match(r.json.error, muster, wozu);
  };
  /** Namen im fertigen ZIP austauschen (gleiche Länge) – yazl selbst schreibt keine unzulässigen Namen. */
  const tausche = (zip: Buffer, von: string, nach: string) => {
    assert.equal(von.length, nach.length);
    const out = Buffer.from(zip);
    for (let i = out.indexOf(von); i >= 0; i = out.indexOf(von, i + 1)) out.write(nach, i, 'latin1');
    return out;
  };
  const boese = Buffer.from('boese');
  // Zip-Slip: „..“, absoluter Pfad, Laufwerk, Backslash
  for (const [platzhalter, name] of [['xx/xx/boese.txt', '../../boese.txt'], ['xtmp/boese.txt', '/tmp/boese.txt'], ['Cx/boese.txt', 'C:/boese.txt'], ['bilderxxxxboese', 'bilder\\..\\boese']] as const) {
    await ablehnen(tausche(await packe(kopfMit, dateienMit, [{ name: platzhalter, daten: boese }]), platzhalter, name), /unzulässigen Pfad|unerwarteten Eintrag/, name);
  }
  // Unerwartete Einträge (auch eine Datei, die im Kopf nicht beschrieben ist)
  await ablehnen(await packe(kopfMit, dateienMit, [{ name: 'LIESMICH.txt', daten: boese }]), /unerwarteten Eintrag/, 'LIESMICH');
  await ablehnen(await packe(kopfMit, dateienMit, [{ name: `bilder/${newId()}.png`, daten: PNG }]), /unerwarteten Eintrag/, 'nicht beschriebenes Bild');
  // Fehlender Eintrag
  const ohneEine = new Map(dateienMit);
  ohneEine.delete([...ohneEine.keys()][0]);
  await ablehnen(await packe(kopfMit, ohneEine), /fehlt im Paket/, 'fehlender Eintrag');
  // paket.json fehlt
  await ablehnen(tausche(await packe(kopfMit, dateienMit), 'paket.json', 'paket.jsox'), /unerwarteten Eintrag|paket\.json fehlt/, 'ohne paket.json');
  // Zip-Bombe: 60 MB Nullen, gepackt nur wenige KB, als „Bild“ beschrieben → abgelehnt, bevor entpackt wird
  const { createHash } = await import('node:crypto');
  const bombe = Buffer.alloc(60 * 1024 * 1024);
  const k = structuredClone(kopfMit);
  const teil = k.artikel.find((a: any) => a.id === itemId);
  const bid = newId();
  teil.dateien.push({ ...teil.dateien.find((d: any) => d.rolle === 'bild'), id: bid, groesse: bombe.length, sha256: createHash('sha256').update(bombe).digest('hex'), pfad: `bilder/${bid}.png` });
  const mitBombe = await packe(k, new Map([...dateienMit, [`bilder/${bid}.png`, bombe]]));
  assert.ok(mitBombe.length < paketMit.length + 1024 * 1024, 'stark gepackt');
  await ablehnen(mitBombe, /zu groß/, 'Zip-Bombe');
  // Pfad passt nicht zur Rolle (Bild im Ordner „videos“)
  const f = structuredClone(kopfMit);
  const bild = f.artikel.find((a: any) => a.id === itemId).dateien.find((d: any) => d.rolle === 'bild');
  const neu = new Map(dateienMit);
  neu.set(`videos/${bild.id}.png`, neu.get(bild.pfad)!);
  neu.delete(bild.pfad);
  bild.pfad = `videos/${bild.id}.png`;
  await ablehnen(await packe(f, neu), /Pfad passt nicht/, 'falscher Ordner');
  assert.equal(await srv.storage.items.count(), 0, 'nichts eingespielt');
  assert.ok(!existsSync(path.join(srv.dir, '..', 'boese.txt')) && !existsSync(path.join(srv.storage.files.root, 'boese.txt')), 'nichts außerhalb geschrieben');
});

test('Fehler mitten im Einspielen: Datenbank und Ablage bleiben unverändert (alles oder nichts)', async () => {
  // Leeres Ziel, absichtlich leerer Temp-Ordner → Verschieben der Dateien scheitert.
  const frisch = await start({ demo: false });
  try {
    const paketDatei = path.join(frisch.dir, 'paket.zip');
    await fs.writeFile(paketDatei, paketMit);
    const paket = await leseKopf(paketDatei);
    const infos = await pruefeDateien(paketDatei, paket);
    const leerTmp = path.join(frisch.dir, 'leer-tmp');
    await fs.mkdir(leerTmp, { recursive: true });
    const vorher = await frisch.storage.settings.get();
    await assert.rejects(fuehreAus(frisch.storage, paket, 'ueberspringen', infos, leerTmp));
    assert.equal(await frisch.storage.items.count(), 0, 'Druckteile zurückgerollt');
    assert.equal(frisch.storage.files.listByTyp('artikel').length, 0, 'Dateidatensätze zurückgerollt');
    assert.deepEqual((await frisch.storage.settings.get()).masterData, vorher.masterData, 'Stammdaten zurückgerollt');
    assert.ok(!existsSync(path.join(frisch.storage.files.root, 'artikel')), 'keine Dateien in der Ablage');
  } finally {
    await frisch.stop();
  }
});

test('Vorschau gehört dem Anfragenden und verfällt nach Abbruch', async () => {
  const vor = await dst.upload('/api/admin/daten/import/vorschau', paketMit);
  assert.equal(vor.status, 200);
  await dst.req('DELETE', `/api/admin/daten/import/${vor.json.importId}`);
  const weg = await dst.req('POST', '/api/admin/daten/import/ausfuehren', { importId: vor.json.importId, modus: 'ueberspringen' });
  assert.equal(weg.status, 404);
  assert.match(weg.json.error, /abgelaufen/);
  assert.equal((await dst.req('POST', '/api/admin/daten/import/ausfuehren', { importId: 'kaputt', modus: 'ueberspringen' })).status, 400);
  assert.equal((await dst.req('POST', '/api/admin/daten/import/ausfuehren', { importId: 'a'.repeat(32), modus: 'alles-loeschen' })).status, 400);
});

test('Altes Format (vollständiger Export mit allen Stammdaten und Anfragestatus, auch ohne Dateien) wird gelesen', async () => {
  const frisch = await start({ demo: false });
  try {
    const c = new Client(frisch.base);
    await frisch.storage.users.create({
      id: newId(), username: 'alt', email: 'alt.admin@schule.example', displayName: 'Alt', role: 'admin',
      passwordHash: await hashPassword('Alt-Admin-Passwort-1'), active: true, isDemo: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastLoginAt: null, teamBereiche: [], fehlversuche: 0,
    });
    assert.equal((await c.login('alt.admin@schule.example', 'Alt-Admin-Passwort-1')).status, 200);
    // So sahen Exporte bisher aus: kein „auswahl“, alle Stammdaten, Anfragestatus dabei.
    const ms = (await src.req('GET', '/api/config')).json.masterData;
    const kopf = structuredClone(kopfMit);
    delete kopf.auswahl;
    kopf.stammdaten = {
      kategorien: [...ms.categories, { id: newId(), name: 'Ungenutzt im alten Export', color: 'grau', icon: ms.categories[0].icon }],
      einsatzbereiche: ms.useAreas,
      materialien: ms.materials,
      filamente: ms.filaments,
      statusarten: ms.orderStatuses.map((s: any) => ({ id: s.id, aktiv: !s.active || s.id === 'offen' })),
    };
    const statusVorher = (await c.req('GET', '/api/config')).json.masterData.orderStatuses;
    const { bericht } = await einspielen(c, alsJson(kopf, dateienMit), 'ueberspringen');
    assert.equal(bericht.abschnitte.artikel.neu, kopf.artikel.length);
    const md = (await c.req('GET', '/api/config')).json.masterData;
    assert.ok(!md.categories.some((k: any) => k.name === 'Ungenutzt im alten Export'), 'nur gebrauchte Stammdaten');
    assert.deepEqual(md.orderStatuses, statusVorher, 'Anfragestatus unverändert');
    const dateienAlt = sha(frisch.storage, itemId);
    assert.equal(dateienAlt.length, 4, 'Bilder, Druckdatei und Video aus dem alten Export');
    // alter Export „ohne Dateien“: Druckteile kommen, vorhandene Dateien bleiben
    const ohne = { ...kopf, mitDateien: false, artikel: kopf.artikel.map((a: any) => ({ ...a, dateien: [], videos: a.videos.filter((v: any) => !v.dateiId) })) };
    const r = await einspielen(c, alsJson(ohne, new Map()), 'ersetzen');
    assert.equal(r.bericht.abschnitte.artikel.neu, 0);
    assert.deepEqual(sha(frisch.storage, itemId), dateienAlt);
  } finally {
    await frisch.stop();
  }
});

test('Rundreise in eine frische Installation: jede Angabe eines Druckteils und jede neue Stammdate kommt an (Art, Felder, Gruppen, eigene Farbrolle)', async () => {
  // Quelle: eigene Farbrolle mit allen Angaben, neue Kategorie mit Farbe/Symbol, neues Material, neuer Einsatzbereich.
  const md0 = (await src.req('GET', '/api/config')).json.masterData;
  const fil = await src.req('PUT', '/api/admin/settings/masterdata/filaments', {
    entries: [...md0.filaments, { brand: 'Rundreise', line: 'PLA Glanz', colorName: 'Türkis', hex: '#00b1b7', herstellerNummer: 'RR-7', available: false }],
  });
  assert.equal(fil.status, 200, fil.text);
  const eigen = fil.json.filaments.find((f: any) => f.brand === 'Rundreise');
  for (const [liste, eintrag] of [['categories', { name: 'Rundreise-Kategorie', color: 'lila', icon: 'musik' }], ['materials', { name: 'Rundreise-Material' }], ['useAreas', { name: 'Rundreise-Bereich' }]] as const) {
    const r = await src.req('PUT', `/api/admin/settings/masterdata/${liste}`, { entries: [...md0[liste], eintrag] });
    assert.equal(r.status, 200, r.text);
  }
  const bambu = md0.filaments.find((f: any) => f.katalogId);
  const body = {
    name: 'Rundreise-Teil', shortDescription: 'Prüft, dass alles ankommt', description: 'Lange Beschreibung', categories: ['Rundreise-Kategorie'], kind: 'lehrmittel',
    useAreas: ['Rundreise-Bereich'],
    colorAreas: [
      { id: 'grund', name: 'Grundplatte', alleFarben: true, colors: [] },
      { id: 'griff', name: 'Griff', colors: [bambu.id], gruppen: ['linie:Rundreise PLA Glanz'] },
      { id: 'deckel', name: 'Deckel', colors: [], gruppen: ['art:PLA'] },
    ],
    price: 'ca. 1 €', sizes: [],
    customFields: [
      { id: 'text', label: 'Beschriftung', type: 'text', required: true, maxLength: 12, hint: 'max. 12 Zeichen', options: [] },
      { id: 'wahl', label: 'Form', type: 'select', required: false, maxLength: 60, hint: '', options: ['rund', 'eckig'] },
      { id: 'zahl', label: 'Anzahl', type: 'number', required: false, maxLength: 3, hint: '', options: [] },
    ],
    material: 'Rundreise-Material', materialInfo: 'nicht spülmaschinenfest', printTimeMinutes: 95, safetyNotes: ['Kleinteile', 'Aufsicht'], published: false,
    links: [
      { id: 'taster', text: 'Taster-Beispiel', beschreibung: 'Passt in die Halterung', url: 'https://shop.example.org/taster?farbe=rot' },
      { id: '', text: 'Bestellliste', beschreibung: '', url: 'http://schule.example.org/liste' },
    ],
  };
  const neu = await src.req('POST', '/api/items', body);
  assert.equal(neu.status, 201, neu.text);
  const quelle = (await src.req('GET', `/api/items/${neu.json.id}`)).json;

  // Ziel: frische Installation ohne Stammdaten (eigene Instanz, eigenes Import-Limit).
  const schule = await start({ demo: false });
  try {
    const sc = new Client(schule.base);
    await schule.storage.users.create({
      id: newId(), username: 'schule', email: 'schule.admin@schule.example', displayName: 'Schule', role: 'admin',
      passwordHash: await hashPassword('Schule-Admin-Passwort-1'), active: true, isDemo: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastLoginAt: null, teamBereiche: [], fehlversuche: 0,
    });
    assert.equal((await sc.login('schule.admin@schule.example', 'Schule-Admin-Passwort-1')).status, 200);

    const { bericht } = await einspielen(sc, await exportZip(src, [quelle.id]), 'ueberspringen');
    assert.equal(bericht.abschnitte.artikel.neu, 1);
    const ziel = (await sc.req('GET', `/api/items/${quelle.id}`)).json;
    for (const f of ['number', 'name', 'shortDescription', 'description', 'categories', 'kind', 'useAreas', 'price', 'sizes', 'customFields', 'material', 'materialInfo', 'printTimeMinutes', 'safetyNotes', 'links', 'published'])
      assert.deepEqual(ziel[f], quelle[f], f);
    const bereiche = (i: any) => i.colorAreas.map((a: any) => [a.id, a.name, !!a.alleFarben, a.gruppen ?? []]);
    assert.deepEqual(bereiche(ziel), bereiche(quelle), 'Farbbereiche samt „Alle Farben“ und Gruppen');
    const mdZ = (await sc.req('GET', '/api/config')).json.masterData;
    const rolle = mdZ.filaments.find((f: any) => f.brand === 'Rundreise');
    assert.deepEqual({ ...rolle, id: undefined }, { ...eigen, id: undefined }, 'eigene Farbrolle mit allen Angaben (auch „nicht vorrätig“)');
    const griff = ziel.colorAreas.find((a: any) => a.id === 'griff').colors;
    assert.ok(griff.includes(rolle.id) && griff.includes(bambu.id), 'Linie füllt die Rolle am Ziel ein, feste Bambu-Rolle bleibt');
    assert.deepEqual(mdZ.filaments.find((f: any) => f.id === bambu.id), md0.filaments.find((f: any) => f.id === bambu.id), 'Bambu-Rolle wie in der Quelle');
    const kat = mdZ.categories.find((k: any) => k.name === 'Rundreise-Kategorie');
    assert.deepEqual([kat?.color, kat?.icon], ['lila', 'musik'], 'Kategorie mit Farbe und Symbol');
    assert.ok(mdZ.materials.some((m: any) => m.name === 'Rundreise-Material'));
    assert.ok(mdZ.useAreas.some((u: any) => u.name === 'Rundreise-Bereich'));

    // Noch einmal „Ersetzen“ ohne Änderung: gleich. Nur die Art geändert bzw. nur Gruppe → feste Rollen (gleiche Farben): wird ersetzt.
    const ersetze = async () => (await einspielen(sc, await exportZip(src, [quelle.id]), 'ersetzen')).bericht.abschnitte.artikel;
    assert.equal((await ersetze()).unveraendert, 1);
    assert.equal((await src.req('PUT', `/api/items/${quelle.id}`, { ...body, kind: 'beides' })).status, 200);
    assert.equal((await ersetze()).ersetzt, 1, 'nur Art geändert');
    assert.equal((await sc.req('GET', `/api/items/${quelle.id}`)).json.kind, 'beides');
    const fest = { ...body, kind: 'beides', colorAreas: [body.colorAreas[0], { id: 'griff', name: 'Griff', colors: [bambu.id, eigen.id] }, body.colorAreas[2]] };
    assert.equal((await src.req('PUT', `/api/items/${quelle.id}`, fest)).status, 200);
    assert.equal((await ersetze()).ersetzt, 1, 'nur Gruppe durch dieselben festen Rollen ersetzt');
    assert.deepEqual((await sc.req('GET', `/api/items/${quelle.id}`)).json.colorAreas.find((a: any) => a.id === 'griff').gruppen ?? [], []);
  } finally {
    await schule.stop();
  }
});

test('20 Teile: Export → Import in eine frische Installation, Format unverändert, Teile samt Reihenfolge und eigener Auswahl', async () => {
  const md0 = (await src.req('GET', '/api/config')).json.masterData;
  const [f1, f2] = md0.filaments;
  const colorAreas = Array.from({ length: 20 }, (_, i) =>
    i === 0 ? { id: 't0', name: 'Grundplatte links unten', colors: [f1.id, f2.id] } : { id: `t${i}`, name: `Teil ${i + 1} (langer Name)`, alleFarben: true, colors: [] },
  );
  const neu = await src.req('POST', '/api/items', {
    name: 'Steckpuzzle Bauernhof (20 Teile)', shortDescription: 'Zwanzig Teile, je eine Farbe', categories: [cfg.categories[0].name], useAreas: [],
    colorAreas, material: cfg.materials[0].name, printTimeMinutes: 120, published: true,
  });
  assert.equal(neu.status, 201, neu.text);
  const zip = await exportZip(src, [neu.json.id]);
  const { kopf } = await entpacke(zip);
  assert.equal(kopf.version, 2, 'Format 2 wie bisher');
  assert.equal(kopf.artikel[0].colorAreas.length, 20);
  const schule = await start({ demo: false });
  try {
    const sc = new Client(schule.base);
    await schule.storage.users.create({
      id: newId(), username: 'schule', email: 'schule.admin@schule.example', displayName: 'Schule', role: 'admin',
      passwordHash: await hashPassword('Schule-Admin-Passwort-1'), active: true, isDemo: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastLoginAt: null, teamBereiche: [], fehlversuche: 0,
    });
    assert.equal((await sc.login('schule.admin@schule.example', 'Schule-Admin-Passwort-1')).status, 200);
    const { bericht } = await einspielen(sc, zip, 'ueberspringen');
    assert.equal(bericht.abschnitte.artikel.neu, 1);
    const ziel = (await sc.req('GET', `/api/items/${neu.json.id}`)).json;
    assert.deepEqual(ziel.colorAreas.map((a: any) => [a.id, a.name, !!a.alleFarben]), colorAreas.map((a) => [a.id, a.name, !!a.alleFarben]));
    assert.equal(ziel.colorAreas[0].colors.length, 2, 'eigene Auswahl des ersten Teils');
  } finally {
    await schule.stop();
  }
});

test('Ähnliche Druckteile: Teilexport → vorgemerkt → späterer Export bringt den Partner (auch unter neuer ID) → verknüpft; nur hinzufügen', async () => {
  const neuesTeil = async (c: Client, name: string) => {
    const r = await c.req('POST', '/api/items', {
      name, shortDescription: `Kurz ${name}`, categories: [cfg.categories[0].name], useAreas: [], colorAreas: [{ id: 'a', name: 'Farbe', colors: [cfg.filaments[0].id] }],
      price: '', customFields: [], sizes: [], material: cfg.materials[0].name, materialInfo: '', printTimeMinutes: 5, safetyNotes: [], published: true,
    });
    assert.equal(r.status, 201, r.text);
    return r.json as { id: string; number: string };
  };
  const verknuepfe = async (x: string, y: string) => assert.ok((await src.req('POST', `/api/items/${x}/aehnliche`, { id: y })).status < 300);
  const [A, B, C, D] = [await neuesTeil(src, 'Ähnlich A'), await neuesTeil(src, 'Ähnlich B'), await neuesTeil(src, 'Ähnlich C'), await neuesTeil(src, 'Ähnlich D')];
  await verknuepfe(A.id, B.id);
  await verknuepfe(C.id, A.id);

  // Export nur von A: beide Partner stehen drin (auch nicht exportierte), mit Name und Nummer als Hilfe.
  const zipA = await exportZip(src, [A.id]);
  const kopfA = (await entpacke(zipA)).kopf;
  assert.deepEqual(
    kopfA.artikel[0].aehnliche.map((p: any) => [p.id, p.name, p.nummer]).sort(),
    [[B.id, 'Ähnlich B', B.number], [C.id, 'Ähnlich C', C.number]].sort(),
  );

  const { srv, c } = await frischesZiel();
  after(() => srv.stop());
  const db = srv.storage.sqlite.db;
  const offen = () => (db.prepare('SELECT COUNT(*) AS n FROM artikel_aehnlich_offen').get() as { n: number }).n;
  const aehnlicheIm = async (id: string) => ((await c.req('GET', `/api/items/${id}/aehnliche`)).json as any[]).map((p) => p.name).sort();

  // 1) A allein: nichts anzulegen, zwei Verknüpfungen warten (Vorschau und Ergebnis sagen dasselbe).
  const e1 = await einspielen(c, zipA, 'ueberspringen');
  for (const b of [e1.vorschau.berichte.ueberspringen, e1.vorschau.berichte.ersetzen, e1.bericht]) assert.deepEqual(b.verknuepfungen, { neu: 0, wartend: 2 });
  assert.equal(offen(), 2);
  assert.deepEqual(await aehnlicheIm(A.id), []);

  // 2) B kommt – im Ziel gibt es schon ein Druckteil gleichen Namens (andere ID) → B wird ihm zugeordnet (übersprungen),
  //    dessen Herkunft gemerkt und die vorgemerkte Verknüpfung A ↔ B dorthin aufgelöst.
  const bHier = await neuesTeil(c, 'Ähnlich B');
  assert.notEqual(bHier.id, B.id);
  const e2 = await einspielen(c, await exportZip(src, [B.id]), 'ueberspringen');
  assert.equal(e2.bericht.abschnitte.artikel.uebersprungen, 1);
  assert.deepEqual(e2.bericht.verknuepfungen, { neu: 1, wartend: 0 });
  assert.deepEqual(await aehnlicheIm(A.id), ['Ähnlich B']);
  assert.equal((db.prepare('SELECT herkunft_id FROM artikel WHERE id = ?').get(bHier.id) as any).herkunft_id, B.id, 'Herkunfts-ID gemerkt');
  assert.equal(offen(), 1, 'C wartet noch');

  // 3) C kommt (neu, behält seine ID) → letzte Vormerkung aufgelöst.
  const e3 = await einspielen(c, await exportZip(src, [C.id]), 'ueberspringen');
  assert.equal(e3.bericht.abschnitte.artikel.neu, 1);
  assert.deepEqual(e3.bericht.verknuepfungen, { neu: 1, wartend: 0 });
  assert.deepEqual(await aehnlicheIm(A.id), ['Ähnlich B', 'Ähnlich C']);
  assert.equal(offen(), 0);

  // 4) Nur hinzufügen, nie löschen: Quelle hebt A ↔ C auf und verknüpft A ↔ D; „Ersetzen“ mit A.
  //    Verknüpfungen zählen nicht in den Vergleich: A gilt als unverändert, nicht als ersetzt.
  assert.ok((await src.req('DELETE', `/api/items/${A.id}/aehnliche/${C.id}`)).status < 300);
  await verknuepfe(A.id, D.id);
  const e4 = await einspielen(c, await exportZip(src, [A.id]), 'ersetzen');
  assert.equal(e4.bericht.abschnitte.artikel.unveraendert, 1);
  assert.equal(e4.bericht.abschnitte.artikel.ersetzt, 0);
  assert.deepEqual(e4.bericht.verknuepfungen, { neu: 0, wartend: 1 }, 'D fehlt noch');
  assert.deepEqual(await aehnlicheIm(A.id), ['Ähnlich B', 'Ähnlich C'], 'A ↔ C bleibt');
  assert.equal(offen(), 1);

  // 5) Ältere Datei ohne Verknüpfungen: nichts passiert, nichts geht verloren.
  const alt = alsJson(kopfA, new Map());
  const e5 = await einspielen(c, alt, 'ersetzen');
  assert.deepEqual(e5.bericht.verknuepfungen, { neu: 0, wartend: 0 });
  assert.deepEqual(await aehnlicheIm(A.id), ['Ähnlich B', 'Ähnlich C']);

  // 6) Druckteil gelöscht → seine Vormerkungen verschwinden mit.
  assert.ok((await c.req('DELETE', `/api/items/${A.id}`)).status < 300);
  assert.equal(offen(), 0);
  assert.deepEqual(await aehnlicheIm(bHier.id), [], 'Verknüpfung per Fremdschlüssel mit weg');
});

after(() => sourceSrv.stop());
after(() => targetSrv.stop());

test('Mehrere Kategorien: Export enthält alle (plus Hauptkategorie für ältere Versionen), Vorschau nennt neue, Rundreise in Reihenfolge; ältere ZIP-Datei mit einer Kategorie', async () => {
  const md0 = (await src.req('GET', '/api/config')).json.masterData;
  const neue = [{ name: 'Mehrfach-A', color: 'lila', icon: 'musik' }, { name: 'Mehrfach-B', color: 'gruen', icon: 'stift' }];
  assert.equal((await src.req('PUT', '/api/admin/settings/masterdata/categories', { entries: [...md0.categories, ...neue] })).status, 200);
  const vorhanden = md0.categories[0].name;
  const r = await src.req('POST', '/api/items', {
    name: 'Teil in drei Kategorien', shortDescription: 'Prüft mehrere Kategorien im Austausch', categories: ['Mehrfach-B', vorhanden, 'Mehrfach-A'],
    useAreas: [], colorAreas: [{ id: 'a', name: 'Farbe', colors: [cfg.filaments[0].id] }], material: cfg.materials[0].name, printTimeMinutes: 5, published: true,
  });
  assert.equal(r.status, 201, r.text);
  const zip = await exportZip(src, [r.json.id]);
  const { kopf } = await entpacke(zip);
  assert.deepEqual(kopf.artikel[0].categories, ['Mehrfach-B', vorhanden, 'Mehrfach-A']);
  assert.equal(kopf.artikel[0].category, 'Mehrfach-B', 'Hauptkategorie zusätzlich als „category“');
  assert.deepEqual(kopf.stammdaten.kategorien.map((k: any) => k.name).sort(), ['Mehrfach-A', 'Mehrfach-B', vorhanden].sort(), 'alle gebrauchten Kategorien');

  const { srv, c } = await frischesZiel(); // eigene Instanz: eigenes Import-Limit
  try {
    const { vorschau, bericht } = await einspielen(c, zip, 'ueberspringen');
    const neuIn = vorschau.berichte.ueberspringen.details.filter((d: any) => d.status === 'neu' && d.bereich === 'Kategorie').map((d: any) => d.name).sort();
    // Die frische Installation hat die Standard-Kategorien, also auch die erste der Quelle.
    assert.deepEqual(neuIn, ['Mehrfach-A', 'Mehrfach-B'], 'Vorschau nennt jede neue Kategorie, die vorhandene nicht');
    assert.equal(bericht.abschnitte.kategorien.neu, 2);
    const ziel = (await c.req('GET', `/api/items/${r.json.id}`)).json;
    assert.deepEqual(ziel.categories, ['Mehrfach-B', vorhanden, 'Mehrfach-A'], 'alle Kategorien in derselben Reihenfolge');
    const mdZ = (await c.req('GET', '/api/config')).json.masterData;
    assert.deepEqual(['Mehrfach-A', 'Mehrfach-B'].map((n) => mdZ.categories.find((k: any) => k.name === n)?.color), ['lila', 'gruen'], 'mit Farbe aus der Datei');

    // Datei wie aus 1.7.0/1.8.0: nur „category“ (eine Kategorie), kein „categories“.
    const alt = structuredClone(kopf);
    for (const a of alt.artikel) delete a.categories;
    alt.artikel[0] = { ...alt.artikel[0], id: newId(), number: '', name: 'Teil aus älterer Datei', category: 'Mehrfach-A', dateien: [], videos: [], aehnliche: [] };
    const { bericht: b2 } = await einspielen(c, await packe(alt), 'ueberspringen');
    assert.equal(b2.abschnitte.artikel.neu, 1, JSON.stringify(b2.details));
    const altTeil = ((await c.req('GET', '/api/items?all=1')).json as any[]).find((i) => i.name === 'Teil aus älterer Datei');
    assert.deepEqual(altTeil.categories, ['Mehrfach-A'], 'die eine Kategorie bleibt erhalten');
    assert.equal(b2.abschnitte.kategorien.neu, 0, 'vorhandene Kategorie benutzt');
  } finally {
    await srv.stop();
  }
});
