// Kleine Regeln des Anfrageformulars und der Anmeldung, die ohne Browser prüfbar sind.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { aufAngeboteneFarben, itemColorAreas, ohneVorraetigeFarbe } = await import('../src/lib/colors.ts');
const { ersteFehlerstelle } = await import('../src/lib/fokus.ts');
const { verwaltungsStart, zielNachAnmeldung } = await import('../src/lib/anmeldeZiel.ts');

const rolle = (id: string, colorName: string, available = true) =>
  ({ id, colorName, brand: 'B', line: 'L', hex: '#000000', herstellerNummer: '', available, katalogId: null, herstellerName: '', weggefallen: false });
const md = {
  categories: [],
  useAreas: [],
  materials: [],
  orderStatuses: [],
  filaments: [rolle('schwarz-1', 'Schwarz'), rolle('schwarz-2', 'Schwarz'), rolle('blau', 'Blau', false), rolle('rot', 'Rot')],
} as never;

test('Vorlage mit der zweiten gleichnamigen Farbrolle → die angebotene Rolle gleichen Namens ist gewählt', () => {
  const item = { colors: [], colorAreas: [{ id: 'griff', name: 'Griff', colors: ['schwarz-1', 'schwarz-2', 'rot'] }] } as never;
  const areas = itemColorAreas(item, md);
  assert.deepEqual(areas[0].filaments.map((f) => f.id), ['schwarz-1', 'rot'], 'gleichnamige Rolle nur einmal');
  assert.deepEqual(aufAngeboteneFarben(areas, { griff: 'schwarz-2' }, md), { griff: 'schwarz-1' });
  assert.deepEqual(aufAngeboteneFarben(areas, { griff: 'rot' }, md), { griff: 'rot' }, 'angebotene Wahl bleibt');
  assert.deepEqual(aufAngeboteneFarben(areas, { griff: 'egal' }, md), { griff: 'egal' }, '„Farbe egal“ bleibt');
});

test('Druckteil ohne vorrätige Farbe: schon ein leerer Farbbereich reicht (wie im Anfrageformular)', () => {
  const zweiBereiche = { colors: [], colorAreas: [{ id: 'a', name: 'A', colors: ['rot'] }, { id: 'b', name: 'B', colors: ['blau'] }] } as never;
  assert.equal(ohneVorraetigeFarbe(zweiBereiche, md), true);
  const vorraetig = { colors: [], colorAreas: [{ id: 'a', name: 'A', colors: ['rot'] }] } as never;
  assert.equal(ohneVorraetigeFarbe(vorraetig, md), false);
});

/** Winziges Ersatz-DOM: Element mit Tag, Kindern und Fokus-Merker. */
function knoten(tag: string, attrs: Record<string, string> = {}, kinder: ReturnType<typeof knoten>[] = []) {
  const k = {
    tag,
    attrs,
    kinder,
    fokussiert: false,
    matches: (sel: string) => sel === tag,
    querySelector(sel: string): ReturnType<typeof knoten> | null {
      for (const c of kinder) {
        const passt =
          (sel === '[aria-invalid="true"]' && c.attrs['aria-invalid'] === 'true') ||
          (sel === 'input:checked' && c.tag === 'input' && c.attrs.checked === 'true') ||
          (sel.startsWith('input,') && ['input', 'select', 'textarea', 'button'].includes(c.tag));
        if (passt) return c;
        const tiefer = c.querySelector(sel);
        if (tiefer) return tiefer;
      }
      return null;
    },
    focus() {
      k.fokussiert = true;
    },
  };
  return k;
}

test('Fehler in einer Auswahlgruppe (Farbe, Größe): Fokus auf die erste Option statt auf das fieldset', () => {
  const radio1 = knoten('input');
  const radio2 = knoten('input');
  const form = knoten('form', {}, [knoten('fieldset', { 'aria-invalid': 'true' }, [radio1, radio2]), knoten('input', { 'aria-invalid': 'true' })]);
  assert.equal(ersteFehlerstelle(form), radio1);
  radio2.attrs.checked = 'true';
  assert.equal(ersteFehlerstelle(form), radio2, 'gewählte Option bevorzugt');
  const feld = knoten('input', { 'aria-invalid': 'true' });
  assert.equal(ersteFehlerstelle(knoten('form', {}, [feld])), feld, 'einfaches Feld direkt');
  assert.equal(ersteFehlerstelle(knoten('form')), null);
});

test('Nach der Anmeldung: Druck-Team mit Einzelrechten kommt zur angefragten Verwaltungsseite, Lehrkräfte nie', () => {
  const nur = (...p: string[]) => (x: string) => p.includes(x);
  assert.equal(zielNachAnmeldung('/verwaltung/filamente', nur('filaments:manage', 'orders:own')), '/verwaltung/filamente');
  assert.equal(zielNachAnmeldung(undefined, nur('filaments:manage')), '/verwaltung/filamente');
  assert.equal(zielNachAnmeldung(undefined, nur('vorschlaege:sehen', 'catalog:view')), '/verwaltung/vorschlaege');
  assert.equal(zielNachAnmeldung(undefined, nur('dashboard:view', 'orders:view')), '/verwaltung');
  assert.equal(zielNachAnmeldung('/verwaltung', nur('orders:own')), '/katalog', 'Lehrkraft nicht in die Verwaltung');
  assert.equal(zielNachAnmeldung('/anfragen', nur('orders:own')), '/anfragen');
  assert.equal(verwaltungsStart(nur('orders:own', 'vorschlaege:eigene')), undefined);
});
