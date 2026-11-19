// Verzögertes Speichern der Formular-Entwürfe (lib/entwurfSpeicher.ts → entwurfSchreiber, benutzt von lib/useEntwurf.ts):
// Was kurz vor „Abbrechen“/Schließen getippt wurde, steht im Entwurf (Endprobe vor 1.8.1, Fund F3) – nach „Verwerfen“ und
// nach dem Absenden taucht dagegen nichts wieder auf.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

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

const { entwurfSchluessel, entwurfSchreiber, ladeEntwurf } = await import('../src/lib/entwurfSpeicher.ts');

const KEY = entwurfSchluessel('anfrage', 'u1', 'druckteil-7');
const gespeichert = () => ladeEntwurf<{ classOrTeam: string }>(KEY)?.value.classOrTeam;

beforeEach(() => {
  storage.clear();
  mock.timers.enable({ apis: ['setTimeout'] });
});
afterEach(() => mock.timers.reset());

test('Tippen: gespeichert wird erst nach 0,5 s Pause, und dann der letzte Stand', () => {
  const s = entwurfSchreiber(500);
  for (const text of ['K', 'Kl', 'Klasse 4b']) {
    s.plane(KEY, { classOrTeam: text });
    mock.timers.tick(200);
    assert.equal(gespeichert(), undefined, 'noch in der Wartezeit');
  }
  mock.timers.tick(300);
  assert.equal(gespeichert(), 'Klasse 4b');
});

test('F3: Eingabe direkt vor „Abbrechen“ – beim Schließen wird der ausstehende Stand sofort gespeichert', () => {
  const s = entwurfSchreiber(500);
  s.plane(KEY, { classOrTeam: 'Klasse 4b' });
  mock.timers.tick(1000); // 1 s warten: „Klasse 4b“ ist gespeichert
  assert.equal(gespeichert(), 'Klasse 4b');
  s.plane(KEY, { classOrTeam: 'Team Schnell' });
  mock.timers.tick(100); // sofort „Abbrechen“ (weniger als 0,5 s nach dem Tippen)
  assert.equal(gespeichert(), 'Klasse 4b', 'noch der alte Stand');
  s.sofort(); // Fenster schließt bzw. Seite wird verlassen
  assert.equal(gespeichert(), 'Team Schnell', 'letzte Eingabe steht im Entwurf');
  // Der abgebrochene Timer schreibt später nichts Älteres darüber
  storage.clear();
  mock.timers.tick(5000);
  assert.equal(gespeichert(), undefined);
  s.sofort();
  assert.equal(gespeichert(), undefined, 'nichts mehr ausstehend');
});

test('Nach „Verwerfen“ taucht nichts wieder auf – auch nicht beim Schließen direkt danach', () => {
  const s = entwurfSchreiber(500);
  s.plane(KEY, { classOrTeam: 'Klasse 4b' });
  mock.timers.tick(600);
  s.plane(KEY, { classOrTeam: 'Team Schnell' }); // noch nicht gespeichert
  s.verwerfen(KEY); // „Verwerfen“
  assert.equal(gespeichert(), undefined, 'gespeicherter Entwurf gelöscht');
  s.sofort(); // gleich danach „Abbrechen“
  mock.timers.tick(5000);
  assert.equal(gespeichert(), undefined, 'kein Entwurf');
});

test('Nach dem Absenden bleibt kein Entwurf – auch wenn kurz vorher getippt wurde und das Fenster danach schließt', () => {
  const s = entwurfSchreiber(500);
  s.plane(KEY, { classOrTeam: 'Klasse 4b' });
  mock.timers.tick(100); // Absenden 0,1 s nach der letzten Eingabe
  s.verwerfen(KEY); // erfolgreich gesendet (clear)
  s.sofort(); // Fenster zeigt die Bestätigung bzw. schließt
  mock.timers.tick(5000);
  assert.equal(gespeichert(), undefined);
  assert.equal(storage.length, 0);
  // Die nächste Anfrage beginnt wieder mit einem eigenen Entwurf
  s.plane(KEY, { classOrTeam: 'Klasse 2a' });
  mock.timers.tick(500);
  assert.equal(gespeichert(), 'Klasse 2a');
});

test('Anderer Datensatz: Der ausstehende Stand wird unter seinem eigenen Schlüssel gesichert', () => {
  const s = entwurfSchreiber(500);
  const anderer = entwurfSchluessel('anfrage', 'u1', 'druckteil-8');
  s.plane(KEY, { classOrTeam: 'Klasse 4b' });
  s.sofort(); // Wechsel zu einem anderen Druckteil
  s.plane(anderer, { classOrTeam: 'Klasse 1c' });
  mock.timers.tick(500);
  assert.equal(gespeichert(), 'Klasse 4b');
  assert.equal(ladeEntwurf<{ classOrTeam: string }>(anderer)?.value.classOrTeam, 'Klasse 1c');
});
