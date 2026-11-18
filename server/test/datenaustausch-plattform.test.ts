// Druckteile zwischen Systemen austauschen: eine unter Windows erzeugte Exportdatei (test/fixtures/export-windows.json)
// wird hier eingespielt – auf GitHub unter Linux, lokal unter Windows. Dazu die Stammdaten-Fälle auf dem Zielsystem:
// ganz frisch, Stammdaten komplett leer, Datei im Windows-Editor gespeichert (BOM, CRLF), nochmal einspielen, kaputte Angaben.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createApp } from '../src/app';
import { hashPassword } from '../src/kern/auth/password';
import { loadConfig } from '../src/config';
import { newId } from '../src/kern/ids';

const FIXTURE = await fs.readFile(path.join(import.meta.dirname, 'fixtures', 'export-windows.json'), 'utf8');
const kopf = JSON.parse(FIXTURE.split('\n')[0].slice(0, -',"dateiinhalte":['.length) + '}');
const ART = kopf.artikel[0];

async function ziel() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-plattform-'));
  const config = loadConfig({ storageDir: dir, rootDir: dir, logRequests: false, seedDemoData: false, clientDistDir: path.join(dir, 'none') });
  const instance = await createApp(config);
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await instance.storage.users.create({
    id: newId(), username: 'admin', email: 'admin@schule.example', displayName: 'Admin', role: 'admin',
    passwordHash: await hashPassword('Plattform-Test-2026'), active: true, isDemo: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastLoginAt: null, teamBereiche: [], fehlversuche: 0,
  });
  let cookie = '';
  const req = async (method: string, url: string, body?: unknown, form?: FormData) => {
    const headers: Record<string, string> = { 'X-Requested-With': 'mosaik3lab', ...(cookie && { Cookie: cookie }) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : form });
    const c = res.headers.get('set-cookie');
    if (c) cookie = c.split(';')[0];
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, json, text };
  };
  assert.equal((await req('POST', '/api/auth/login', { email: 'admin@schule.example', password: 'Plattform-Test-2026' })).status, 200);
  const vorschau = async (inhalt: string | Buffer) => {
    const fd = new FormData();
    fd.append('datei', new Blob([inhalt]), 'export.json');
    return req('POST', '/api/admin/daten/import/vorschau', undefined, fd);
  };
  const einspielen = async (inhalt: string | Buffer, modus: 'ueberspringen' | 'ersetzen' = 'ueberspringen') => {
    const v = await vorschau(inhalt);
    assert.equal(v.status, 200, v.text);
    const r = await req('POST', '/api/admin/daten/import/ausfuehren', { importId: v.json.importId, modus });
    assert.equal(r.status, 200, r.text);
    return r.json.bericht;
  };
  return {
    instance, req, vorschau, einspielen, dir,
    async stop() {
      await new Promise((r) => server.close(r));
      await instance.close();
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}
const ziele: Awaited<ReturnType<typeof ziel>>[] = [];
after(async () => {
  for (const z of ziele) await z.stop();
});

/** Druckteil mit allen Bezügen ist vollständig da und lässt sich anfragen. */
async function pruefeEingespielt(z: Awaited<ReturnType<typeof ziel>>) {
  const items = (await z.req('GET', '/api/items?all=1')).json as any[];
  const teil = items.find((i) => i.name === ART.name);
  assert.ok(teil, 'Druckteil eingespielt');
  assert.deepEqual(teil.categories, ['Übungsgeräte für Schüler'], 'Kategorie aus der Datei von 1.6.3 übernommen');
  assert.equal(teil.material, 'TPU 95A (weich)');
  assert.ok(teil.useAreas.includes('Ergotherapie & Förderung'));
  assert.equal(teil.shortDescription, ART.shortDescription, 'Umlaute unverändert');
  const md = (await z.req('GET', '/api/config')).json.masterData;
  for (const [liste, name] of [[md.categories, 'Übungsgeräte für Schüler'], [md.materials, 'TPU 95A (weich)'], [md.useAreas, 'Ergotherapie & Förderung']] as const) {
    assert.equal(liste.filter((e: any) => e.name === name).length, 1, `Stammdaten „${name}“ genau einmal`);
  }
  const farben = teil.colorAreas[0].colors as string[];
  assert.equal(farben.length, 2, 'beide Farben zugeordnet');
  const eigene = md.filaments.find((f: any) => f.colorName === 'Grün-Blau (gemischt)');
  assert.ok(eigene && farben.includes(eigene.id), 'eigene Farbrolle aus der Datei angelegt');
  // Dateien: sicher benannt (ID + kleine Endung), Originalname mit Umlauten erhalten, Inhalt bitgenau
  const dateien = z.instance.storage.files.list('artikel', teil.id);
  assert.equal(dateien.length, 2);
  for (const d of dateien) {
    assert.match(d.pfad, /^artikel\/[0-9a-f-]+\/(bild|druckdatei)\/[0-9a-f-]+\.(png|stl)$/, `Pfad systemneutral: ${d.pfad}`);
    const inhalt = await fs.readFile(z.instance.storage.files.absPath(d));
    assert.equal(crypto.createHash('sha256').update(inhalt).digest('hex'), d.sha256, 'Inhalt bitgenau');
  }
  assert.deepEqual(dateien.map((d) => d.originalname).sort(), ['Foto Schäl-Griff.PNG', 'Griff für Löffel (v2).STL']);
  assert.equal((await z.req('GET', `/api/files/images/${teil.images[0]}`)).status, 200, 'Bild wird ausgeliefert');
  // Anfrage auf das eingespielte Teil mit der eingespielten Farbe
  const anfrage = await z.req('POST', '/api/orders', {
    itemId: teil.id, quantity: 1, colors: { [teil.colorAreas[0].id]: eigene.id }, size: 'L', classOrTeam: 'Klasse 3a', customization: '', requesterEmail: 'lehrkraft@schule.example',
  });
  assert.equal(anfrage.status, 201, anfrage.text);
  return { teil, md };
}

test('Windows-Export auf frischem System einspielen: Stammdaten, Farben, Dateien, Anfrage', async () => {
  const z = await ziel();
  ziele.push(z);
  const bericht = await z.einspielen(FIXTURE);
  assert.equal(bericht.abschnitte.artikel.neu, 1);
  await pruefeEingespielt(z);
  // Noch einmal: nichts doppelt
  const zweites = await z.einspielen(FIXTURE);
  assert.equal(zweites.abschnitte.artikel.neu, 0);
  const md = (await z.req('GET', '/api/config')).json.masterData;
  assert.equal(md.filaments.filter((f: any) => f.colorName === 'Grün-Blau (gemischt)').length, 1, 'Farbrolle nicht doppelt');
  assert.equal(((await z.req('GET', '/api/items?all=1')).json as any[]).filter((i) => i.name === ART.name).length, 1, 'Druckteil nicht doppelt');
});

test('Zielsystem ganz ohne Stammdaten (alles gelöscht): wird aus der Datei ergänzt', async () => {
  const z = await ziel();
  ziele.push(z);
  const repo = z.instance.storage.settings;
  const s = repo.read();
  repo.write({ ...s, masterData: { ...s.masterData, categories: [], materials: [], useAreas: [], filaments: [] } });
  const bericht = await z.einspielen(FIXTURE);
  assert.equal(bericht.abschnitte.artikel.neu, 1);
  assert.equal(bericht.abschnitte.kategorien.neu, 1);
  assert.equal(bericht.abschnitte.materialien.neu, 1);
  assert.equal(bericht.abschnitte.einsatzbereiche.neu, 2);
  await pruefeEingespielt(z);
});

test('Datei im Windows-Editor gespeichert (BOM, CRLF) oder Großschreibung auf dem Ziel: wird trotzdem gelesen', async () => {
  const z = await ziel();
  ziele.push(z);
  const mitBom = '﻿' + FIXTURE;
  const mitCrlf = FIXTURE.replace(/\n/g, '\r\n');
  for (const [name, inhalt] of [['BOM', mitBom], ['CRLF', mitCrlf], ['BOM + CRLF', '﻿' + mitCrlf]] as const) {
    const v = await z.vorschau(inhalt);
    assert.equal(v.status, 200, `${name}: ${v.text}`);
    assert.equal(v.json.kopf.artikel, 1, name);
    await z.req('DELETE', `/api/admin/daten/import/${v.json.importId}`);
  }
  // Kategorie gibt es hier schon in anderer Schreibweise → wird benutzt, nicht doppelt angelegt
  const repo = z.instance.storage.settings;
  const s = repo.read();
  repo.write({ ...s, masterData: { ...s.masterData, categories: [...s.masterData.categories, { ...s.masterData.categories[0], id: newId(), name: 'ÜBUNGSGERÄTE FÜR SCHÜLER' }] } });
  const bericht = await z.einspielen('﻿' + mitCrlf);
  assert.equal(bericht.abschnitte.artikel.neu, 1);
  assert.equal(bericht.abschnitte.kategorien.neu, 0, 'vorhandene Kategorie (andere Schreibweise) benutzt');
  const teil = ((await z.req('GET', '/api/items?all=1')).json as any[]).find((i) => i.name === ART.name);
  assert.deepEqual(teil.categories, ['ÜBUNGSGERÄTE FÜR SCHÜLER'], 'Schreibweise des Zielsystems');
});

test('Unvollständige Angaben in der Datei: Teil wird mit Grund übersprungen, Rest kommt an', async () => {
  const z = await ziel();
  ziele.push(z);
  const k = structuredClone(kopf);
  k.artikel.push({ ...k.artikel[0], id: newId(), number: '', name: 'Teil ohne Kategorie', category: '', dateien: [], videos: [] });
  k.artikel.push({ ...k.artikel[0], id: newId(), number: '', name: 'Teil nur mit unbekannter Farbe', colorAreas: [{ id: 'a', name: 'Farbe', colors: ['nirgends-beschrieben'] }], dateien: [], videos: [] });
  const text = JSON.stringify(k).slice(0, -1) + ',"dateiinhalte":[' + '\n' + FIXTURE.split('\n').slice(1).join('\n');
  const bericht = await z.einspielen(text);
  assert.equal(bericht.abschnitte.artikel.neu, 1, 'das vollständige Teil');
  const gruende = bericht.details.filter((d: any) => d.status === 'uebersprungen').map((d: any) => `${d.name}: ${d.text}`);
  assert.equal(gruende.length, 2, gruende.join(' | '));
  assert.ok(gruende.some((g: string) => /ohne Kategorie.*unvollständig/.test(g)), gruende.join(' | '));
  assert.ok(gruende.some((g: string) => /unbekannter Farbe.*keine seiner Farben/.test(g)), gruende.join(' | '));
  await pruefeEingespielt(z);
});
