import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

// Minimaler localStorage-Ersatz für Node.
class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });

const { ENTWURF_MAX_ALTER_MS, entwurfSchluessel, ladeEntwurf, loescheEntwurf, raeumeAlteEntwuerfeAuf, speichereEntwurf } =
  await import('../src/lib/entwurfSpeicher.ts');

beforeEach(() => storage.clear());

test('Schlüssel enthält Formular, Benutzer und Datensatz – mit Ersatzwerten', () => {
  assert.equal(entwurfSchluessel('druckteil', 'u1', 'i9'), 'mosaik3lab:entwurf:druckteil:u1:i9');
  assert.equal(entwurfSchluessel('vorschlag', undefined, null), 'mosaik3lab:entwurf:vorschlag:gast:neu');
});

test('speichern, laden, löschen', () => {
  const k = entwurfSchluessel('t', 'u', 'x');
  speichereEntwurf(k, { name: 'Becher' }, 1000);
  assert.deepEqual(ladeEntwurf(k, 2000), { savedAt: 1000, value: { name: 'Becher' } });
  loescheEntwurf(k);
  assert.equal(ladeEntwurf(k), null);
});

test('Entwürfe älter als 7 Tage verfallen und werden entfernt', () => {
  const k = entwurfSchluessel('t');
  speichereEntwurf(k, { a: 1 }, 0);
  assert.ok(ladeEntwurf(k, ENTWURF_MAX_ALTER_MS));
  assert.equal(ladeEntwurf(k, ENTWURF_MAX_ALTER_MS + 1), null);
  assert.equal(storage.getItem(k), null);
});

test('Aufräumen entfernt nur abgelaufene eigene Entwürfe', () => {
  speichereEntwurf(entwurfSchluessel('alt'), {}, 0);
  speichereEntwurf(entwurfSchluessel('neu'), {}, ENTWURF_MAX_ALTER_MS);
  storage.setItem('fremd', 'x');
  raeumeAlteEntwuerfeAuf(ENTWURF_MAX_ALTER_MS + 10);
  assert.equal(storage.getItem(entwurfSchluessel('alt')), null);
  assert.ok(storage.getItem(entwurfSchluessel('neu')));
  assert.equal(storage.getItem('fremd'), 'x');
});

test('kaputte Daten und gesperrter Speicher werfen nie', () => {
  const k = entwurfSchluessel('t');
  storage.setItem(k, '{kein json');
  assert.equal(ladeEntwurf(k), null);
  const kaputt = { getItem() { throw new Error('gesperrt'); }, setItem() { throw new Error('voll'); }, removeItem() { throw new Error('x'); }, key() { throw new Error('x'); }, length: 1 };
  Object.defineProperty(globalThis, 'localStorage', { value: kaputt, configurable: true, writable: true });
  try {
    assert.doesNotThrow(() => speichereEntwurf(k, { a: 1 }));
    assert.equal(ladeEntwurf(k), null);
    assert.doesNotThrow(() => loescheEntwurf(k));
    assert.doesNotThrow(() => raeumeAlteEntwuerfeAuf());
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  }
});
