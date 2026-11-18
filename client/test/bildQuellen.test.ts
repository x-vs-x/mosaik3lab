// Größenwahl der Druckteil-Bilder: welche Fassung (mini 240, karte 720, Original) der Browser über srcset/sizes angeboten bekommt.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { bildQuellen, bildUrl, STANDARD_SIZES } = await import('../src/lib/bildQuellen.ts');
const F = '01a1e9a9-8855-738c-9f90-88a10fdf340a.jpg';

test('Adressen: Vorschaubilder per ?groesse=, Original ohne', () => {
  assert.equal(bildUrl(F, 'original'), `/api/files/images/${F}`);
  assert.equal(bildUrl(F, 'karte'), `/api/files/images/${F}?groesse=karte`);
  assert.equal(bildUrl(F, 'mini'), `/api/files/images/${F}?groesse=mini`);
});

test('Katalogkarte: karte als src, Auswahl nur zwischen mini und karte – nie das große Original (auch nicht auf Retina)', () => {
  const q = bildQuellen(F, 'karte');
  assert.equal(q.src, bildUrl(F, 'karte'));
  assert.equal(q.srcSet, `${bildUrl(F, 'mini')} 240w, ${bildUrl(F, 'karte')} 720w`);
  assert.equal(q.sizes, STANDARD_SIZES.karte);
  assert.ok(!q.srcSet.includes(`${F} `), 'Original nicht angeboten');
});

test('Kleine Vorschau (Ähnliche Druckteile, Listen): mini als src, eigene Anzeigebreite', () => {
  const q = bildQuellen(F, 'mini', '80px');
  assert.equal(q.src, bildUrl(F, 'mini'));
  assert.match(q.srcSet, /groesse=mini 240w/);
  assert.equal(q.sizes, '80px');
});

test('Galerie: Original als src, auf kleinen Bildschirmen reicht karte', () => {
  const q = bildQuellen(F, 'original');
  assert.equal(q.src, bildUrl(F, 'original'));
  assert.equal(q.srcSet, `${bildUrl(F, 'karte')} 720w, ${bildUrl(F, 'original')} 2000w`);
});
