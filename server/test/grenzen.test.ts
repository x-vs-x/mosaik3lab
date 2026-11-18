// Gemeinsame Werte und Verträge in shared/ (Code-Hygiene D1–D9): Die Zahlen stehen jetzt an einer Stelle. Dieser Test hält
// die bisherigen Werte fest – ändert jemand eine Grenze, muss er es hier bewusst nachziehen.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderInputSchema, STATUS_CATALOG, type StatusId } from '@mosaik3lab/shared/anfragen';
import { emailEingabeSchema, identifySchema, passwortVergessenSchema } from '@mosaik3lab/shared/konten';
import { importAusfuehrenSchema, MAX_EXPORT_AUSWAHL } from '@mosaik3lab/shared/datenaustausch';
import { farbeZuordnenSchema, itemInputSchema, MAX_COLOR_AREAS, MAX_CUSTOM_FIELDS } from '@mosaik3lab/shared/katalog';
import { HEX_FARBE, masterDataSchemas } from '@mosaik3lab/shared/stammdaten';
import { proposalInputSchema } from '@mosaik3lab/shared/vorschlaege';
import { BILD_BREITE, JPEG_QUALITAET_ORIGINAL, VORSCHAU_GROESSEN } from '@mosaik3lab/shared/werte/bilder';
import * as dateien from '@mosaik3lab/shared/werte/dateien';
import { MAX_ORDER_VARIANTS, ORDER_CLASS_MAX, ORDER_CUSTOMIZATION_MAX } from '@mosaik3lab/shared/werte/anfragen';
import * as vorschlag from '@mosaik3lab/shared/werte/vorschlaege';
import { istVorschauGroesse, ORIGINAL_MAX_KANTE, QUALITAET_ORIGINAL, VORSCHAU, vorschauRel } from '../src/kern/bilder/groessen';
import * as uploads from '../src/kern/uploads';

const MB = 1024 * 1024;

test('Bildgrößen wie vorher: Original 2000 px, karte 1080, mini 360, Ordner mit Breite, JPEG-Qualität 85', () => {
  assert.deepEqual(BILD_BREITE, { mini: 360, karte: 1080, original: 2000 });
  assert.equal(ORIGINAL_MAX_KANTE, 2000);
  assert.deepEqual(VORSCHAU, { karte: { breite: 1080, ordner: 'karte-1080' }, mini: { breite: 360, ordner: 'mini-360' } });
  assert.deepEqual([...VORSCHAU_GROESSEN], ['karte', 'mini'], 'Reihenfolge wie bisher (Bildpflege erzeugt karte zuerst)');
  assert.equal(vorschauRel('karte', 'abc'), 'vorschau/karte-1080/abc.jpg');
  assert.equal(QUALITAET_ORIGINAL, 85);
  assert.equal(JPEG_QUALITAET_ORIGINAL, 85);
  assert.ok(istVorschauGroesse('karte') && istVorschauGroesse('mini'));
  for (const v of ['original', 'gross', '', 'toString', 'constructor', undefined, 1]) assert.equal(istVorschauGroesse(v), false, String(v));
});

test('Upload-Grenzen wie vorher und im Server dieselben Werte wie in shared', () => {
  assert.equal(dateien.MAX_IMAGE_BYTES, 5 * MB);
  assert.equal(dateien.MAX_MODEL_BYTES, 50 * MB);
  assert.equal(dateien.MAX_VIDEO_BYTES, 50 * MB);
  assert.equal(dateien.MAX_IMAGES_PER_ITEM, 8);
  assert.equal(dateien.MAX_MODELS_PER_ITEM, 10);
  assert.equal(dateien.MAX_VIDEOS_PER_ITEM, 4);
  for (const k of ['MAX_IMAGE_BYTES', 'MAX_MODEL_BYTES', 'MAX_VIDEO_BYTES', 'MAX_IMAGES_PER_ITEM', 'MAX_MODELS_PER_ITEM', 'MAX_VIDEOS_PER_ITEM'] as const) {
    assert.equal(uploads[k], dateien[k], k);
  }
  assert.equal(uploads.MAX_MODELS_PER_REQUEST, 5);
  assert.equal(dateien.mbText(dateien.MAX_IMAGE_BYTES), '5 MB');
  assert.equal(dateien.mbText(dateien.MAX_MODEL_BYTES), '50 MB');
});

const farbe = (id: string) => ({ id: '', name: `Bereich ${id}`, colors: ['f1'] });
const feld = (i: number) => ({ label: `Feld ${i}`, type: 'text' as const });
const teil = (extra: object) => ({
  name: 'Griff',
  shortDescription: 'Ein kurzer Text',
  categories: ['Alltag'],
  material: 'PLA',
  printTimeMinutes: 30,
  colorAreas: [farbe('a')],
  ...extra,
});

test('Druckteil: höchstens 20 Farbbereiche (Teile) und 10 Personalisierungsfelder (benannte Grenzen)', () => {
  assert.equal(MAX_COLOR_AREAS, 20);
  assert.equal(MAX_CUSTOM_FIELDS, 10);
  const bereiche = (n: number) => Array.from({ length: n }, (_, i) => farbe(String(i)));
  const felder = (n: number) => Array.from({ length: n }, (_, i) => feld(i));
  assert.equal(itemInputSchema.safeParse(teil({ colorAreas: bereiche(20) })).success, true);
  assert.equal(itemInputSchema.safeParse(teil({ colorAreas: bereiche(21) })).success, false);
  // „Farbe zuordnen“ (Stammdaten) darf ebenso alle 20 Teile eines Druckteils treffen
  const ziel = (n: number) => ({ filamentId: 'f1', ziele: [{ itemId: 'i1', bereiche: Array.from({ length: n }, (_, i) => `b${i}`) }] });
  assert.equal(farbeZuordnenSchema.safeParse(ziel(20)).success, true);
  assert.equal(farbeZuordnenSchema.safeParse(ziel(21)).success, false);
  // Anfrage: Farbe je Teil für alle 20 Teile (Schema erlaubt seit 1.6.3 bis 20)
  const mitFarben = (n: number) => ({
    itemId: 'i1', quantity: 1, requesterEmail: 'l@schule.example', classOrTeam: '3b',
    colors: Object.fromEntries(Array.from({ length: n }, (_, i) => [`b${i}`, 'f1'])),
  });
  assert.equal(orderInputSchema.safeParse(mitFarben(20)).success, true);
  assert.equal(orderInputSchema.safeParse(mitFarben(21)).success, false);
  assert.equal(itemInputSchema.safeParse(teil({ customFields: felder(10) })).success, true);
  assert.equal(itemInputSchema.safeParse(teil({ customFields: felder(11) })).success, false);
});

const anfrage = (extra: object) => ({ itemId: 'i1', quantity: 1, colors: { a: 'f1' }, requesterEmail: 'l@schule.example', classOrTeam: '3b', ...extra });

test('Anfrage: höchstens 10 Farbvarianten, Klasse 60 und Wünsche 1000 Zeichen', () => {
  assert.equal(MAX_ORDER_VARIANTS, 10);
  assert.equal(ORDER_CLASS_MAX, 60);
  assert.equal(ORDER_CUSTOMIZATION_MAX, 1000);
  const varianten = (n: number) => Array.from({ length: n }, () => ({ quantity: 1, colors: { a: 'f1' } }));
  assert.equal(orderInputSchema.safeParse(anfrage({ variants: varianten(10) })).success, true);
  assert.equal(orderInputSchema.safeParse(anfrage({ variants: varianten(11) })).success, false);
  assert.equal(orderInputSchema.safeParse(anfrage({ classOrTeam: 'x'.repeat(60) })).success, true);
  assert.equal(orderInputSchema.safeParse(anfrage({ classOrTeam: 'x'.repeat(61) })).success, false);
  assert.equal(orderInputSchema.safeParse(anfrage({ customization: 'x'.repeat(1000) })).success, true);
  assert.equal(orderInputSchema.safeParse(anfrage({ customization: 'x'.repeat(1001) })).success, false);
});

test('Vorschlag: Titel 3–100, Beschreibung 10–3000, Einsatz bis 1000, Menge 1–100 (wie vorher)', () => {
  assert.deepEqual(
    [vorschlag.PROPOSAL_TITLE_MIN, vorschlag.PROPOSAL_TITLE_MAX, vorschlag.PROPOSAL_DESC_MIN, vorschlag.PROPOSAL_DESC_MAX, vorschlag.PROPOSAL_USAGE_MAX, vorschlag.MAX_PROPOSAL_QUANTITY],
    [3, 100, 10, 3000, 1000, 100],
  );
  const ok = { title: 'abc', description: 'x'.repeat(10) };
  const gueltig = (extra: object) => proposalInputSchema.safeParse({ ...ok, ...extra }).success;
  assert.equal(gueltig({}), true);
  assert.equal(gueltig({ title: 'ab' }), false);
  assert.equal(gueltig({ title: 'x'.repeat(101) }), false);
  assert.equal(gueltig({ description: 'x'.repeat(9) }), false);
  assert.equal(gueltig({ description: 'x'.repeat(3001) }), false);
  assert.equal(gueltig({ usage: 'x'.repeat(1000) }), true);
  assert.equal(gueltig({ usage: 'x'.repeat(1001) }), false);
  assert.equal(gueltig({ quantity: 100 }), true);
  assert.equal(gueltig({ quantity: 101 }), false);
  assert.equal(gueltig({ quantity: 0 }), false);
});

test('Farbwert #RRGGBB: gleiche Regel im Schema und im Client (HEX_FARBE)', () => {
  for (const h of ['#00B1B7', '#ffffff']) assert.ok(HEX_FARBE.test(h), h);
  for (const h of ['00B1B7', '#FFF', '#GGGGGG', '#00B1B7 ', '#00B1B70']) assert.ok(!HEX_FARBE.test(h), h);
  const rolle = (hex: string) => masterDataSchemas.filaments.safeParse([{ id: '', colorName: 'Blau', hex }]);
  assert.equal(rolle('#00b1b7').success, true);
  assert.equal(rolle('#00b1b7').data?.[0].hex, '#00B1B7', 'wird groß geschrieben');
  assert.equal(rolle('#FFF').success, false);
});

test('Datenaustausch: Teil-Export höchstens 200, Ausführen nur mit gültiger Vorschau-ID', () => {
  assert.equal(MAX_EXPORT_AUSWAHL, 200);
  const id = 'a'.repeat(32);
  assert.deepEqual(importAusfuehrenSchema.parse({ importId: id }), { importId: id, modus: 'ueberspringen' });
  assert.equal(importAusfuehrenSchema.parse({ importId: id, modus: 'ersetzen' }).modus, 'ersetzen');
  assert.equal(importAusfuehrenSchema.safeParse({ importId: id, modus: 'loeschen' }).success, false);
  const falsch = importAusfuehrenSchema.safeParse({ importId: 'zu-kurz' });
  assert.equal(falsch.success, false);
  assert.match(falsch.error!.issues[0].message, /Vorschau ist abgelaufen/);
});

test('E-Mail-Rumpf: ein Schema für Anmeldung, Passwort vergessen und Personen-Aktionen', () => {
  assert.equal(identifySchema, emailEingabeSchema);
  assert.equal(passwortVergessenSchema, emailEingabeSchema);
  assert.deepEqual(emailEingabeSchema.parse({ email: ' Max@Schule.Example ' }), { email: 'max@schule.example' });
  assert.equal(emailEingabeSchema.safeParse({ email: 'keine-adresse' }).success, false);
});

test('Status-IDs: feste Liste wie bisher (StatusId daraus abgeleitet)', () => {
  const ids: StatusId[] = STATUS_CATALOG.map((s) => s.id);
  assert.deepEqual(ids, ['offen', 'in_pruefung', 'in_druck', 'gedruckt', 'abholbereit', 'uebergeben', 'abgelehnt', 'storniert']);
  assert.equal(STATUS_CATALOG.filter((s) => s.required).map((s) => s.id).join(), 'offen');
});
