import assert from 'node:assert/strict';
import { test } from 'node:test';

// Stabilität im Client: automatisches Neuladen nach fehlgeschlagenem Nachladen, Hochladen mit Stillstands-Wächter
// und Abbrechen, Abbruch alter Anfragen.

const { automatischNeuLadenErlaubt, istNachladeFehler, NEU_LADEN_SPERRE_MS } = await import('../src/lib/neuLaden.ts');

class Speicher {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}

test('Nachladefehler: einmal automatisch neu laden, dann eine Minute lang nicht (keine Schleife)', () => {
  const s = new Speicher();
  assert.equal(automatischNeuLadenErlaubt(s, 1_000_000), true);
  assert.equal(automatischNeuLadenErlaubt(s, 1_000_000 + 5_000), false);
  assert.equal(automatischNeuLadenErlaubt(s, 1_000_000 + NEU_LADEN_SPERRE_MS - 1), false);
  assert.equal(automatischNeuLadenErlaubt(s, 1_000_000 + NEU_LADEN_SPERRE_MS + 1), true);
});

test('Nachladefehler: ohne nutzbaren Speicher (Safari privat) nie automatisch neu laden', () => {
  assert.equal(automatischNeuLadenErlaubt(undefined), false);
  const kaputt = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.equal(automatischNeuLadenErlaubt(kaputt), false);
  const vergisst = { getItem: () => null, setItem: () => {} }; // Schreiben „klappt“, bleibt aber nicht
  assert.equal(automatischNeuLadenErlaubt(vergisst), false);
});

test('Nachladefehler der Browser werden erkannt', () => {
  assert.equal(istNachladeFehler(new TypeError('Failed to fetch dynamically imported module: http://x/assets/a.js')), true);
  assert.equal(istNachladeFehler(new TypeError('Importing a module script failed.')), true); // Safari
  assert.equal(istNachladeFehler(new Error('Unable to preload CSS for /assets/a.css')), true);
  assert.equal(istNachladeFehler(new Error('x is undefined')), false);
});

// --- Hochladen: Ersatz für XMLHttpRequest ---------------------------------------------------------------------
class FakeXhr {
  static letzter: FakeXhr;
  upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void; onload?: () => void } = {};
  onerror?: () => void;
  onabort?: () => void;
  onload?: () => void;
  status = 0;
  responseText = '';
  withCredentials = false;
  abgebrochen = false;
  gesendet = false;
  url = '';
  constructor() { FakeXhr.letzter = this; }
  open(_m: string, url: string) { this.url = url; }
  setRequestHeader() {}
  send() { this.gesendet = true; }
  abort() { this.abgebrochen = true; this.onabort?.(); }
  antworte(status: number, body: unknown) { this.status = status; this.responseText = JSON.stringify(body); this.onload?.(); }
}
Object.defineProperty(globalThis, 'XMLHttpRequest', { value: FakeXhr, configurable: true, writable: true });
const { apiUpload, onUnauthorized, UPLOAD_ABGEBROCHEN } = await import('../src/lib/api.ts');
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('Hochladen: Fortschritt ohne NaN, Erfolg liefert die Antwort', async () => {
  const anteile: number[] = [];
  const p = apiUpload<{ ok: boolean }>('/x', new FormData(), (a) => anteile.push(a));
  const x = FakeXhr.letzter;
  assert.equal(x.url, '/api/x');
  x.upload.onprogress?.({ lengthComputable: false, loaded: 5, total: 0 });
  x.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
  x.upload.onload?.();
  x.antworte(200, { ok: true });
  assert.deepEqual(await p, { ok: true });
  assert.deepEqual(anteile, [0.5, 1]);
});

test('Hochladen: bleibt es stehen, wird abgebrochen (Stillstands-Wächter)', async () => {
  const p = apiUpload('/x', new FormData(), undefined, { stillstandMs: 40 });
  const x = FakeXhr.letzter;
  await warte(20);
  x.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 10 }); // Fortschritt setzt den Wächter zurück
  await warte(25);
  assert.equal(x.abgebrochen, false);
  await assert.rejects(p, (e: Error) => /stehen geblieben/.test(e.message));
  assert.equal(x.abgebrochen, true);
});

test('Hochladen: nach dem Übertragen wartet der Wächter nicht mehr (Server rechnet noch)', async () => {
  const p = apiUpload<{ ok: boolean }>('/x', new FormData(), undefined, { stillstandMs: 20 });
  const x = FakeXhr.letzter;
  x.upload.onload?.();
  await warte(40);
  assert.equal(x.abgebrochen, false);
  x.antworte(200, { ok: true });
  assert.deepEqual(await p, { ok: true });
});

test('Hochladen: „Abbrechen“ bricht ab, 401 meldet abgelaufene Sitzung', async () => {
  const ctrl = new AbortController();
  const p = apiUpload('/x', new FormData(), undefined, { signal: ctrl.signal });
  ctrl.abort();
  await assert.rejects(p, (e: Error) => e.message === UPLOAD_ABGEBROCHEN);
  assert.equal(FakeXhr.letzter.abgebrochen, true);

  let abgemeldet = false;
  onUnauthorized(() => (abgemeldet = true));
  const q = apiUpload('/x', new FormData());
  FakeXhr.letzter.antworte(401, { error: 'Bitte anmelden.' });
  await assert.rejects(q, (e: Error) => e.message === 'Bitte anmelden.');
  assert.equal(abgemeldet, true);
});

test('api(): Abbruch von außen beendet die Anfrage (alte Suche)', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((_u: string, init: RequestInit) =>
    new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('abgebrochen', 'AbortError'))))) as typeof fetch;
  try {
    const { api, ApiError } = await import('../src/lib/api.ts');
    const ctrl = new AbortController();
    const p = api('/items?q=a', { signal: ctrl.signal });
    ctrl.abort();
    await assert.rejects(p, (e: unknown) => e instanceof ApiError && e.status === 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('shared/werte: ohne zod, und die bisherigen Dateien exportieren alles wieder (Server-Importe bleiben gültig)', async () => {
  const { existsSync, readFileSync, readdirSync } = await import('node:fs');
  const ordner = new URL('../../shared/src/werte/', import.meta.url);
  for (const datei of readdirSync(ordner)) {
    const text = readFileSync(new URL(datei, ordner), 'utf8');
    assert.doesNotMatch(text, /from ['"](zod|\.\.\/)/, `${datei} darf weder zod noch Schema-Dateien laden`);
    const bereich = datei.replace(/\.ts$/, '');
    // Reine Werte ohne Schema (bilder, dateien) haben keine Schema-Datei daneben – dort gibt es nichts wieder zu exportieren.
    if (!existsSync(new URL(`../${datei}`, ordner))) continue;
    const werte = await import(`@mosaik3lab/shared/werte/${bereich}`);
    const alt = await import(`@mosaik3lab/shared/${bereich}`);
    for (const [name, wert] of Object.entries(werte)) assert.equal(alt[name], wert, `${bereich}: ${name} fehlt in der alten Datei`);
  }
});

test('Video-Upload: über apiUpload (Wächter, Abbrechen) mit Fortschrittsanzeige wie bei Bildern', async () => {
  const { uploadStatus } = await import('../src/features/verwaltung/druckteil-bearbeiten/FilePicker.tsx');
  assert.equal(uploadStatus('videos', null), '');
  assert.equal(uploadStatus('videos', 0.42), 'Wird hochgeladen … 42 %');
  assert.equal(uploadStatus('videos', 1), 'Wird gespeichert … bitte warten');
  const { readFileSync } = await import('node:fs');
  const quelle = readFileSync(new URL('../src/features/verwaltung/druckteil-bearbeiten/VideosEditor.tsx', import.meta.url), 'utf8');
  assert.match(quelle, /apiUpload<Item>\(`\/items\/\$\{item\.id\}\/videos`, fd, setAnteil, \{ signal: ctrl\.signal \}\)/);
  assert.match(quelle, /onAbbrechen=/);
  assert.doesNotMatch(quelle, /form: fd/, 'kein Upload mehr über api() ohne Zeitgrenze');
});

test('Alter Tab nach einem Update: Hinweis nur bei echter anderer Versionsnummer, Prüfung höchstens einmal je Minute', async () => {
  const { andereVersion, versionPruefungFaellig, VERSION_PRUEF_ABSTAND_MS } = await import('../src/lib/versionPruefung.ts');
  assert.equal(andereVersion('1.8.0', '1.8.1'), true);
  assert.equal(andereVersion('1.8.1', '1.8.1'), false);
  assert.equal(andereVersion('Entwicklung', '1.8.1'), false, 'Entwicklungsmodus: nie');
  assert.equal(andereVersion('1.8.0', undefined), false, 'keine Antwort: kein Hinweis');
  assert.equal(andereVersion('1.8.0', 'unbekannt'), false);
  assert.equal(andereVersion('1.8.0', '1.8.1-dev.abc123'), true);
  assert.equal(versionPruefungFaellig(0, 5), true, 'erste Prüfung sofort');
  assert.equal(versionPruefungFaellig(1000, 1000 + VERSION_PRUEF_ABSTAND_MS - 1), false);
  assert.equal(versionPruefungFaellig(1000, 1000 + VERSION_PRUEF_ABSTAND_MS), true);
  assert.equal(versionPruefungFaellig(5000, 1000), true, 'Uhr zurückgestellt: nicht für immer sperren');
});
