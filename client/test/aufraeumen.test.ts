// Reine Hilfen aus dem Aufräumen des Clients (Code-Hygiene 2026-11): Anfrage-Prüfung, Farbanzeige, Suchparameter,
// Fehlertext, „Meine Anfragen“-Regel, Datumsformat.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { pruefeAnfrage, emailDomainAllowed, domainHint, normalizeDomain } = await import('../src/features/anfragen/anfragePruefung.ts');
const { farbAnzeige } = await import('../src/features/anfragen/farbAnzeige.ts');
const { darfMeineAnfragen } = await import('../src/features/anfragen/zugang.ts');
const { mitParametern } = await import('../src/lib/suchParameter.ts');
const { ApiError, fehlerText } = await import('../src/lib/api.ts');
const { formatDate, formatTime } = await import('../src/lib/format.ts');

const basis = {
  email: 'frau.beispiel@schule.example',
  angemeldet: false,
  domains: ['schule.example'],
  classOrTeam: '5a',
  rows: [{ quantity: 2, colors: { griff: 'rot' } }],
  bereiche: ['griff'],
  leereBereiche: [] as string[],
  farbFehlerSchluessel: (id: string, row = 0) => (row ? `variants.${row}.` : '') + `color.${id}`,
  customFields: [] as never[],
  custom: {},
  sizes: [] as string[],
  size: '',
};

test('Anfrage-Prüfung: vollständige Anfrage hat keine Fehler', () => {
  assert.deepEqual(pruefeAnfrage(basis), {});
});

test('Anfrage-Prüfung: E-Mail fehlt, ungültig oder mit fremder Domain (nur ohne Anmeldung)', () => {
  assert.equal(pruefeAnfrage({ ...basis, email: '' }).requesterEmail, 'Bitte Ihre Schul-E-Mail eintragen');
  assert.match(pruefeAnfrage({ ...basis, email: 'kein-at' }).requesterEmail, /gültige E-Mail/);
  assert.equal(pruefeAnfrage({ ...basis, email: 'x@privat.example' }).requesterEmail, 'Bitte Ihre Adresse @schule.example verwenden.');
  assert.equal(pruefeAnfrage({ ...basis, email: 'x@privat.example', angemeldet: true }).requesterEmail, undefined, 'angemeldet: Adresse steht fest');
  assert.equal(pruefeAnfrage({ ...basis, email: 'x@gs.schule.example' }).requesterEmail, undefined, 'Unterdomain erlaubt');
});

test('Anfrage-Prüfung: Klasse, Farben je Zeile, leere Bereiche, Höchstmenge, Größe', () => {
  const f = pruefeAnfrage({
    ...basis,
    classOrTeam: '  ',
    rows: [{ quantity: 1, colors: { griff: 'rot' } }, { quantity: 1, colors: {} }],
    leereBereiche: ['deckel'],
    sizes: ['S', 'M'],
  });
  assert.equal(f.classOrTeam, 'Bitte Klasse oder Team angeben');
  assert.equal(f['variants.1.color.griff'], 'Bitte eine Farbe wählen', 'Fehler an der zweiten Farbzeile');
  assert.equal(f['color.griff'], undefined, 'erste Zeile hat ihre Farbe');
  assert.equal(f['color.deckel'], 'Derzeit ist keine Farbe vorrätig');
  assert.equal(f.size, 'Bitte eine Größe wählen');
  assert.match(pruefeAnfrage({ ...basis, rows: [{ quantity: 100000, colors: { griff: 'rot' } }] }).quantity, /^Zusammen höchstens \d+ Stück$/);
});

test('Anfrage-Prüfung: eigene Felder (Pflicht, Länge, Zahl)', () => {
  const customFields = [
    { id: 'name', label: 'Name', type: 'text', required: true, maxLength: 5, options: [] },
    { id: 'zahl', label: 'Zahl', type: 'number', required: false, maxLength: 10, options: [] },
  ] as never[];
  const f = pruefeAnfrage({ ...basis, customFields, custom: { name: '', zahl: '1,5x' } });
  assert.equal(f['custom.name'], 'Pflichtfeld');
  assert.equal(f['custom.zahl'], 'Bitte eine Zahl eingeben');
  assert.equal(pruefeAnfrage({ ...basis, customFields, custom: { name: 'zu lang', zahl: '-2,5' } })['custom.name'], 'Höchstens 5 Zeichen');
  assert.equal(pruefeAnfrage({ ...basis, customFields, custom: { name: 'Lea', zahl: '-2,5' } })['custom.zahl'], undefined);
});

test('Domain-Hilfen: normalisieren, erlauben, Hinweistext', () => {
  assert.equal(normalizeDomain(' @Schule.Example '), 'schule.example');
  assert.equal(emailDomainAllowed('a@b.example', []), true, 'ohne Vorgabe alles erlaubt');
  assert.equal(emailDomainAllowed('a@nichtschule.example', ['schule.example']), false, 'nur echte Unterdomains');
  assert.equal(domainHint(['a.example', 'b.example', 'c.example']), 'Bitte Ihre Adresse @a.example, @b.example oder @c.example verwenden.');
});

test('Farbanzeige: Varianten vor Bereichen vor einer Farbe (gleich für „Meine Anfragen“ und Verwaltung)', () => {
  const wahl = (area: string, color: string) => ({ areaId: area, area, color, colorId: color, colorHex: '#000000' });
  const eine = { color: 'Rot', colorHex: '#ff0000', colorId: 'rot', colorChoices: [wahl('Farbe', 'Rot')], colorVariants: [] };
  assert.deepEqual(farbAnzeige(eine), { art: 'eine', farbe: { color: 'Rot', colorHex: '#ff0000', colorId: 'rot' } });
  const bereiche = { ...eine, colorChoices: [wahl('Griff', 'Rot'), wahl('Deckel', 'Blau')] };
  assert.equal(farbAnzeige(bereiche).art, 'bereiche');
  const varianten = { ...bereiche, colorVariants: [{ quantity: 1, colorChoices: [wahl('Griff', 'Rot')] }, { quantity: 2, colorChoices: [wahl('Griff', 'Blau')] }] };
  assert.equal(farbAnzeige(varianten).art, 'varianten');
  const alt = { color: 'Grün', colorHex: '', colorChoices: undefined, colorVariants: undefined } as never;
  assert.deepEqual(farbAnzeige(alt), { art: 'eine', farbe: { color: 'Grün', colorHex: '', colorId: '' } }, 'ältere Anfrage ohne Bereiche');
});

test('Suchparameter: setzen, leer/null löscht, andere bleiben', () => {
  const alt = new URLSearchParams('status=alle&q=stift&offen=42');
  assert.equal(mitParametern(alt, { status: 'offen', offen: null }).toString(), 'status=offen&q=stift');
  assert.equal(mitParametern(alt, { q: '' }).toString(), 'status=alle&offen=42');
  assert.equal(mitParametern(alt, { neu: 'x', fehlt: undefined }).toString(), 'status=alle&q=stift&offen=42&neu=x');
  assert.equal(alt.toString(), 'status=alle&q=stift&offen=42', 'Original unverändert');
});

test('Fehlertext: Servermeldung, sonst Ersatztext', () => {
  assert.equal(fehlerText(new ApiError(400, 'Name fehlt'), 'Speichern fehlgeschlagen.'), 'Name fehlt');
  assert.equal(fehlerText(new TypeError('x is undefined'), 'Speichern fehlgeschlagen.'), 'Speichern fehlgeschlagen.');
});

test('„Meine Anfragen“: angemeldete Lehrkraft oder eingeschaltete Statusanzeige', () => {
  const kann = (...p: string[]) => (x: string) => p.includes(x);
  const mit = { features: { requesterTracking: true } } as never;
  const ohne = { features: { requesterTracking: false } } as never;
  assert.equal(darfMeineAnfragen(kann('orders:own'), ohne), true);
  assert.equal(darfMeineAnfragen(kann(), mit), true);
  assert.equal(darfMeineAnfragen(kann(), ohne), false);
  assert.equal(darfMeineAnfragen(kann(), undefined), false, 'Konfiguration lädt noch');
});

test('Datum und Uhrzeit wie im Rest der App', () => {
  const iso = new Date(2026, 10, 18, 14, 5).toISOString();
  assert.equal(formatDate(iso), '18.11.2026');
  assert.equal(formatTime(iso), '14:05');
});
