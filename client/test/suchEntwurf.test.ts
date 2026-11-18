// Suchfeld mit Wert in der Adresse: Zwischenstand, damit bei schnellem Tippen kein Zeichen verloren geht (lib/suchEntwurf.ts),
// und Werte aus shared, die der Client statt eigener Zahlen nutzt (Bildkante, JPEG-Qualität).
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { suchEntwurf, suchEntwurfStart } = await import('../src/lib/suchEntwurf.ts');
const { JPEG_QUALITAET, MAX_KANTE, zielMasse } = await import('../src/lib/bildVerkleinern.ts');
type Stand = ReturnType<typeof suchEntwurfStart>;

const tippe = (s: Stand, text: string) => suchEntwurf(s, { typ: 'tippen', text });
const geschrieben = (s: Stand) => suchEntwurf(s, { typ: 'geschrieben' });
const aussen = (s: Stand, wert: string) => suchEntwurf(s, { typ: 'aussen', wert });

test('Schnelles Tippen: verspätete Stände aus der Adresse überschreiben das Feld nicht („xyzxyz“ bleibt ganz)', () => {
  let s = suchEntwurfStart('');
  let adresse = '';
  // Wie im Browser: Jeder Tastendruck kommt an, die Adresse hinkt hinterher (früher landete nur „xyz“ im Feld).
  for (const [i, zeichen] of [...'xyzxyz'].entries()) {
    s = tippe(s, s.entwurf + zeichen);
    if (i === 2) {
      // Zwischendurch eine Pause: der Stand „xyz“ wird geschrieben …
      adresse = s.ausstehend!;
      s = geschrieben(s);
    }
    if (i === 4) s = aussen(s, adresse); // … und kommt erst an, als schon „xyzxy“ getippt ist
  }
  assert.equal(s.entwurf, 'xyzxyz');
  assert.equal(s.ausstehend, 'xyzxyz', 'wird nach der Pause geschrieben');
  s = geschrieben(s);
  s = aussen(s, 'xyzxyz');
  assert.deepEqual(s, { entwurf: 'xyzxyz', ausstehend: null, aussen: 'xyzxyz' });
});

test('Zurück/Vor und Link mit ?q=: neuer Wert von außen erscheint im Feld', () => {
  let s = suchEntwurfStart('stift');
  s = aussen(s, 'loeffel');
  assert.equal(s.entwurf, 'loeffel', 'Zurück zu einer früheren Suche');
  s = aussen(s, '');
  assert.equal(s.entwurf, '', 'Filter zurücksetzen bzw. Seite ohne ?q=');
  assert.equal(suchEntwurfStart('griff').entwurf, 'griff', 'Aufruf über einen Link mit ?q=griff');
});

test('Eigenes Schreiben kommt an: Feld bleibt, nichts mehr offen; gleicher Wert von außen ändert nichts', () => {
  let s = tippe(suchEntwurfStart(''), 'ab');
  s = geschrieben(s);
  const vorher = s;
  assert.equal(aussen(s, ''), vorher, 'unveränderter Wert von außen → gleicher Stand');
  s = aussen(s, 'ab');
  assert.deepEqual(s, { entwurf: 'ab', ausstehend: null, aussen: 'ab' });
  assert.equal(geschrieben(s), s, 'doppeltes „geschrieben“ ändert nichts');
});

test('Bilder vor dem Hochladen: Kante 2000 px und JPEG-Qualität 0,85 wie bisher (aus shared)', () => {
  assert.equal(MAX_KANTE, 2000);
  assert.equal(JPEG_QUALITAET, 0.85);
  assert.deepEqual(zielMasse(4000, 3000), { breite: 2000, hoehe: 1500 });
});
