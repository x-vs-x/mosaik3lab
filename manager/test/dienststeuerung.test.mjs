// Windows-Dienste starten/stoppen (platform/windows.mjs dienstSteuern): „sc.exe stop“ kehrt sofort zurück – der Stopp muss
// auf das wirkliche Ende warten, und ein Start während STOP_PENDING darf nicht als „läuft schon“ durchgehen.
// Reiner Test mit nachgestelltem sc.exe: keine Dienste, keine Dateien, läuft auf jedem System.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dienstSteuern } from '../platform/windows.mjs';

const ID = 'mosaik3lab-webapp';
const query = (z, name) => ({ code: 0, stdout: `SERVICE_NAME: ${ID}\n        TYPE               : 10  WIN32_OWN_PROCESS\n        STATE              : ${z}  ${name}\n` });
const Q = { gestoppt: query(1, 'STOPPED'), endet: query(3, 'STOP_PENDING'), laeuft: query(4, 'RUNNING') };
const fehler = (nr) => ({ code: nr, stdout: `[SC] FEHLER ${nr}:` });

/** Nachgestelltes sc.exe: antworten = { start: […], stop: […], query: […] } – je Aufruf die nächste Antwort (die letzte bleibt). */
function scMit(antworten) {
  const aufrufe = [];
  const pausen = [];
  const sc = async ([was]) => {
    aufrufe.push(was);
    const liste = antworten[was] ?? [];
    return liste.length > 1 ? liste.shift() : (liste[0] ?? { code: 1, stdout: '' });
  };
  return { aufrufe, pausen, opts: { sc, sleep: async (ms) => void pausen.push(ms), waitMs: 2000, pauseMs: 500 } };
}

test('Stopp wartet, bis der Dienst wirklich beendet ist', async () => {
  const s = scMit({ stop: [{ code: 0, stdout: '' }], query: [Q.endet, Q.endet, Q.gestoppt] });
  assert.equal(await dienstSteuern(ID, 'stop', s.opts), true);
  assert.deepEqual(s.aufrufe, ['stop', 'query', 'query', 'query']);
  assert.equal(s.pausen.length, 2, 'zweimal gewartet');
});

test('Stopp: endet der Dienst nicht in der Wartezeit → false (Aufrufer nimmt den Admin-Weg)', async () => {
  const s = scMit({ stop: [{ code: 0, stdout: '' }], query: [Q.endet] });
  assert.equal(await dienstSteuern(ID, 'stop', s.opts), false);
  assert.equal(s.pausen.length, 4, 'nicht länger als waitMs gewartet');
});

test('Stopp: läuft nicht (1062) → sofort in Ordnung; keine Rechte (5) → false; endet schon (1061) → abwarten', async () => {
  const a = scMit({ stop: [fehler(1062)] });
  assert.equal(await dienstSteuern(ID, 'stop', a.opts), true);
  assert.deepEqual(a.aufrufe, ['stop']);

  const b = scMit({ stop: [fehler(5)], query: [Q.laeuft] });
  assert.equal(await dienstSteuern(ID, 'stop', b.opts), false);

  const c = scMit({ stop: [fehler(1061)], query: [Q.endet, Q.gestoppt] });
  assert.equal(await dienstSteuern(ID, 'stop', c.opts), true);
  assert.deepEqual(c.aufrufe, ['stop', 'query', 'query']);
});

test('Start während der Dienst noch endet: erst das Ende abwarten, dann erneut starten (1056 ist dann kein Erfolg)', async () => {
  const s = scMit({ start: [fehler(1056), { code: 0, stdout: '' }], query: [Q.endet, Q.endet, Q.gestoppt] });
  assert.equal(await dienstSteuern(ID, 'start', s.opts), true);
  assert.deepEqual(s.aufrufe, ['start', 'query', 'query', 'query', 'start'], 'zweiter Start nach dem Ende');
});

test('Start: läuft schon (1056, RUNNING) → in Ordnung, kein zweiter Start; anderer Fehler → false', async () => {
  const a = scMit({ start: [fehler(1056)], query: [Q.laeuft] });
  assert.equal(await dienstSteuern(ID, 'start', a.opts), true);
  assert.deepEqual(a.aufrufe, ['start', 'query']);

  const b = scMit({ start: [fehler(5)] });
  assert.equal(await dienstSteuern(ID, 'start', b.opts), false);
  assert.deepEqual(b.aufrufe, ['start']);

  const c = scMit({ start: [{ code: 0, stdout: '' }] });
  assert.equal(await dienstSteuern(ID, 'start', c.opts), true);
  assert.deepEqual(c.aufrufe, ['start']);
});

test('Zustand nicht abfragbar: wie früher, ohne Warten', async () => {
  const s = scMit({ stop: [{ code: 0, stdout: '' }] }); // query: Code 1, keine Ausgabe
  assert.equal(await dienstSteuern(ID, 'stop', s.opts), true);
  assert.deepEqual(s.pausen, []);
});
