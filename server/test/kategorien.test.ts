// Mehrere Kategorien je Druckteil (Migration 023): Anlegen/Bearbeiten, Reihenfolge (Hauptkategorie), Katalogfilter,
// Suche, Zählung beim Löschen, Umbenennen, Vorschlag → Druckteil, Rechte.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { anmelden, form, PNG_1PX, startServer } from './helfer';

const srv = await startServer({ allowDemoAccounts: true, seedDemoData: true });
after(() => srv.stop());
const { anon, teacher, team, admin } = await anmelden(srv.base);

const body = (categories: unknown) => ({
  name: 'Teil mit Kategorien',
  shortDescription: 'Kurzbeschreibung für den Kategorien-Test.',
  categories,
  useAreas: [],
  colorAreas: [{ name: 'Farbe', alleFarben: true, colors: [] }],
  material: 'PLA',
  printTimeMinutes: 20,
  published: true,
});
const hauptkategorie = (id: string) =>
  (srv.storage.sqlite.db.prepare('SELECT k.name FROM artikel a JOIN kategorie k ON k.id = a.kategorie_id WHERE a.id = ?').get(id) as { name: string } | undefined)?.name;
const ids = async (query: string) => ((await anon.req('GET', `/api/items?${query}`)).json as any[]).map((i) => i.id);

let teil: any;
test('Anlegen: keine Kategorie → verständlicher Fehler; mehrere → Reihenfolge bleibt, Doppelte entfallen', async () => {
  for (const leer of [[], undefined]) {
    const r = await team.req('POST', '/api/items', body(leer));
    assert.equal(r.status, 400);
    assert.ok(r.json.fields?.categories, JSON.stringify(r.json));
  }
  assert.equal((await team.req('POST', '/api/items', body([]))).json.fields.categories, 'Bitte mindestens eine Kategorie wählen');
  const unbekannt = await team.req('POST', '/api/items', body(['Kommunikation', 'Gibt es nicht']));
  assert.equal(unbekannt.status, 400);
  assert.equal(unbekannt.json.fields?.categories, 'Unbekannte Kategorie');

  const eins = await team.req('POST', '/api/items', body(['Sonstiges']));
  assert.equal(eins.status, 201);
  assert.deepEqual(eins.json.categories, ['Sonstiges']);

  const r = await team.req('POST', '/api/items', body(['Kommunikation', 'Feinmotorik', 'Kommunikation']));
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.deepEqual(r.json.categories, ['Kommunikation', 'Feinmotorik']);
  assert.equal(hauptkategorie(r.json.id), 'Kommunikation', 'erste = Hauptkategorie in artikel.kategorie_id');
  teil = r.json;
});

test('Bearbeiten: Kategorien ändern, Reihenfolge tauschen, auf eine reduzieren; leer wird abgelehnt', async () => {
  const put = (categories: unknown) => team.req('PUT', `/api/items/${teil.id}`, { ...body(categories), name: teil.name });
  let r = await put(['Feinmotorik', 'Kommunikation', 'Alltagshilfen']);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.categories, ['Feinmotorik', 'Kommunikation', 'Alltagshilfen']);
  assert.equal(hauptkategorie(teil.id), 'Feinmotorik');
  r = await put(['Alltagshilfen']);
  assert.deepEqual(r.json.categories, ['Alltagshilfen']);
  assert.equal(hauptkategorie(teil.id), 'Alltagshilfen');
  assert.equal((await put([])).status, 400);
  assert.deepEqual((await team.req('GET', `/api/items/${teil.id}`)).json.categories, ['Alltagshilfen'], 'abgelehnte Änderung ändert nichts');
  r = await put(['Kommunikation', 'Feinmotorik']);
  assert.deepEqual(r.json.categories, ['Kommunikation', 'Feinmotorik']);
});

test('Katalog: Druckteil erscheint unter jeder seiner Kategorien, Suche findet jede Kategorie, Zählung stimmt', async () => {
  assert.ok((await ids(`category=${encodeURIComponent('Kommunikation')}`)).includes(teil.id), 'unter der Hauptkategorie');
  assert.ok((await ids(`category=${encodeURIComponent('Feinmotorik')}`)).includes(teil.id), 'unter der zweiten Kategorie');
  assert.ok(!(await ids(`category=${encodeURIComponent('Alltagshilfen')}`)).includes(teil.id), 'nicht mehr unter der abgewählten');
  assert.ok((await ids('q=feinmotorik')).includes(teil.id), 'Suche über alle Kategorien');
  // Zählung (Löschschutz in den Stammdaten) = Treffer des Filters über alle Druckteile, auch Entwürfe.
  for (const k of (await admin.req('GET', '/api/admin/settings')).json.masterData.categories as { name: string }[]) {
    const treffer = ((await team.req('GET', `/api/items?all=1&category=${encodeURIComponent(k.name)}`)).json as any[]).length;
    assert.equal(srv.storage.masterData.countItemsUsing('categories', k.name), treffer, k.name);
  }
});

test('Kategorie löschen: auch als zweite Kategorie verwendet → 409 mit Zahl; nach dem Abwählen löschbar', async () => {
  const { categories } = (await admin.req('GET', '/api/admin/settings')).json.masterData;
  const neu = { id: '', name: 'Nur zweite Kategorie', color: categories[0].color, icon: categories[0].icon };
  let r = await admin.req('PUT', '/api/admin/settings/masterdata/categories', { entries: [...categories, neu] });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const mitNeu = r.json.categories;
  const put = (cats: string[]) => team.req('PUT', `/api/items/${teil.id}`, { ...body(cats), name: teil.name });
  assert.equal((await put(['Kommunikation', 'Nur zweite Kategorie'])).status, 200);
  r = await admin.req('PUT', '/api/admin/settings/masterdata/categories', { entries: categories });
  assert.equal(r.status, 409);
  assert.match(r.json.error, /Nur zweite Kategorie.*1 Druckteil/);
  // Umbenennen wirkt sofort in der Liste des Druckteils (Bezug per ID).
  const umbenannt = mitNeu.map((c: any) => (c.name === 'Nur zweite Kategorie' ? { ...c, name: 'Zweite (umbenannt)' } : c));
  assert.equal((await admin.req('PUT', '/api/admin/settings/masterdata/categories', { entries: umbenannt })).status, 200);
  assert.deepEqual((await team.req('GET', `/api/items/${teil.id}`)).json.categories, ['Kommunikation', 'Zweite (umbenannt)']);
  assert.equal((await put(['Kommunikation'])).status, 200);
  r = await admin.req('PUT', '/api/admin/settings/masterdata/categories', { entries: categories });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual((await team.req('GET', `/api/items/${teil.id}`)).json.categories, ['Kommunikation']);
});

test('Druckteil löschen entfernt seine Zuordnungen', async () => {
  assert.equal((await team.req('DELETE', `/api/items/${teil.id}`)).status, 200);
  const n = (srv.storage.sqlite.db.prepare('SELECT COUNT(*) AS n FROM artikel_kategorien WHERE artikel_id = ?').get(teil.id) as { n: number }).n;
  assert.equal(n, 0);
});

test('Hauptkategorie (artikel.kategorie_id) = erste Zuordnung – nach jedem Schreibweg, bei allen Druckteilen', async () => {
  const db = srv.storage.sqlite.db;
  // Die Regel aus Migration 023: Hauptkategorie und erste Zeile der Zuordnung sind gleich (beide leer zählt auch).
  const abweichend = () =>
    (db.prepare(
      `SELECT COUNT(*) AS n FROM artikel a WHERE COALESCE(a.kategorie_id, '') <>
         COALESCE((SELECT ak.kategorie_id FROM artikel_kategorien ak WHERE ak.artikel_id = a.id ORDER BY ak.sortierung LIMIT 1), '')`,
    ).get() as { n: number }).n;
  const zuordnungen = (id: string) => (db.prepare('SELECT COUNT(*) AS n FROM artikel_kategorien WHERE artikel_id = ?').get(id) as { n: number }).n;
  const kategorien = async (id: string) => (await team.req('GET', `/api/items/${id}`)).json.categories as string[];
  const stimmt = async (id: string, erwartet: string[], schritt: string) => {
    assert.deepEqual(await kategorien(id), erwartet, schritt);
    assert.equal(hauptkategorie(id), erwartet[0], `${schritt}: Hauptkategorie`);
    assert.equal(zuordnungen(id), erwartet.length, `${schritt}: Zeilen der Zuordnung`);
    assert.equal(abweichend(), 0, `${schritt}: bei keinem Druckteil laufen beide auseinander`);
  };
  const md = (await admin.req('GET', '/api/admin/settings')).json.masterData;
  const WAHL = ['Feinmotorik', 'Kommunikation', 'Sonstiges'];
  const eigeneFarbe = md.filaments[0].id;
  const neu = await team.req('POST', '/api/items', { ...body(WAHL), name: 'Teil für alle Schreibwege', colorAreas: [{ name: 'Farbe', colors: [eigeneFarbe] }] });
  assert.equal(neu.status, 201, JSON.stringify(neu.json));
  const id = neu.json.id as string;
  await stimmt(id, WAHL, 'Anlegen');

  // Schreibwege, die das Druckteil neu speichern, ohne die Kategorien zu nennen
  assert.equal((await team.req('PATCH', `/api/items/${id}/publish`, { published: false })).status, 200);
  await stimmt(id, WAHL, 'Veröffentlichung ändern');
  assert.equal((await team.req('POST', `/api/items/${id}/images`, undefined, { form: form('bild.png', PNG_1PX, 'image/png') })).status, 201);
  await stimmt(id, WAHL, 'Bild hochladen');
  assert.equal((await team.req('POST', `/api/items/${id}/videos/link`, { title: 'Anleitung', url: 'https://example.org/video' })).status, 201);
  await stimmt(id, WAHL, 'Video-Link');
  const andere = md.filaments[1].id;
  const zuordnen = await team.req('POST', '/api/items/farbe-zuordnen', { filamentId: andere, ziele: [{ itemId: id, bereiche: neu.json.colorAreas.map((a: any) => a.id) }] });
  assert.equal(zuordnen.json.druckteile, 1, JSON.stringify(zuordnen.json));
  await stimmt(id, WAHL, 'Farbe zuordnen');
  // Farbrolle löschen schreibt alle Druckteile neu, die sie verwenden.
  const ohne = await admin.req('PUT', '/api/admin/settings/masterdata/filaments', { entries: md.filaments.filter((f: any) => f.id !== andere) });
  assert.equal(ohne.status, 200, JSON.stringify(ohne.json));
  await stimmt(id, WAHL, 'Farbrolle gelöscht');
  // Kategorie umbenennen: Bezug per ID, Reihenfolge bleibt.
  const { categories } = (await admin.req('GET', '/api/admin/settings')).json.masterData;
  const um = (von: string, nach: string) => admin.req('PUT', '/api/admin/settings/masterdata/categories', { entries: categories.map((c: any) => (c.name === von ? { ...c, name: nach } : c)) });
  assert.equal((await um('Feinmotorik', 'Feinmotorik (neu)')).status, 200);
  await stimmt(id, ['Feinmotorik (neu)', 'Kommunikation', 'Sonstiges'], 'Kategorie umbenannt');
  assert.equal((await admin.req('PUT', '/api/admin/settings/masterdata/categories', { entries: categories })).status, 200);
  await stimmt(id, WAHL, 'Kategorie zurückbenannt');

  // Export → hier anders einstellen → „Ersetzen“ stellt die Kategorien der Datei samt Reihenfolge wieder her.
  const zip = Buffer.from(await (await team.roh(`/api/admin/daten/export?artikel=${id}`)).arrayBuffer());
  assert.equal((await team.req('PUT', `/api/items/${id}`, { ...body(['Sonstiges', 'Alltagshilfen']), name: 'Teil für alle Schreibwege', published: false, colorAreas: [{ name: 'Farbe', colors: [eigeneFarbe] }] })).status, 200);
  await stimmt(id, ['Sonstiges', 'Alltagshilfen'], 'Bearbeiten');
  const fd = new FormData();
  fd.append('datei', new Blob([zip]), 'export.zip');
  const vorschau = await team.req('POST', '/api/admin/daten/import/vorschau', undefined, { form: fd });
  assert.equal(vorschau.status, 200, JSON.stringify(vorschau.json));
  assert.equal(vorschau.json.berichte.ersetzen.abschnitte.artikel.ersetzt, 1, 'andere Kategorien = anderer Stand');
  assert.equal((await team.req('POST', '/api/admin/daten/import/ausfuehren', { importId: vorschau.json.importId, modus: 'ersetzen' })).status, 200);
  await stimmt(id, WAHL, 'Einspielen mit „Ersetzen“');

  assert.equal((await team.req('DELETE', `/api/items/${id}`)).status, 200);
  assert.equal(zuordnungen(id), 0);
  assert.equal(abweichend(), 0, 'Löschen');
});

test('Rechte unverändert: Besucher und Lehrkraft dürfen keine Kategorien an Druckteilen setzen', async () => {
  const demo = ((await anon.req('GET', '/api/items')).json as any[])[0];
  assert.equal((await anon.req('POST', '/api/items', body(['Sonstiges']))).status, 401);
  assert.equal((await teacher.req('POST', '/api/items', body(['Sonstiges']))).status, 403);
  assert.equal((await teacher.req('PUT', `/api/items/${demo.id}`, body(['Sonstiges']))).status, 403);
});

test('Demo-Daten: Kategorien als Liste (Vorschlag → Druckteil: vorschlaege.test.ts)', async () => {
  const items = (await team.req('GET', '/api/items?all=1')).json as any[];
  assert.ok(items.every((i) => Array.isArray(i.categories) && i.categories.length >= 1), 'jedes Demo-Teil hat mindestens eine Kategorie');
  assert.ok(items.some((i) => i.categories.length > 1), 'ein Demo-Teil zeigt mehrere Kategorien');
});
