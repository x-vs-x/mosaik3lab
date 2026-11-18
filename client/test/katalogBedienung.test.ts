import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

// Minimaler sessionStorage-Ersatz für Node.
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
Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true, writable: true });

const { KATALOG_SEITE, kommtVomDruckteil, ladeAnzahl, ladePosition, meldeSeitenwechsel, merkeAnzahl, merkePosition, naechsteAnzahl, sollPositionWiederherstellen } =
  await import('../src/features/katalog/katalogScroll.ts');
const { blaettern, wischRichtung } = await import('../src/features/katalog/galerie.ts');

beforeEach(() => storage.clear());

test('Scrollposition je Katalog-Adresse merken und laden', () => {
  merkePosition('', 1200.4);
  merkePosition('?kategorie=Alltag', 300);
  assert.equal(ladePosition(''), 1200);
  assert.equal(ladePosition('?kategorie=Alltag'), 300);
  assert.equal(ladePosition('?q=Stift'), null);
  storage.setItem('mosaik3lab:katalog-scroll:?kaputt', 'abc');
  assert.equal(ladePosition('?kaputt'), null);
});

test('Wiederherstellen bei Zurück und nach dem Druckteil, sonst nicht', () => {
  assert.equal(kommtVomDruckteil('/katalog/abc123'), true);
  assert.equal(kommtVomDruckteil('/katalog'), false);
  assert.equal(kommtVomDruckteil('/konto'), false);
  assert.equal(sollPositionWiederherstellen('POP', '/konto'), true);
  assert.equal(sollPositionWiederherstellen('PUSH', '/katalog/abc123'), true);
  assert.equal(sollPositionWiederherstellen('PUSH', '/konto'), false);
  assert.equal(sollPositionWiederherstellen('PUSH', undefined), false);

  meldeSeitenwechsel('/katalog');
  meldeSeitenwechsel('/katalog/abc123');
  meldeSeitenwechsel('/katalog');
  assert.equal(sollPositionWiederherstellen('PUSH'), true);
  meldeSeitenwechsel('/konto');
  meldeSeitenwechsel('/katalog');
  assert.equal(sollPositionWiederherstellen('PUSH'), false);
});

test('Anzahl angezeigter Druckteile je Adresse merken, mindestens eine Seite', () => {
  assert.equal(KATALOG_SEITE, 50);
  assert.equal(ladeAnzahl(''), 50); // nichts gemerkt
  merkeAnzahl('', 150);
  merkeAnzahl('?kategorie=Alltag', 100);
  assert.equal(ladeAnzahl(''), 150);
  assert.equal(ladeAnzahl('?kategorie=Alltag'), 100);
  assert.equal(ladeAnzahl('?q=Stift'), 50);
  merkeAnzahl('?wenig', 3);
  assert.equal(ladeAnzahl('?wenig'), 50);
  storage.setItem('mosaik3lab:katalog-anzahl:?kaputt', 'abc');
  assert.equal(ladeAnzahl('?kaputt'), 50);
  // Position und Anzahl gehören zusammen: Wer weit unten war, bekommt beides zurück.
  merkePosition('', 18800);
  assert.deepEqual([ladePosition(''), ladeAnzahl('')], [18800, 150]);
});

test('Nachladen: je 50 mehr, höchstens alle', () => {
  assert.equal(naechsteAnzahl(50, 137), 100);
  assert.equal(naechsteAnzahl(100, 137), 137);
  assert.equal(naechsteAnzahl(137, 137), 137);
  assert.equal(naechsteAnzahl(50, 20), 20);
});

test('Bilder blättern geht am Ende von vorn weiter', () => {
  assert.equal(blaettern(0, 3, 1), 1);
  assert.equal(blaettern(2, 3, 1), 0);
  assert.equal(blaettern(0, 3, -1), 2);
  assert.equal(blaettern(0, 0, 1), 0);
});

test('Wischen: waagerecht wechselt, senkrecht und kurz nicht', () => {
  assert.equal(wischRichtung(-80, 10), 1); // nach links → nächstes Bild
  assert.equal(wischRichtung(80, -10), -1); // nach rechts → vorheriges Bild
  assert.equal(wischRichtung(-20, 0), 0); // zu kurz
  assert.equal(wischRichtung(-60, 90), 0); // eher Scrollen
});
