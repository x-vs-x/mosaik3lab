// Herunterladen ohne Wegnavigieren: Teilen-Menü nur auf iOS, Dateiname aus Content-Disposition, Fehlermeldungen.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { dateinameAus, fehlertext, istIOS, waehleWeg } = await import('../src/lib/herunterladen.ts');

const IPAD_ALT = 'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPADOS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

test('iOS erkennen – auch iPadOS, das sich als Mac ausgibt', () => {
  assert.equal(istIOS(IPAD_ALT, 5), true);
  assert.equal(istIOS(IPADOS, 5), true);
  assert.equal(istIOS(IPHONE, 5), true);
  assert.equal(istIOS(IPADOS, 0), false, 'echter Mac ohne Touch');
  assert.equal(istIOS(WINDOWS, 10), false);
});

test('teilen nur auf iOS mit Datei-Teilen, sonst herunterladen', () => {
  assert.equal(waehleWeg({ userAgent: IPADOS, maxTouchPoints: 5, kannDateiTeilen: true }), 'teilen');
  assert.equal(waehleWeg({ userAgent: IPHONE, maxTouchPoints: 5, kannDateiTeilen: true }), 'teilen');
  assert.equal(waehleWeg({ userAgent: IPHONE, maxTouchPoints: 5, kannDateiTeilen: false }), 'herunterladen');
  // Windows-Chrome und Android können Dateien teilen – dort soll trotzdem normal heruntergeladen werden.
  assert.equal(waehleWeg({ userAgent: WINDOWS, maxTouchPoints: 0, kannDateiTeilen: true }), 'herunterladen');
  assert.equal(waehleWeg({ userAgent: ANDROID, maxTouchPoints: 5, kannDateiTeilen: true }), 'herunterladen');
});

test('Dateiname aus Content-Disposition', () => {
  assert.equal(dateinameAus('attachment; filename="mosaik3lab-2026.json"', 'x.json'), 'mosaik3lab-2026.json');
  assert.equal(dateinameAus("attachment; filename=\"Halter.stl\"; filename*=UTF-8''St%C3%BCtze%20gro%C3%9F.stl", 'x'), 'Stütze groß.stl');
  assert.equal(dateinameAus('attachment; filename=plain.3mf', 'x'), 'plain.3mf');
  assert.equal(dateinameAus(null, 'ersatz.json'), 'ersatz.json');
  assert.equal(dateinameAus('attachment', 'ersatz.json'), 'ersatz.json');
});

test('verständliche Fehlermeldungen', () => {
  assert.equal(fehlertext(413), 'Die Datei ist zu groß. Bitte weniger auf einmal herunterladen.');
  assert.match(fehlertext(0), /nicht erreichbar/);
  assert.equal(fehlertext(400, 'Höchstens 200 Druckteile'), 'Höchstens 200 Druckteile');
});
