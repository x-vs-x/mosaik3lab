// Tests für das frühe Aufgeben beim Warten auf die Web-App (lib/startwache.mjs) – reine Funktion, keine Dienste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startAbbruch, MAX_ABSTUERZE } from '../lib/startwache.mjs';

const seit = Date.parse('2026-11-16T10:00:00Z');
const nach = (s) => new Date(seit + s * 1000).toISOString();

test('ohne Zustandsdatei oder mit unbrauchbarem Inhalt: weiter warten', () => {
  assert.equal(startAbbruch(null, { seit }), null);
  assert.equal(startAbbruch({}, { seit }), null);
  assert.equal(startAbbruch({ restarts: 9, startedAt: 'kaputt' }, { seit }), null);
});

test('langsamer, aber normaler Start (Raspberry Pi): nie aufgeben', () => {
  for (const phase of ['starting', 'building', 'running']) assert.equal(startAbbruch({ phase, startedAt: nach(5) }, { seit }), null);
  // ein einzelner Absturz (z. B. Port kurz noch belegt) ist noch kein Grund
  assert.equal(startAbbruch({ phase: 'restarting', restarts: 1, lastError: 'Code 1', startedAt: nach(2) }, { seit }), null);
  assert.equal(startAbbruch({ phase: 'restarting', restarts: MAX_ABSTUERZE - 1, startedAt: nach(2) }, { seit }), null);
});

test('Zustand von vor dem Start (alte Version) zählt nicht', () => {
  assert.equal(startAbbruch({ phase: 'restarting', restarts: 10, startedAt: nach(-30) }, { seit }), null);
});

test('neue Version stürzt immer wieder ab: aufgeben mit Grund', () => {
  const grund = startAbbruch({ phase: 'restarting', restarts: MAX_ABSTUERZE, lastError: 'Web-App unerwartet beendet (Code 3).', startedAt: nach(1) }, { seit });
  assert.match(grund, /4-mal hintereinander beendet/);
  assert.match(grund, /\(Web-App unerwartet beendet \(Code 3\)\)$/); // ohne doppelten Punkt in der Meldung
  assert.ok(startAbbruch({ restarts: 7, startedAt: nach(1) }, { seit }));
});
