// Druckteil-Seite (Konzept A2): gemeinsamer Auswahl-Zustand von Seite und Anfrage-Fenster, Galerie mit Videos, Mitlaufen.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const a = await import('../src/features/anfragen/anfrageAuswahl.ts');
const { pruefeAnfrage, pruefeAuswahl } = await import('../src/features/anfragen/anfragePruefung.ts');
const { medienListe, seitenName } = await import('../src/features/katalog/galerie.ts');
const { passtInsFenster } = await import('../src/features/katalog/useMitlaufen.ts');

const rolle = (id: string, colorName: string, available = true) =>
  ({ id, colorName, brand: 'B', line: 'L', hex: '#112233', herstellerNummer: '', available, katalogId: null, herstellerName: '', weggefallen: false });
const md = {
  categories: [],
  useAreas: [],
  materials: [],
  orderStatuses: [],
  filaments: [rolle('rot', 'Rot'), rolle('blau', 'Blau'), rolle('gelb', 'Gelb'), rolle('leer', 'Grün', false)],
} as never;
const einfarbig = { colors: ['rot', 'blau'], colorAreas: [], sizes: ['S', 'M'] } as never;
const mehrteilig = {
  colors: [],
  colorAreas: [
    { id: 'dach', name: 'Dach', colors: ['rot', 'blau'] },
    { id: 'tor', name: 'Tor', colors: ['gelb'] },
  ],
  sizes: ['A4'],
} as never;

test('Ausgangszustand: 1 Stück, einzige Größe und Bereiche mit nur einer Farbe sind vorgewählt', () => {
  const b = a.farbbereiche(mehrteilig, md);
  assert.equal(b.multiColor, true);
  const s = a.startAuswahl(b.areas, ['A4'], md);
  assert.deepEqual(s, { rows: [{ quantity: 1, colors: { tor: 'gelb' } }], size: 'A4', custom: {} });
  assert.equal(a.startAuswahl(a.farbbereiche(einfarbig, md).areas, ['S', 'M'], md).size, '', 'mehrere Größen: nichts vorgewählt');
});

test('Vorbelegung aus „Erneut anfragen“: Stückzahlen, Größe und Personalisierung übernommen', () => {
  const b = a.farbbereiche(mehrteilig, md);
  const template = {
    variants: [
      { quantity: 2, colors: { dach: 'rot' } },
      { quantity: 3, colors: { dach: 'blau', tor: 'gelb' } },
    ],
    size: 'A4',
    personalization: { name: '4b' },
  } as never;
  const s = a.startAuswahl(b.areas, ['A4'], md, template);
  assert.deepEqual(s.rows, [
    { quantity: 2, colors: { dach: 'rot', tor: 'gelb' } },
    { quantity: 3, colors: { dach: 'blau', tor: 'gelb' } },
  ]);
  assert.equal(a.gesamtStueck(s), 5);
  assert.deepEqual(s.custom, { name: '4b' });
});

test('Auswahl der Seite landet unverändert im Fenster (ein Zustand) und besteht dieselbe Prüfung', () => {
  const b = a.farbbereiche(einfarbig, md);
  let s = a.startAuswahl(b.areas, ['S', 'M'], md);
  // Auf der Seite gewählt: Farbe, Größe, Personalisierung, Anzahl
  s = a.setzeZeile(s, 0, { colors: { farbe: 'blau' } });
  s = a.setzeZeile(s, 0, { quantity: 4 });
  s = { ...s, size: 'M', custom: { text: 'Klasse 4b' } };
  const auswahl = {
    rows: s.rows,
    bereiche: b.areas.map((x) => x.area.id),
    leereBereiche: [],
    farbFehlerSchluessel: a.farbFehlerSchluessel(b.multiColor),
    customFields: [{ id: 'text', label: 'Text', type: 'text', required: true, maxLength: 20, options: [], hint: '' }] as never,
    custom: s.custom,
    sizes: ['S', 'M'],
    size: s.size,
  };
  assert.deepEqual(pruefeAuswahl(auswahl), {});
  // Im Fenster kommen nur noch E-Mail und Klasse dazu
  assert.deepEqual(Object.keys(pruefeAnfrage({ ...auswahl, email: '', angemeldet: false, domains: [], classOrTeam: '' })).sort(), ['classOrTeam', 'requesterEmail']);
  // Fehlende Größe/Farbe/Pflichtfeld meldet dieselbe Regel schon auf der Seite
  assert.deepEqual(Object.keys(pruefeAuswahl({ ...auswahl, rows: [{ quantity: 1, colors: {} }], size: '', custom: {} })).sort(), ['color', 'custom.text', 'size']);
});

test('„Weitere Stückzahl“ hängt an dieselbe Auswahl an: mehrteilig mit den Farben der letzten Zeile', () => {
  const b = a.farbbereiche(mehrteilig, md);
  let s = a.setzeZeile(a.startAuswahl(b.areas, ['A4'], md), 0, { quantity: 3, colors: { dach: 'blau', tor: 'gelb' } });
  s = { ...s, custom: { name: 'X' } };
  const mit = a.weitereStueckzahl(s, b.areas, true);
  assert.deepEqual(mit.rows[1], { quantity: 1, colors: { dach: 'blau', tor: 'gelb' } });
  assert.equal(a.gesamtStueck(mit), 4);
  assert.deepEqual(mit.custom, { name: 'X' }, 'Personalisierung bleibt');
  assert.equal(mit.size, 'A4', 'Größe bleibt');
  assert.notEqual(mit.rows[1].colors, mit.rows[0].colors, 'eigene Kopie der Farben');
  // Fehler der zweiten Zeile haben den Schlüssel variants.1.… (zeigt das Fenster, nicht die Seite)
  const leer = a.setzeZeile(mit, 1, { colors: {} });
  const f = pruefeAuswahl({ rows: leer.rows, bereiche: ['dach', 'tor'], leereBereiche: [], farbFehlerSchluessel: a.farbFehlerSchluessel(true), customFields: [], custom: {}, sizes: [], size: '' });
  assert.deepEqual(Object.keys(f).sort(), ['variants.1.color.dach', 'variants.1.color.tor']);
  // Entfernen: nie die erste Zeile
  assert.equal(a.entferneStueckzahl(mit, 1).rows.length, 1);
  assert.equal(a.entferneStueckzahl(mit, 0), mit);
});

test('„Weitere Farbe“ einfarbig startet ohne Farbe; Einzelfarben werden nachträglich ergänzt', () => {
  const b = a.farbbereiche(einfarbig, md);
  const s = a.setzeZeile(a.startAuswahl(b.areas, [], md), 0, { colors: { farbe: 'rot' } });
  assert.deepEqual(a.weitereStueckzahl(s, b.areas, false).rows[1], { quantity: 1, colors: {} });
  // Farbrollen erst später geladen: Start ohne Bereiche, dann ergänzen
  const ohne = a.startAuswahl([], ['A4'], md);
  const mt = a.farbbereiche(mehrteilig, md);
  assert.deepEqual(a.ergaenzeEinzelfarben(ohne, mt.areas).rows[0].colors, { tor: 'gelb' });
  const fertig = a.ergaenzeEinzelfarben(ohne, mt.areas);
  assert.equal(a.ergaenzeEinzelfarben(fertig, mt.areas), fertig, 'nichts zu tun → dasselbe Objekt');
  assert.deepEqual(a.ergaenzeEinzelfarben(a.setzeZeile(ohne, 0, { colors: { tor: 'egal' } }), mt.areas).rows[0].colors, { tor: 'egal' }, 'eigene Wahl bleibt');
});

test('Farben einer Zeile für die Zusammenfassung im Fenster', () => {
  const b = a.farbbereiche(mehrteilig, md);
  assert.deepEqual(a.teilFarben(b.areas, { dach: 'blau', tor: 'egal' }), [
    { areaId: 'dach', area: 'Dach', colorId: 'blau', color: 'Blau', colorHex: '#112233' },
    { areaId: 'tor', area: 'Tor', colorId: 'egal', color: 'Farbe egal', colorHex: '' },
  ]);
  assert.deepEqual(a.teilFarben(b.areas, {}), []);
});

test('Druckteil mit leerem Farbbereich: als leer erkannt, die Prüfung meldet ihn', () => {
  const b = a.farbbereiche({ colors: [], colorAreas: [{ id: 'x', name: 'X', colors: ['leer'] }, { id: 'y', name: 'Y', colors: ['rot'] }] } as never, md);
  assert.deepEqual(b.emptyAreas.map((x) => x.area.id), ['x']);
  const f = pruefeAuswahl({ rows: [{ quantity: 1, colors: { y: 'rot' } }], bereiche: ['y'], leereBereiche: ['x'], farbFehlerSchluessel: a.farbFehlerSchluessel(true), customFields: [], custom: {}, sizes: [], size: '' });
  assert.deepEqual(Object.keys(f), ['color.x']);
});

test('Galerie: erst Bilder, dann Videos (Datei und Link); ohne Bilder vorn das Symbolbild', () => {
  const datei = { id: 'v1', file: 'a.mp4', url: '' };
  const link = { id: 'v2', file: '', url: 'https://www.youtube.com/watch?v=x' };
  const kaputt = { id: 'v3', file: '', url: '' };
  assert.deepEqual(
    medienListe(2, [datei, link, kaputt]).map((m) => (m.art === 'bild' ? `b${m.index}` : m.video.id)),
    ['b0', 'b1', 'v1', 'v2'],
  );
  assert.deepEqual(medienListe(0, [datei]).map((m) => m.art), ['bild', 'video']);
  assert.equal(medienListe(0).length, 1);
  assert.equal(seitenName(link.url), 'youtube.com');
  assert.equal(seitenName('https://vimeo.com/123'), 'vimeo.com');
  assert.equal(seitenName('kein link'), 'externer Seite');
});

test('Rechte Spalte läuft nur mit, wenn sie samt Abständen ins Fenster passt', () => {
  assert.equal(passtInsFenster(700, 768, true), true);
  assert.equal(passtInsFenster(740, 768, true), false);
  assert.equal(passtInsFenster(1000, 1180, false), true, 'iPad hoch: Kopf- und Fußleiste abgezogen');
  assert.equal(passtInsFenster(1100, 1180, false), false);
});
