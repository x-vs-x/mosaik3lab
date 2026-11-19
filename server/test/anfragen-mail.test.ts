// Benachrichtigungs-Mail zu Anfragen: Aufbau ohne Server und ohne Versand (reine Vorlage).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOrderMail, orderChanges, sampleOrder } from '../src/module/anfragen/anfragen.mail';
import type { Order, OrderColorChoice } from '@mosaik3lab/shared/anfragen';

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
  // Nach Farbe gebündelt, „Farbe egal“ zuletzt
  assert.match(areas.text, /Farbe \(1 Teil\): +Gelb – Griff\nFarbe \(1 Teil\): +Farbe egal – Team wählt die Farbe – Lineal$/m);
  const variants = buildOrderMail(sampleOrder(), null, settings);
  assert.match(variants.text, /Farbe \(2 Stück\): +Farbe egal – Team wählt/);
});

test('20 Teile: Mail nach Farbe gebündelt (eine Zeile je Farbe mit ihren Teilen), Kurzfassung „20 Teile · 3 Farben“', () => {
  const rot = { id: 'f-rot', colorName: 'Rot', brand: 'Bambu Lab', line: 'PLA Basic', hex: '#C12E1F', herstellerNummer: '10200' };
  const fil = [...filaments, rot] as any;
  const farbeVon = (i: number) => (i % 3 === 0 ? ['f-rot', 'Rot', '#C12E1F'] : i % 3 === 1 ? ['f-blau', 'Blau', '#0A2CA5'] : ['f-gelb', 'Gelb', '#F4D53F']);
  const teile = Array.from({ length: 20 }, (_, i) => {
    const [id, name, hex] = farbeVon(i);
    return { areaId: `t${i}`, area: `Teil ${i + 1}`, colorId: id, color: name, colorHex: hex };
  });
  const m = buildOrderMail(order({ quantity: 2, color: teile.map((t) => `${t.area}: ${t.color}`).join('; '), colorChoices: teile, colorVariants: [] }), null, settings, fil);
  assert.match(m.text, /^2 × Kabelhalter\n20 Teile · 3 Farben · Größe M · Klasse 7b\n/m, 'Kurzfassung statt 20 „Teil: Farbe“');
  assert.match(m.text, /Teile: +20 Teile · 3 Farben/);
  // Reihenfolge wie das erste Auftreten (Rot, Blau, Gelb), je Farbe alle Teile
  const rotZeile = m.text.split('\n').find((z) => z.startsWith('Farbe (7 Teile):'));
  assert.ok(rotZeile?.includes('Rot (') && rotZeile.endsWith('– Teil 1; Teil 4; Teil 7; Teil 10; Teil 13; Teil 16; Teil 19'), rotZeile);
  assert.ok(m.text.indexOf('Farbe (7 Teile)') < m.text.indexOf('Blau (Bambu Lab PLA Basic) – Teil 2;'));
  assert.equal(m.text.match(/^Farbe \(/gm)?.length, 3, 'drei Farbzeilen statt 20');
  assert.ok(m.html.includes('Teil 1; Teil 4; Teil 7') && m.html.includes('background-color:#C12E1F'));
  // Zwei Stückzahlen mit je 20 Teilen: Überschrift je Variante, darunter nach Farbe
  const v2 = teile.map((t, i) => (i < 2 ? { ...t, colorId: 'f-gelb', color: 'Gelb', colorHex: '#F4D53F' } : t));
  const mv = buildOrderMail(order({ quantity: 5, colorChoices: teile, colorVariants: [{ quantity: 3, colorChoices: teile }, { quantity: 2, colorChoices: v2 }] }), null, settings, fil);
  assert.match(mv.text, /Variante 1: +3 Stück · 20 Teile · 3 Farben/);
  assert.match(mv.text, /Variante 2: +2 Stück · 20 Teile · 3 Farben/);
  assert.match(mv.text, /\n3 × 20 Teile · 3 Farben, 2 × 20 Teile · 3 Farben · Größe M/);
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

test('Geänderte Anfrage mit vielen Teilen: genannt werden nur die Teile, deren Farbe sich geändert hat', () => {
  const teil = (i: number, farbe: string): OrderColorChoice => ({ areaId: `t${i}`, area: `Teil ${i + 1}`, colorId: `f-${farbe.toLowerCase()}`, color: farbe, colorHex: '' });
  const mitTeilen = (teile: OrderColorChoice[], o: Partial<Order> = {}) => order({ colorVariants: [], colorChoices: teile, color: teile.map((t) => `${t.area}: ${t.color}`).join('; '), ...o });
  const vorher = Array.from({ length: 20 }, (_, i) => teil(i, i % 2 ? 'Blau' : 'Rot'));
  const jetzt = vorher.map((t, i) => (i === 1 ? teil(i, 'Gelb') : i === 6 ? teil(i, 'Grün') : t));
  assert.deepEqual(
    orderChanges(mitTeilen(vorher), mitTeilen(jetzt)).map((c) => [c.label, c.before, c.after]),
    [['Farbe', 'Teil 2: Blau; Teil 7: Rot', 'Teil 2: Gelb; Teil 7: Grün']],
    'nicht alle 20 Teile zweimal',
  );
  const m = buildOrderMail(mitTeilen(jetzt), null, settings, [], { previous: mitTeilen(vorher) });
  assert.ok(m.text.includes('- Farbe: Teil 2: Blau; Teil 7: Rot → Teil 2: Gelb; Teil 7: Grün'), m.text);
  assert.match(m.text, /Teile: +20 Teile · 4 Farben {2}\[geändert\]/, 'die Angaben darunter bleiben vollständig');
  // Alle Teile geändert, andere Teile-Liste (Druckteil inzwischen umgebaut) oder mehrere Stückzahlen: wie bisher der ganze Text.
  const alle = vorher.map((_, i) => teil(i, 'Gelb'));
  assert.equal(orderChanges(mitTeilen(vorher), mitTeilen(alle))[0].after, mitTeilen(alle).color);
  const umgebaut = [...jetzt.slice(0, 19), { ...teil(19, 'Blau'), areaId: 'neu', area: 'Neues Teil' }];
  assert.equal(orderChanges(mitTeilen(vorher), mitTeilen(umgebaut))[0].before, mitTeilen(vorher).color);
  const zweiStueckzahlen = mitTeilen(jetzt, { color: '1 × (…), 1 × (…)', colorVariants: [{ quantity: 1, colorChoices: vorher }, { quantity: 1, colorChoices: jetzt }] });
  assert.deepEqual(orderChanges(mitTeilen(vorher), zweiStueckzahlen).map((c) => [c.label, c.before]), [['Farben', mitTeilen(vorher).color]]);
  // Nur der Teilename wurde am Druckteil geändert (Farben gleich): weiter als Änderung sichtbar, mit ganzem Text.
  const umbenannt = vorher.map((t, i) => (i === 0 ? { ...t, area: 'Dach' } : t));
  assert.equal(orderChanges(mitTeilen(vorher), mitTeilen(umbenannt))[0].after, mitTeilen(umbenannt).color);
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
