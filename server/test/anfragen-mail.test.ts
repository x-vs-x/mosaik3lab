// Benachrichtigungs-Mail zu Anfragen: Aufbau ohne Server und ohne Versand (reine Vorlage).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOrderMail, orderChanges, sampleOrder } from '../src/module/anfragen/anfragen.mail';
import type { Order, OrderColorChoice } from '../src/domain/types';

const choice = (colorId: string, color: string, colorHex: string, area = 'Körper'): OrderColorChoice => ({ areaId: area, area, colorId, color, colorHex });
const blau = choice('f-blau', 'Blau', '#0A2CA5');
const gelb = choice('f-gelb', 'Gelb', '#F4D53F');
const filaments = [{ id: 'f-blau', name: 'Blau', brand: 'Bambu Lab', line: 'PLA Basic', hex: '#0A2CA5' }] as any;
const settings = { appBaseUrl: 'http://schule.test/mosaik3lab/' };

const order = (o: Partial<Order> = {}): Order => ({
  ...sampleOrder(),
  id: 'o1', number: 'ANF-2026-0042', itemId: 'i1', itemName: 'Kabelhalter', quantity: 7,
  color: '3 × Blau, 4 × Gelb', colorId: 'f-blau', colorHex: '#0A2CA5', colorChoices: [blau],
  colorVariants: [{ quantity: 3, colorChoices: [blau] }, { quantity: 4, colorChoices: [gelb] }],
  size: 'M', classOrTeam: 'Klasse 7b', customization: 'Bis Freitag', personalization: [],
  requesterEmail: 'm.muster@schule.test', requesterName: 'm.muster@schule.test', isDemo: false,
  ...o,
});

test('Betreff und Kurzfassung: Menge × Druckteil, Farben, Größe, Klasse – auch als Preheader', () => {
  const m = buildOrderMail(order(), { id: 'i1' } as any, settings, filaments);
  assert.equal(m.subject, 'Neue Anfrage ANF-2026-0042 – 7 × Kabelhalter');
  assert.match(m.text, /^NEUE ANFRAGE ANF-2026-0042\n\n7 × Kabelhalter\n3 × Blau, 4 × Gelb · Größe M · Klasse 7b\n/);
  assert.ok(m.html.includes('3 × Blau, 4 × Gelb · Größe M · Klasse 7b'));
  // Preheader: unsichtbar, ganz am Anfang des Body.
  assert.match(m.html, /<body[^>]*>\s*<div style="display:none;[^"]*">7 × Kabelhalter – 3 × Blau, 4 × Gelb – Größe M – Klasse 7b/);
  // Links ohne doppelten Schrägstrich, Button als Tabelle (Outlook).
  assert.ok(m.html.includes('href="http://schule.test/mosaik3lab/verwaltung/bestellungen?offen=o1"'));
  assert.ok(m.html.includes('http://schule.test/mosaik3lab/verwaltung/hilfsmittel/i1'));
  assert.ok(!/<link|<img|url\(/.test(m.html), 'kein externes CSS, keine Bilder');
});

test('Mehrere Farben: eine Zeile je Variante mit Rolle des Filaments und Farbfeld', () => {
  const m = buildOrderMail(order(), null, settings, filaments);
  assert.match(m.text, /Farbe \(3 Stück\): +Blau \(Bambu Lab PLA Basic\)/);
  assert.match(m.text, /Farbe \(4 Stück\): +Gelb\b/);
  assert.ok(m.html.includes('background-color:#0A2CA5') && m.html.includes('background-color:#F4D53F'));
});

test('„Farbe egal“ wird hervorgehoben – einzeln, je Farbbereich und als Variante', () => {
  const egal = choice('egal', 'Farbe egal', '');
  const single = buildOrderMail(order({ color: 'Farbe egal', colorId: 'egal', colorHex: '', colorChoices: [egal], colorVariants: [] }), null, settings);
  assert.match(single.text, /Farbe: +Farbe egal – Team wählt die Farbe/);
  assert.ok(single.html.includes('>Farbe egal</span> <span style="color:#57534e;font-size:13px">Team wählt die Farbe'));
  const areas = buildOrderMail(order({ colorChoices: [choice('egal', 'Farbe egal', '', 'Lineal'), choice('f-gelb', 'Gelb', '#F4D53F', 'Griff')], colorVariants: [] }), null, settings);
  assert.match(areas.text, /Farbe Lineal: +Farbe egal – Team wählt/);
  assert.match(areas.text, /Farbe Griff: +Gelb$/m);
  const variants = buildOrderMail(sampleOrder(), null, settings);
  assert.match(variants.text, /Farbe \(2 Stück\): +Farbe egal – Team wählt/);
});

test('Leere Angaben fehlen statt „—“', () => {
  const m = buildOrderMail(
    order({ size: '', customization: '  ', personalization: [{ fieldId: 'p', label: 'Beschriftung', value: '' }, { fieldId: 'q', label: 'Höhe', value: '12' }] }),
    null,
    settings,
  );
  for (const part of [m.text, m.html]) {
    assert.ok(!part.includes('—  ') && !part.includes('>—<'), 'kein Platzhalter');
    assert.ok(!part.includes('Größe') && !part.includes('Bemerkungen') && !part.includes('Beschriftung'));
    assert.ok(part.includes('Höhe'));
  }
  assert.ok(m.text.includes('3 × Blau, 4 × Gelb · Klasse 7b'), 'Kurzfassung ohne leere Größe');
});

test('Reply-To = Lehrkraft, nur bei gültiger Adresse', () => {
  assert.equal(buildOrderMail(order(), null, settings).replyTo, 'm.muster@schule.test');
  assert.ok(buildOrderMail(order(), null, settings).text.includes('Mit „Antworten“ schreiben Sie direkt an die Lehrkraft.'));
  for (const bad of ['', 'kaputt', 'a@b.de\nBcc: x@y.de', 'x@y.de, z@w.de']) {
    const m = buildOrderMail(order({ requesterEmail: bad }), null, settings);
    assert.equal(m.replyTo, undefined, bad);
    assert.ok(!m.text.includes('„Antworten“'));
  }
});

test('Escaping: Eingaben der Lehrkraft erscheinen nie als HTML', () => {
  const m = buildOrderMail(
    order({ itemName: 'Teil <b>', classOrTeam: '"7b"&', customization: '<script>x</script>\nZeile 2', personalization: [{ fieldId: 'p', label: '<i>', value: "'v'" }] }),
    null,
    settings,
  );
  assert.ok(!m.html.includes('<script>') && !m.html.includes('<b>') && !m.html.includes('<i>'));
  assert.ok(m.html.includes('&lt;script&gt;x&lt;/script&gt;<br>Zeile 2'));
  assert.ok(m.html.includes('&quot;7b&quot;&amp;') && m.html.includes('&#39;v&#39;'));
  assert.ok(!/[\r\n]/.test(m.subject));
});

test('Geänderte Anfrage: deutlich gekennzeichnet, mit Liste der Änderungen und markierten Zeilen', () => {
  const before = order({ personalization: [{ fieldId: 'p', label: 'Beschriftung', value: '7b' }] });
  const after = order({
    quantity: 8, color: '4 × Blau, 4 × Gelb',
    colorVariants: [{ quantity: 4, colorChoices: [blau] }, { quantity: 4, colorChoices: [gelb] }],
    customization: '', personalization: [{ fieldId: 'p', label: 'Beschriftung', value: '7b' }],
  });
  assert.deepEqual(
    orderChanges(before, after).map((c) => [c.label, c.before, c.after]),
    [['Menge', '7 Stück', '8 Stück'], ['Farben', '3 × Blau, 4 × Gelb', '4 × Blau, 4 × Gelb'], ['Bemerkungen', 'Bis Freitag', '']],
  );
  const m = buildOrderMail(after, null, settings, [], { previous: before });
  assert.equal(m.subject, 'Geänderte Anfrage ANF-2026-0042 – 8 × Kabelhalter');
  assert.ok(m.text.startsWith('GEÄNDERTE ANFRAGE ANF-2026-0042'));
  assert.ok(m.text.includes('Was hat sich geändert?\n- Menge: 7 Stück → 8 Stück\n- Farben: 3 × Blau, 4 × Gelb → 4 × Blau, 4 × Gelb\n- Bemerkungen: Bis Freitag → (leer)'));
  assert.match(m.text, /Menge: +8 Stück {2}\[geändert\]/);
  assert.doesNotMatch(m.text, /Beschriftung:.*\[geändert\]/);
  assert.ok(m.html.includes('Was hat sich geändert?') && m.html.includes('>geändert</span>'));
  assert.match(m.html, /<div style="display:none;[^"]*">Geändert: Menge, Farben, Bemerkungen – 8 × Kabelhalter/);
  // Ohne inhaltliche Änderung trotzdem als geändert gekennzeichnet, mit Hinweis.
  const same = buildOrderMail(before, null, settings, [], { previous: before });
  assert.ok(same.subject.startsWith('Geänderte Anfrage') && same.text.includes('ohne Angaben zu ändern'));
});

test('Testmail-Beispiel zeigt mehrere Farben, „Farbe egal“ und ist klar als Test erkennbar', () => {
  const m = buildOrderMail(sampleOrder(), null, { appBaseUrl: '' }, [], { notice: 'Testnachricht: nur ein Beispiel.' });
  assert.ok(m.text.startsWith('*** Testnachricht: nur ein Beispiel. ***'));
  assert.ok(m.html.includes('Testnachricht: nur ein Beispiel.'));
  assert.match(m.subject, /^Neue Anfrage ANF-\d{4}-0000 – 7 × Beispiel-Druckteil \(Test\)$/);
  for (const t of ['Farbe (3 Stück)', 'Türkis', 'Farbe (2 Stück)', 'Gelb', 'Farbe egal', 'Beschriftung', 'keine echte Anfrage']) assert.ok(m.text.includes(t), t);
  assert.ok(m.text.includes('keine Adresse der App hinterlegt'), 'Hinweis ohne App-Adresse');
  assert.equal(m.replyTo, undefined, 'Beispielanfrage: keine Antworten an die Fantasieadresse');
  assert.ok(!m.text.includes('„Antworten“') && m.html.includes('mailto:lehrkraft@example.org'));
});
