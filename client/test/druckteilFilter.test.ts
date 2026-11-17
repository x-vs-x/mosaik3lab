// Filter „Druckteile verwalten“: Ansicht (alle/veröffentlicht/Entwurf) zusammen mit der Suche.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { filtereDruckteile, leseAnsicht, zaehleAnsichten } = await import('../src/features/verwaltung/druckteilFilter.ts');

const teil = (name: string, published: boolean, category = 'Feinmotorik') => ({ name, published, category, material: 'PLA', useAreas: ['Unterricht'] });
const items = [teil('Stifthalter', true), teil('Würfel', false, 'Spiel'), teil('Stiftverdicker', false), teil('Becherhalter', true, 'Alltag')];

test('Ansicht filtert nach veröffentlicht/Entwurf', () => {
  assert.equal(filtereDruckteile(items, '', 'alle').length, 4);
  assert.deepEqual(filtereDruckteile(items, '', 'veroeffentlicht').map((i) => i.name), ['Stifthalter', 'Becherhalter']);
  assert.deepEqual(filtereDruckteile(items, '', 'entwurf').map((i) => i.name), ['Würfel', 'Stiftverdicker']);
});

test('Ansicht und Suche wirken zusammen', () => {
  assert.deepEqual(filtereDruckteile(items, 'stift', 'entwurf').map((i) => i.name), ['Stiftverdicker']);
  assert.deepEqual(filtereDruckteile(items, 'spiel', 'veroeffentlicht'), []);
});

test('Zahlen je Ansicht folgen der Suche', () => {
  assert.deepEqual(zaehleAnsichten(items, ''), { alle: 4, veroeffentlicht: 2, entwurf: 2 });
  assert.deepEqual(zaehleAnsichten(items, 'stift'), { alle: 2, veroeffentlicht: 1, entwurf: 1 });
});

test('Unbekannter Wert in der Adresse wird zu „alle“', () => {
  assert.equal(leseAnsicht(null), 'alle');
  assert.equal(leseAnsicht('entwurf'), 'entwurf');
  assert.equal(leseAnsicht('quatsch'), 'alle');
});
