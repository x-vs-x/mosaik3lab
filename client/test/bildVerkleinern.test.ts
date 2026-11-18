// Bilder verkleinern: wann verkleinert wird, Zielmaße, Format und wann das Original bleibt.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { ausgabeTyp, bildVerkleinern, ergebnisNehmen, hatTransparenz, KLEIN_BYTES, neuerName, sollVerkleinern, zielMasse } = await import(
  '../src/lib/bildVerkleinern.ts'
);

test('nur JPG/PNG/WebP über der Kleingrenze werden verkleinert, GIF nie', () => {
  assert.equal(sollVerkleinern('image/jpeg', 3_000_000), true);
  assert.equal(sollVerkleinern('image/png', 3_000_000), true);
  assert.equal(sollVerkleinern('image/webp', 3_000_000), true);
  assert.equal(sollVerkleinern('image/gif', 3_000_000), false, 'GIF (evtl. animiert) bleibt');
  assert.equal(sollVerkleinern('', 3_000_000), false, 'unbekannter Typ bleibt');
  assert.equal(sollVerkleinern('image/jpeg', KLEIN_BYTES), false, 'schon kleine Bilder bleiben');
});

test('Zielmaße: längste Kante 2000 px, Seitenverhältnis bleibt, nie vergrößern', () => {
  assert.deepEqual(zielMasse(4000, 3000), { breite: 2000, hoehe: 1500 });
  assert.deepEqual(zielMasse(3024, 4032), { breite: 1500, hoehe: 2000 }, 'Hochformat');
  assert.deepEqual(zielMasse(1200, 800), { breite: 1200, hoehe: 800 });
  assert.deepEqual(zielMasse(10000, 10), { breite: 2000, hoehe: 2 });
});

test('Format: Transparenz → PNG, sonst JPEG; Name bekommt die passende Endung', () => {
  assert.equal(ausgabeTyp(true), 'image/png');
  assert.equal(ausgabeTyp(false), 'image/jpeg');
  assert.equal(neuerName('Foto vom Teil.png', 'image/jpeg'), 'Foto vom Teil.jpg');
  assert.equal(neuerName('bild.JPEG', 'image/jpeg'), 'bild.jpg');
  assert.equal(neuerName('logo.webp', 'image/png'), 'logo.png');
  assert.equal(neuerName('ohne-endung', 'image/jpeg'), 'ohne-endung.jpg');
});

test('Transparenz erkennen', () => {
  assert.equal(hatTransparenz(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255])), false);
  assert.equal(hatTransparenz(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 254])), true);
});

test('Ergebnis nur, wenn kleiner (beim Bestand: deutlich kleiner)', () => {
  assert.equal(ergebnisNehmen(1000, 999), true);
  assert.equal(ergebnisNehmen(1000, 1000), false, 'nicht kleiner → Original');
  assert.equal(ergebnisNehmen(1000, 1200), false);
  assert.equal(ergebnisNehmen(1000, 0), false, 'leeres Ergebnis nie');
  assert.equal(ergebnisNehmen(1000, 850, 0.2), false, 'nur 15 % kleiner reicht beim Bestand nicht');
  assert.equal(ergebnisNehmen(1000, 700, 0.2), true);
});

test('ohne Canvas (z. B. alter Browser) oder bei kleinen/GIF-Dateien kommt das Original zurück', async () => {
  const gif = new File([new Uint8Array(KLEIN_BYTES + 10)], 'a.gif', { type: 'image/gif' });
  assert.equal(await bildVerkleinern(gif), gif);
  const klein = new File([new Uint8Array(100)], 'a.jpg', { type: 'image/jpeg' });
  assert.equal(await bildVerkleinern(klein), klein);
  const gross = new File([new Uint8Array(KLEIN_BYTES + 10)], 'a.jpg', { type: 'image/jpeg' });
  assert.equal(await bildVerkleinern(gross), gross, 'in Node gibt es kein createImageBitmap');
});
