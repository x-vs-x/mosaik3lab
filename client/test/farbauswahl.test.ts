// Farbauswahl für mehrfarbige Druckteile (bis 20 Teile): Regeln ohne Browser – Bündeln nach Farbe, nächstes Teil ohne
// Farbe, „Eine Farbe für alle“, Farbfamilien, gemeinsame Farbauswahl beim Anlegen, „Mehrere Teile auf einmal“.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { abweichendeTeile, farbZusammenfassung, nachFarbe } = await import('@mosaik3lab/shared/werte/farbgruppen');
const { eineFarbeFuerAlle, farbenAllerTeile, farbePasst, naechstesTeilOhneFarbe, schonGewaehlt } = await import('../src/features/anfragen/teileFarbwahl.ts');
const { farbfamilie, nachFarbfamilie } = await import('../src/lib/farbfamilie.ts');
const { auswahlBeschreibung, auswahlSchluessel, farbAnzahl, gemeinsameAuswahl, setzeGemeinsame, teileAusText, verschiebe } = await import(
  '../src/features/verwaltung/druckteil-bearbeiten/teileRegeln.ts'
);
const { ersteFehlerstelle } = await import('../src/lib/fokus.ts');

const teil = (i: number, colorId: string, color = colorId, colorHex = '#000000') => ({ areaId: `t${i}`, area: `Teil ${i}`, colorId, color, colorHex });

test('Nach Farbe gebündelt: Reihenfolge wie das erste Auftreten, „Farbe egal“ zuletzt; Zusammenfassung und Abweichungen', () => {
  const teile = [teil(1, 'rot'), teil(2, 'egal', 'Farbe egal', ''), teil(3, 'blau'), teil(4, 'rot'), teil(5, 'blau')];
  const g = nachFarbe(teile);
  assert.deepEqual(g.map((x) => [x.schluessel, x.teile.map((t) => t.area)]), [
    ['rot', ['Teil 1', 'Teil 4']],
    ['blau', ['Teil 3', 'Teil 5']],
    ['egal', ['Teil 2']],
  ]);
  assert.equal(farbZusammenfassung(teile), '5 Teile · 2 Farben · Farbe egal');
  assert.equal(farbZusammenfassung([teil(1, 'rot')]), '1 Teil · 1 Farbe');
  // Ältere Anfragen ohne Farb-ID: Bündeln über den Namen
  assert.equal(nachFarbe([teil(1, '', 'Rot'), teil(2, '', 'rot ')]).length, 1);
  const zweite = [teil(1, 'rot'), teil(2, 'egal', 'Farbe egal', ''), teil(3, 'gelb'), teil(4, 'rot'), teil(5, 'rot')];
  assert.deepEqual(abweichendeTeile(zweite, teile).map((t) => t.area), ['Teil 3', 'Teil 5']);
});

test('20 Teile: Bündeln bleibt kurz (eine Zeile je Farbe)', () => {
  const teile = Array.from({ length: 20 }, (_, i) => teil(i + 1, ['rot', 'blau', 'gelb', 'gruen'][i % 4]));
  assert.equal(nachFarbe(teile).length, 4);
  assert.equal(farbZusammenfassung(teile), '20 Teile · 4 Farben');
});

const rolle = (id: string, colorName: string, hex = '#000000') =>
  ({ id, colorName, brand: 'B', line: 'PLA Basic', hex, herstellerNummer: '', available: true, katalogId: null, herstellerName: '', weggefallen: false }) as never;
const rot = rolle('rot', 'Rot', '#C12E1F');
const blau = rolle('blau', 'Blau', '#0A2989');
const rot2 = rolle('rot-matt', 'Rot', '#DE4343');
const bereich = (id: string, filaments: unknown[]) => ({ area: { id, name: `Teil ${id}`, colors: [] }, filaments }) as never;

test('Nächstes Teil ohne Farbe: nach dem aktuellen weiter, dann von vorn; fertig = undefined', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.equal(naechstesTeilOhneFarbe(ids, {}), 'a');
  assert.equal(naechstesTeilOhneFarbe(ids, { a: 'rot' }, 'a'), 'b');
  assert.equal(naechstesTeilOhneFarbe(ids, { a: 'rot', c: 'rot', d: 'rot' }, 'c'), 'b', 'von vorn weiter');
  assert.equal(naechstesTeilOhneFarbe(ids, { a: 'x', b: 'x', c: 'x' }, 'd'), undefined, 'das aktuelle Teil zählt nicht');
  assert.equal(naechstesTeilOhneFarbe(ids, { a: 'x', b: 'x', c: 'x', d: 'egal' }), undefined, '„Farbe egal“ ist eine Wahl');
});

test('„Eine Farbe für alle Teile“: über den Farbnamen (gleichnamige Rolle je Teil), fehlende Teile bleiben, „Farbe egal“ überall', () => {
  const teile = [bereich('a', [rot, blau]), bereich('b', [rot2]), bereich('c', [blau])];
  const alle = farbenAllerTeile(teile);
  assert.deepEqual(alle.map((f: any) => f.id), ['rot', 'blau'], 'gleichnamige Farben einmal');
  const r = eineFarbeFuerAlle(teile, { c: 'blau' }, 'rot', alle);
  assert.deepEqual(r.colors, { a: 'rot', b: 'rot-matt', c: 'blau' });
  assert.deepEqual(r.fehlt, ['Teil c']);
  assert.deepEqual(eineFarbeFuerAlle(teile, {}, 'egal', alle).colors, { a: 'egal', b: 'egal', c: 'egal' });
  assert.deepEqual(schonGewaehlt(teile, { a: 'blau', b: 'rot-matt', c: 'blau' }).map((f: any) => f.id), ['blau', 'rot-matt']);
});

test('Farbfamilien aus dem Farbwert (Bambu-Farben) und Suche nach Name oder Familie', () => {
  const erwartet: [string, string][] = [
    ['#FFFFFF', 'Weiß, Grau, Schwarz'], ['#000000', 'Weiß, Grau, Schwarz'], ['#5B6579', 'Weiß, Grau, Schwarz'],
    ['#C12E1F', 'Rot & Rosa'], ['#F55A74', 'Rot & Rosa'], ['#FF6A13', 'Orange & Gelb'], ['#F4EE2A', 'Orange & Gelb'],
    ['#00AE42', 'Grün'], ['#BECF00', 'Grün'], ['#0086D6', 'Blau & Türkis'], ['#00B1B7', 'Blau & Türkis'],
    ['#5E43B7', 'Lila & Pink'], ['#EC008C', 'Lila & Pink'], ['#6F5034', 'Braun & Beige'], ['#847D48', 'Braun & Beige'], ['#E8DBB7', 'Braun & Beige'],
  ];
  for (const [hex, fam] of erwartet) assert.equal(farbfamilie(hex), fam, hex);
  assert.deepEqual(nachFarbfamilie([blau, rot, rot2]).map(([f, l]) => [f, l.length]), [['Rot & Rosa', 2], ['Blau & Türkis', 1]]);
  assert.ok(farbePasst(rolle('g', 'Mistelzweig-Grün', '#3F8E43'), 'grun'), 'ohne Umlaut');
  assert.ok(farbePasst(rolle('g', 'Bambusgrün', '#00AE42'), 'Grün'));
  assert.ok(farbePasst(rolle('t', 'Arktisches Flüstern', '#9CDBD9'), 'blau'), 'über die Familie');
  assert.ok(!farbePasst(rot, 'blau'));
});

const f = (id: string, line = 'PLA Basic') => ({ id, colorName: id, brand: 'Bambu Lab', line, hex: '#000000', available: true }) as never;
const fil = [f('a'), f('b'), f('c'), f('m', 'PLA Matte')];
const area = (id: string, a: object) => ({ id, name: id, colors: [], ...a }) as never;

test('Anlegen: gemeinsame Auswahl = die häufigste, bei Gleichstand bleibt die bisherige; Ändern trifft nur Teile ohne eigene', () => {
  const areas = [area('1', { alleFarben: true }), area('2', { colors: ['a', 'b'] }), area('3', { alleFarben: true }), area('4', { colors: ['b', 'a'] }), area('5', { alleFarben: true })];
  assert.deepEqual(gemeinsameAuswahl(areas, fil), { alleFarben: true, colors: [], gruppen: [] });
  assert.equal(auswahlSchluessel(areas[1], fil), auswahlSchluessel(areas[3], fil), 'Reihenfolge egal');
  const neu = setzeGemeinsame(areas, { alleFarben: true, colors: [] }, { colors: [], gruppen: ['linie:Bambu Lab PLA Basic'] }, fil);
  assert.deepEqual(neu.map((a: any) => a.gruppen ?? []), [['linie:Bambu Lab PLA Basic'], [], ['linie:Bambu Lab PLA Basic'], [], ['linie:Bambu Lab PLA Basic']]);
  assert.deepEqual(neu[1].colors, ['a', 'b'], 'eigene Auswahl bleibt');
  // Zwei Teile, eines bekommt eigene Farben: Gleichstand → „gemeinsam“ springt nicht um
  const zwei = [area('x', { alleFarben: true }), area('y', { colors: ['c'] })];
  const key = auswahlSchluessel({ alleFarben: true, colors: [] }, fil);
  assert.equal(auswahlSchluessel(gemeinsameAuswahl(zwei, fil, key), fil), 'alle');
  assert.equal(auswahlSchluessel(gemeinsameAuswahl([zwei[1], zwei[0]], fil, key), fil), 'alle');
  // Gruppe deckt Rollen ab: vom Server eingefüllte Rollen zählen nicht doppelt
  assert.equal(auswahlSchluessel({ colors: ['a', 'b', 'c'], gruppen: ['linie:Bambu Lab PLA Basic'] }, fil), auswahlSchluessel({ colors: [], gruppen: ['linie:Bambu Lab PLA Basic'] }, fil));
  assert.equal(farbAnzahl({ colors: ['m'], gruppen: ['linie:Bambu Lab PLA Basic'] }, fil), 4);
  assert.equal(farbAnzahl({ alleFarben: true, colors: [] }, fil), 4);
  assert.deepEqual(auswahlBeschreibung({ colors: [], gruppen: ['linie:Bambu Lab PLA Basic'] }, fil), { titel: 'Ganze Linie: Bambu Lab PLA Basic', text: '3 Farben, neue kommen automatisch dazu' });
});

test('„Mehrere Teile auf einmal“: ein Teil je Zeile, gleichnamige behalten ID und Farben, Grenzen 20/21, doppelte und zu lange Namen', () => {
  const alt = [area('id-1', { name: 'Grundplatte', colors: ['a'] }), area('id-2', { name: 'Stall', alleFarben: true })];
  const gemeinsam = { alleFarben: true, colors: [], gruppen: [] };
  const r = teileAusText('  Stall \n\ngrundplatte\nDach  mit   Firstkappe\n', alt, gemeinsam);
  assert.equal(r.fehler, undefined);
  assert.deepEqual(r.namen, ['Stall', 'grundplatte', 'Dach mit Firstkappe']);
  assert.deepEqual(r.areas.map((a: any) => a.id.startsWith('teil-') ? 'neu' : a.id), ['id-2', 'id-1', 'neu']);
  assert.deepEqual(r.areas[1].colors, ['a'], 'Farben bleiben');
  assert.equal(r.areas[2].alleFarben, true, 'neues Teil bekommt die gemeinsame Auswahl');
  const zeilen = (n: number) => Array.from({ length: n }, (_, i) => `Teil ${i + 1}`).join('\n');
  assert.equal(teileAusText(zeilen(20), [], gemeinsam).fehler, undefined);
  assert.match(teileAusText(zeilen(21), [], gemeinsam).fehler ?? '', /Höchstens 20 Teile – 21 erkannt/);
  assert.match(teileAusText('A\na', [], gemeinsam).fehler ?? '', /doppelt/);
  assert.match(teileAusText(`A\n${'x'.repeat(41)}`, [], gemeinsam).fehler ?? '', /zu lang/);
  assert.match(teileAusText('Nur eins', [], gemeinsam).fehler ?? '', /mindestens zwei/);
  assert.deepEqual(verschiebe(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(verschiebe(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c'], 'oben bleibt oben');
});

test('Fehler „Farbe fehlt“ führt direkt zum ersten Teil ohne Farbe (Knopf mit data-fehler)', () => {
  const knopf = { matches: () => false, querySelector: () => null, focus() {} };
  let gefragt = '';
  const form = { querySelector: (s: string) => ((gefragt = s), knopf) };
  assert.equal(ersteFehlerstelle(form), knopf);
  assert.ok(gefragt.includes('[data-fehler="true"]') && gefragt.includes('[aria-invalid="true"]'));
});
