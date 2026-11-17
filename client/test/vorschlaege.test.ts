// Vorschläge für Marke und Linie der Farbrollen (aus den vorhandenen Farbrollen).
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { eindeutig, linienVorschlaege, markenVorschlaege, passendeVorschlaege } = await import(
  '../src/features/einstellungen/stammdaten/vorschlaege.ts'
);

const rollen = [
  { brand: 'Bambu Lab', line: 'PLA Basic' },
  { brand: 'bambu lab ', line: 'PETG HF' },
  { brand: 'Extrudr', line: 'PLA NX2' },
  { brand: 'Extrudr', line: 'pla basic' },
  { brand: '', line: '' },
  { brand: 'Äpfel-Filament', line: 'TPU' },
];

test('eindeutig, ohne Leere, alphabetisch, Groß-/Kleinschreibung zusammengefasst', () => {
  assert.deepEqual(eindeutig(['b', 'A', ' a ', '', 'B']), ['A', 'b']);
  assert.deepEqual(markenVorschlaege(rollen), ['Äpfel-Filament', 'Bambu Lab', 'Extrudr']);
});

test('Linien der gewählten Marke zuerst, ohne Marke alle', () => {
  assert.deepEqual(linienVorschlaege(rollen, 'BAMBU LAB'), ['PETG HF', 'PLA Basic', 'PLA NX2', 'TPU']);
  assert.deepEqual(linienVorschlaege(rollen, 'Extrudr'), ['pla basic', 'PLA NX2', 'PETG HF', 'TPU']);
  assert.deepEqual(linienVorschlaege(rollen, ''), ['PETG HF', 'PLA Basic', 'PLA NX2', 'TPU']);
});

test('passend zur Eingabe, ohne den eingetragenen Wert, begrenzt', () => {
  const marken = markenVorschlaege(rollen);
  assert.deepEqual(passendeVorschlaege(marken, 'ex'), ['Extrudr']);
  assert.deepEqual(passendeVorschlaege(marken, 'bambu lab'), []);
  assert.equal(passendeVorschlaege(['a', 'b', 'c'], '', 2).length, 2);
});
