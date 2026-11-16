// Erzeugt server/src/domain/bambuKatalog.json aus der Farbliste von Bambu Studio (offizielle Quelle von Bambu Lab).
//
//   node scripts/bambu-katalog.mjs                 → lädt die aktuelle Liste von GitHub
//   node scripts/bambu-katalog.mjs <datei.json>    → nimmt eine heruntergeladene Liste
//
// Danach den Diff ansehen, `npm test` laufen lassen und committen. Beim nächsten Update gleicht jede Installation ihre
// Bambu-Farbrollen beim Start mit dieser Datei ab (server/src/module/stammdaten/bambuAbgleich.ts).
//
// Regeln: Die Katalog-ID einer Farbe bleibt für immer gleich (Druckteile verweisen darauf). Zuordnung zur vorigen
// Fassung über die Bambu-Nummer, sonst über Linie + englischen Namen. Farben, die in der Quelle fehlen, bleiben mit
// `weggefallen: true` stehen – nie löschen.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUELLE = 'https://github.com/bambulab/BambuStudio/blob/master/resources/profiles/BBL/filament/filaments_color_codes.json';
const RAW = 'https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/filament/filaments_color_codes.json';
/** Gängige Linien für die Schule – bei Bedarf ergänzen (Name genau wie `fila_type` in der Quelle). */
const LINIEN = ['PLA Basic', 'PLA Matte', 'PLA Silk+', 'PETG HF', 'PETG Translucent', 'ABS', 'TPU 95A HF', 'TPU for AMS'];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ziel = path.join(root, 'server/src/domain/bambuKatalog.json');

const arg = process.argv[2];
const quelle = JSON.parse(arg ? readFileSync(arg, 'utf8') : await (await fetch(RAW)).text());
const vorher = existsSync(ziel) ? JSON.parse(readFileSync(ziel, 'utf8')) : { eintraege: [] };

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const schluessel = (linie, name) => `${linie}|${name.toLowerCase().replace(/grey/g, 'gray')}`;
const nachNummer = new Map(vorher.eintraege.filter((e) => e.nummer).map((e) => [e.nummer, e]));
const nachName = new Map(vorher.eintraege.map((e) => [schluessel(e.linie, e.name), e]));

/** Hex ohne Alpha; ganz durchsichtig („Clear“) als Weiß, sonst wäre der Farbfleck schwarz. */
const hexVon = (farben) => {
  const h = (farben[0] ?? '#FFFFFF').toUpperCase();
  return h.length === 9 && h.endsWith('00') ? '#FFFFFF' : h.slice(0, 7);
};

const benutzt = new Set();
const eintraege = [];
for (const linie of LINIEN) {
  const farben = quelle.data.filter((e) => e.fila_type === linie).sort((a, b) => a.fila_color_code.localeCompare(b.fila_color_code));
  if (!farben.length) throw new Error(`Linie „${linie}“ fehlt in der Quelle.`);
  for (const e of farben) {
    const name = e.fila_color_name.en.trim();
    const alt = nachNummer.get(e.fila_color_code) ?? nachName.get(schluessel(linie, name));
    const id = alt?.id ?? `bambu-${slug(linie)}-${slug(name)}`;
    if (benutzt.has(id)) throw new Error(`Katalog-ID doppelt: ${id}`);
    benutzt.add(id);
    eintraege.push({
      id,
      nummer: e.fila_color_code,
      linie,
      name,
      farbname: (e.fila_color_name.de ?? name).trim(),
      hex: hexVon(e.fila_color),
      ...(e.fila_color.length > 1 ? { verlauf: true } : {}),
    });
  }
}
// Weggefallene Farben der vorigen Fassung behalten.
for (const alt of vorher.eintraege) {
  if (!benutzt.has(alt.id)) eintraege.push({ ...alt, weggefallen: true });
}
// Deutsche Namen müssen je Linie eindeutig sein (Anzeige „Farbname · Bambu Lab Linie“).
const namen = new Set();
for (const e of eintraege) {
  const k = `${e.linie}|${e.farbname}`;
  if (namen.has(k)) throw new Error(`Farbname doppelt: ${k}`);
  namen.add(k);
}

let stand = new Date().toISOString().slice(0, 10);
try {
  // Stand = Datum der letzten Änderung der Quelldatei bei Bambu Lab.
  const api = 'https://api.github.com/repos/bambulab/BambuStudio/commits?path=resources/profiles/BBL/filament/filaments_color_codes.json&per_page=1';
  const c = JSON.parse(execFileSync('curl', ['-sS', api], { encoding: 'utf8' }))[0];
  stand = `${c.commit.committer.date.slice(0, 10)} (${c.sha.slice(0, 8)})`;
} catch {
  /* ohne Netz: heutiges Datum */
}

const katalog = { quelle: QUELLE, stand, linien: LINIEN, eintraege };
// Eine Farbe je Zeile – so bleibt der Diff bei Änderungen lesbar.
const kopf = JSON.stringify({ ...katalog, eintraege: [] }, null, 2).replace(/"eintraege": \[\]\n\}$/, '"eintraege": [\n');
writeFileSync(ziel, `${kopf}${eintraege.map((e) => `    ${JSON.stringify(e)}`).join(',\n')}\n  ]\n}\n`);
console.log(`${eintraege.length} Farben (${eintraege.filter((e) => e.weggefallen).length} weggefallen) → ${path.relative(root, ziel)}`);
