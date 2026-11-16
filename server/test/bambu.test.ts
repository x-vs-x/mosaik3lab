// Bambu-Lab-Katalog der Farbrollen: Migration alter Daten, Abgleich bei Updates, schreibgeschützte Katalog-Rollen, Import.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { BAMBU_KATALOG, DEFAULT_FILAMENT_IDS, filamentAusKatalog, katalogEintrag } from '../src/domain/bambuKatalog';
import { listMigrations, migrate, openDb } from '../src/kern/db';
import { gleicheAb } from '../src/module/stammdaten/bambuAbgleich';
import type { Filament } from '@mosaik3lab/shared/stammdaten';
import { anmelden, startServer } from './helfer';

const srv = await startServer({ allowDemoAccounts: true, seedDemoData: true });
after(() => srv.stop());
const { team, admin } = await anmelden(srv.base);
const md = async () => (await admin.req('GET', '/api/admin/settings')).json.masterData;

test('Katalog: Nummern und IDs eindeutig, Standardfarben enthalten, Quelle angegeben', () => {
  const ids = BAMBU_KATALOG.eintraege.map((e) => e.id);
  const nummern = BAMBU_KATALOG.eintraege.map((e) => e.nummer).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(nummern).size, nummern.length);
  assert.match(BAMBU_KATALOG.quelle, /BambuStudio/);
  for (const id of DEFAULT_FILAMENT_IDS) assert.ok(katalogEintrag(id), id);
  assert.equal(katalogEintrag('bambu-pla-basic-black')?.nummer, '10101');
  assert.equal(katalogEintrag('bambu-pla-basic-black')?.name, 'Black');
});

test('Migration: alte Farbrollen bekommen Herkunft, Nummer und Originalname; eigene und „vorrätig“ bleiben', async () => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-bambu-'));
  const config = loadConfig({ storageDir, rootDir: storageDir, logRequests: false, seedDemoData: false, clientDistDir: path.join(storageDir, 'none') });
  // Datenbank im Stand vor Migration 012 (bisheriger Bambu-Import + eine eigene Rolle).
  const db = openDb(config.dbFile);
  migrate(db, { migrations: listMigrations().filter((m) => m.version <= 11), log: () => {} });
  const ins = db.prepare('INSERT INTO filament (id, marke, linie, farbname, hex, verfuegbar, sortierung) VALUES (?, ?, ?, ?, ?, ?, ?)');
  ins.run('bambu-pla-basic-jade-white', 'Bambu Lab', 'PLA Basic', 'Weiß', '#FFFFFF', 0, 0);
  ins.run('bambu-petg-hf-gray', 'Bambu Lab', 'PETG HF', 'Grau', '#A3A6A6', 1, 1);
  ins.run('eigen-1', 'Prusament', 'PLA', 'Galaxy Black', '#222222', 1, 2);
  db.prepare("INSERT INTO einstellung (id, schluessel, wert, geaendert_am) VALUES ('x', 'angelegt', '\"2025-01-01\"', '2025-01-01')").run();
  db.close();

  const instance = await createApp(config);
  try {
    const f = (await instance.storage.settings.get()).masterData.filaments;
    const weiss = f.find((x) => x.id === 'bambu-pla-basic-jade-white')!;
    assert.equal(weiss.katalogId, 'bambu-pla-basic-jade-white');
    assert.equal(weiss.herstellerNummer, '10100');
    assert.equal(weiss.herstellerName, 'Jade White');
    assert.equal(weiss.colorName, katalogEintrag(weiss.id)!.farbname);
    assert.equal(weiss.available, false, '„vorrätig“ bleibt');
    const grau = f.find((x) => x.id === 'bambu-petg-hf-gray')!;
    assert.equal(grau.hex, katalogEintrag(grau.id)!.hex, 'Farbe aus dem Katalog übernommen');
    const eigen = f.find((x) => x.id === 'eigen-1')!;
    assert.equal(eigen.katalogId, null);
    assert.equal(eigen.colorName, 'Galaxy Black');
    assert.deepEqual(f.map((x) => x.id), ['bambu-pla-basic-jade-white', 'bambu-petg-hf-gray', 'eigen-1'], 'Reihenfolge bleibt');
    const hinweis = instance.storage.sqlite.settings.getSetting('bambuAbgleichHinweis') as { aenderungen: string[]; neu: string[] };
    assert.ok(hinweis.aenderungen.some((a) => a.includes('#A3A6A6')), JSON.stringify(hinweis));
    assert.deepEqual(hinweis.neu, [], 'beim ersten Abgleich gilt nichts als neu');
  } finally {
    await instance.close();
    await fs.rm(storageDir, { recursive: true, force: true });
  }
});

test('Abgleich: geändert, weggefallen, eigene unberührt, „vorrätig“ bleibt', () => {
  const schwarz = katalogEintrag('bambu-pla-basic-black')!;
  const weiss = katalogEintrag('bambu-pla-basic-jade-white')!;
  const eigen: Filament = {
    id: 'e1', brand: 'Bambu Lab', line: 'PLA Basic', colorName: 'Schwarz', hex: '#000000', herstellerNummer: '10101',
    available: true, katalogId: null, herstellerName: '', weggefallen: false,
  };
  const vorher = [{ ...filamentAusKatalog(schwarz), available: false }, filamentAusKatalog(weiss), eigen];
  // Neue Katalogfassung: Schwarz umbenannt + neue Nummer + neue Farbe, Jade White fehlt, eine Farbe ist neu.
  const katalog = {
    stand: 'test',
    eintraege: [{ ...schwarz, farbname: 'Tiefschwarz', nummer: '10199', hex: '#111111' }, { ...weiss, id: 'bambu-neu', nummer: '19999' }],
  };
  const { liste, aenderungen } = gleicheAb(vorher, katalog);
  assert.equal(liste[0].colorName, 'Tiefschwarz');
  assert.equal(liste[0].herstellerNummer, '10199');
  assert.equal(liste[0].hex, '#111111');
  assert.equal(liste[0].available, false, '„vorrätig“ bleibt');
  assert.equal(liste[1].weggefallen, true, 'weggefallen, nicht gelöscht');
  assert.deepEqual(liste[2], eigen, 'eigene Rolle unberührt');
  assert.equal(liste.length, 3, 'neue Katalogfarben werden nicht angelegt');
  assert.equal(aenderungen.length, 2, aenderungen.join('\n'));
  // Zweiter Lauf ändert nichts mehr.
  const zweiter = gleicheAb(liste, katalog);
  assert.equal(zweiter.geaendert, false);
  assert.deepEqual(zweiter.aenderungen, []);
});

test('Neuinstallation: Standardfarben mit Nummer, Katalog mit Quelle abrufbar', async () => {
  const { filaments } = await md();
  assert.deepEqual(filaments.map((f: any) => f.id), DEFAULT_FILAMENT_IDS);
  assert.ok(filaments.every((f: any) => f.katalogId && /^\d{5}$/.test(f.herstellerNummer) && f.herstellerName));
  const r = await admin.req('GET', '/api/admin/settings/bambu-palette');
  assert.equal(r.status, 200);
  assert.equal(r.json.eintraege.length, BAMBU_KATALOG.eintraege.length);
  assert.equal(r.json.hinweis, null, 'Neuinstallation: kein Hinweis');
  assert.equal((await team.req('GET', '/api/admin/settings/bambu-palette')).status, 403);
});

test('Katalog-Rollen sind schreibgeschützt, eigene frei editierbar', async () => {
  const { filaments } = await md();
  const next = [
    ...filaments.map((f: any) => (f.id === 'bambu-pla-basic-black' ? { ...f, colorName: 'Mein Schwarz', hex: '#123456', herstellerNummer: '1', available: false } : f)),
    { brand: 'Prusament', line: 'PETG', colorName: 'Jet Black', hex: '#101010', herstellerNummer: 'PRM-1' },
  ];
  const r = await admin.req('PUT', '/api/admin/settings/masterdata/filaments', { entries: next });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const schwarz = r.json.filaments.find((f: any) => f.id === 'bambu-pla-basic-black');
  assert.equal(schwarz.colorName, katalogEintrag('bambu-pla-basic-black')!.farbname);
  assert.equal(schwarz.herstellerNummer, '10101');
  assert.equal(schwarz.available, false, 'nur „vorrätig“ ist änderbar');
  const eigen = r.json.filaments.find((f: any) => f.colorName === 'Jet Black');
  assert.equal(eigen.katalogId, null);
  assert.equal(eigen.herstellerNummer, 'PRM-1');
});

test('Import aus dem Katalog: nur neue Farben, mit Nummer; Unbekanntes abgelehnt', async () => {
  const ids = ['bambu-pla-basic-jade-white', 'bambu-pla-matte-sky-blue', 'bambu-abs-azure'];
  const r = await admin.req('POST', '/api/admin/settings/masterdata/filaments/import', { ids });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.added, 2, 'Jade White ist schon vorhanden');
  const azure = r.json.masterData.filaments.find((f: any) => f.id === 'bambu-abs-azure');
  assert.equal(azure.herstellerNummer, katalogEintrag('bambu-abs-azure')!.nummer);
  assert.equal((await admin.req('POST', '/api/admin/settings/masterdata/filaments/import', { ids })).json.added, 0);
  assert.equal((await admin.req('POST', '/api/admin/settings/masterdata/filaments/import', { ids: ['gibt-es-nicht'] })).status, 400);
  assert.equal((await team.req('POST', '/api/admin/settings/masterdata/filaments/import', { ids })).status, 403);
});
