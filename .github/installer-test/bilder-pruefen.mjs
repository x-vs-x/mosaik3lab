// Rauchtest Bildverarbeitung nach der Installation (Installer-Test auf Windows, Linux x64, Raspberry Pi/arm64).
// Prüft, dass der Rechen-Thread im Paket (server/dist/bild-worker.mjs) wirklich läuft: anmelden (Admin aus „marker“),
// Druckteil anlegen, ein JPEG mit EXIF-Drehung und ein PNG mit Transparenz hochladen, Vorschaubilder ?groesse=karte und
// ?groesse=mini abrufen, Typ und Maße prüfen, Rechenzeiten ins Log. Danach wird das Druckteil wieder gelöscht.
//   node bilder-pruefen.mjs [App-Adresse, Standard http://127.0.0.1/mosaik3lab]
// Reines Node (fetch, FormData), keine Abhängigkeiten. Testbilder liegen daneben (testbild-exif6.jpg, testbild-transparent.png).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] ?? 'http://127.0.0.1/mosaik3lab').replace(/\/$/, '');
const LOGIN = { email: 'ci-admin@schule.test', password: 'ci-nur-test-1234' }; // wie pruefen.sh/.ps1 (nur Wegwerf-Runner)
const HIER = path.dirname(fileURLToPath(import.meta.url));
// testbild-exif6.jpg: gespeichert 1200 × 600, EXIF-Ausrichtung 6 (90° drehen) → angezeigt hochkant 600 × 1200.
// testbild-transparent.png: 800 × 600 mit transparentem Rand → Vorschau als JPEG (ohne Transparenz).
const BILDER = [
  { datei: 'testbild-exif6.jpg', mime: 'image/jpeg', breite: 600, hoehe: 1200 },
  { datei: 'testbild-transparent.png', mime: 'image/png', breite: 800, hoehe: 600 },
];
const GROESSEN = { karte: 1080, mini: 360 };

let fehler = 0;
const ok = (t) => console.log(`OK   ${t}`);
const falsch = (t) => {
  console.log(`FEHLER ${t}`);
  fehler++;
};
const pruefe = (bed, t) => (bed ? ok(t) : falsch(t));

let cookie = '';
async function api(method, p, body) {
  const headers = { 'X-Requested-With': 'mosaik3lab', Accept: 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + p, { method, headers, body: body instanceof FormData ? body : body && JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
  const neu = r.headers.getSetCookie().map((c) => c.split(';')[0]);
  if (neu.length) cookie = neu.join('; ');
  return r;
}
const json = async (r, was) => {
  if (!r.ok) throw new Error(`${was}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};

/** Breite × Höhe aus dem JPEG-Kopf (SOF-Marker). */
function jpegMasse(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    const len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { hoehe: b.readUInt16BE(i + 5), breite: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

/** Warten, bis die App antwortet (nach dem Anlegen des Admins startet der Manager sie ggf. neu → kurz 502 am Portal). */
async function bereit(sekunden = 120) {
  const ende = Date.now() + sekunden * 1000;
  let status = 0;
  while (Date.now() < ende) {
    status = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.status, () => 0);
    if (status === 200) return status;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return status;
}

try {
  const t = performance.now();
  const h = await bereit();
  pruefe(h === 200, `App antwortet (${BASE}/api/health → ${h} nach ${Math.round((performance.now() - t) / 1000)} s)`);
  const login = await api('POST', '/api/auth/login', LOGIN);
  pruefe(login.ok, `Anmeldung an der App (${BASE}) mit dem Admin-Konto → ${login.status}`);
  if (!login.ok) throw new Error('Anmeldung fehlgeschlagen');

  const { masterData: md } = await json(await api('GET', '/api/admin/settings'), 'Einstellungen');
  const kategorie = md.categories[0]?.name;
  const material = md.materials[0]?.name;
  pruefe(kategorie && material, `Stammdaten vorhanden (Kategorie „${kategorie}“, Material „${material}“)`);

  const item = await json(
    await api('POST', '/api/items', {
      name: 'CI Bildtest',
      shortDescription: 'Rauchtest der Bildverarbeitung im Installer-Test',
      category: kategorie,
      material,
      printTimeMinutes: 10,
      colorAreas: [{ name: 'Farbe', alleFarben: true, colors: [] }],
    }),
    'Druckteil anlegen',
  );
  ok(`Druckteil angelegt (${item.id})`);

  const fd = new FormData();
  for (const b of BILDER) fd.append('files', new Blob([fs.readFileSync(path.join(HIER, b.datei))], { type: b.mime }), b.datei);
  const t0 = performance.now();
  const hoch = await json(await api('POST', `/api/items/${item.id}/images`, fd), 'Bilder hochladen');
  const hochMs = Math.round(performance.now() - t0);
  const bilder = hoch.images ?? [];
  pruefe(bilder.length === BILDER.length, `${bilder.length} Bilder hochgeladen und verarbeitet in ${hochMs} ms (Rechenzeit beim Hochladen)`);

  for (const [i, b] of BILDER.entries()) {
    const name = bilder[i]; // Dateiname in der Ablage, z. B. <id>.jpg – abrufbar unter /api/files/images/<name>
    if (typeof name !== 'string' || !name) {
      falsch(`kein Bild für ${b.datei} (${JSON.stringify(name)})`);
      continue;
    }
    for (const [groesse, breite] of Object.entries(GROESSEN)) {
      const t1 = performance.now();
      const r = await api('GET', `/api/files/images/${encodeURIComponent(name)}?groesse=${groesse}`);
      const daten = Buffer.from(await r.arrayBuffer());
      const ms = Math.round(performance.now() - t1);
      const typ = r.headers.get('content-type') ?? '';
      const m = jpegMasse(daten);
      const soll = { breite: Math.min(breite, b.breite), hoehe: Math.round((b.hoehe * Math.min(breite, b.breite)) / b.breite) };
      pruefe(r.ok && typ.startsWith('image/jpeg'), `${b.datei} ${groesse}: HTTP ${r.status}, ${typ}, ${daten.length} Bytes, ${ms} ms`);
      pruefe(m && Math.abs(m.breite - soll.breite) <= 1 && Math.abs(m.hoehe - soll.hoehe) <= 1, `${b.datei} ${groesse}: ${m ? `${m.breite} × ${m.hoehe}` : 'kein JPEG'} (erwartet ${soll.breite} × ${soll.hoehe}${b.hoehe > b.breite ? ', hochkant gedreht' : ''})`);
    }
  }
  const weg = await api('DELETE', `/api/items/${item.id}`);
  pruefe(weg.ok, `Druckteil wieder gelöscht → ${weg.status}`);
} catch (err) {
  falsch(err.message);
}
console.log(fehler ? `${fehler} Fehler` : 'Bildverarbeitung im Paket in Ordnung');
process.exit(fehler ? 1 : 0);
