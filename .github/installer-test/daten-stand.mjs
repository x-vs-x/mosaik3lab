// Hilfsprüfung für den Installer-Test (Runde „v163“, nur auf dem GitHub-Runner): Datenstand vor dem Update merken und
// danach vergleichen – Zeilen je Tabelle und jede Datei der Ablage (SHA-256). So fällt auf, wenn ein Update von 1.6.3
// Datensätze oder Dateien verliert oder verändert.
//   node daten-stand.mjs merken      <Datenbankdatei> <Ablageordner> <Stand.json>
//   node daten-stand.mjs vergleichen <Datenbankdatei> <Ablageordner> <Stand.json>
// Reines Node (node:sqlite), Datenbank nur lesend.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [modus, dbFile, ablage, standFile] = process.argv.slice(2);
// Ändern sich im Betrieb von selbst (Anmeldungen, Versionsvermerk, Einstellungen des Managers) – zählen nicht
const FLUECHTIG = new Set(['sitzung', 'betrieb_einstellung', 'einstellung', 'schema_version']);
// Fachliche Daten: Zahl der Zeilen muss genau gleich bleiben (übrige Tabellen dürfen wachsen, z. B. neue Farbrollen)
const GENAU = new Set(['benutzer', 'lehrkraft', 'artikel', 'artikel_farbbereich', 'artikel_video', 'datei', 'anfrage', 'vorschlag', 'kategorie', 'material']);
// Von einer Migration bewusst entfernt (022: tote Tabelle, nie beschrieben) – darf fehlen
const ENTFERNT = new Set(['benutzer_recht']);
// Aus der Ablage nicht verglichen: Vorschaubilder (jederzeit neu berechnet) und Punkt-Dateien (Markierungen)
const AUSGENOMMEN = (rel) => rel.split(/[\\/]/)[0] === 'vorschau' || path.basename(rel).startsWith('.');

function zeilen() {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    const out = {};
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
      if (!FLUECHTIG.has(name)) out[name] = Number(db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n);
    }
    return out;
  } finally {
    db.close();
  }
}

function dateien() {
  const out = {};
  if (!fs.existsSync(ablage)) return out;
  for (const e of fs.readdirSync(ablage, { recursive: true, withFileTypes: true })) {
    if (!e.isFile()) continue;
    const voll = path.join(e.parentPath, e.name);
    const rel = path.relative(ablage, voll).split(path.sep).join('/');
    if (!AUSGENOMMEN(rel)) out[rel] = crypto.createHash('sha256').update(fs.readFileSync(voll)).digest('hex');
  }
  return out;
}

const jetzt = { zeilen: zeilen(), dateien: dateien() };
if (modus === 'merken') {
  fs.writeFileSync(standFile, JSON.stringify(jetzt, null, 1));
  const n = Object.values(jetzt.zeilen).reduce((s, x) => s + x, 0);
  console.log(`Stand gemerkt: ${Object.keys(jetzt.zeilen).length} Tabellen, ${n} Zeilen, ${Object.keys(jetzt.dateien).length} Dateien in der Ablage`);
  if (!Object.keys(jetzt.dateien).length || !jetzt.zeilen.artikel) {
    console.log('FEHLER keine Testdaten (Druckteil mit Bildern) vor dem Update');
    process.exit(1);
  }
  process.exit(0);
}
if (modus !== 'vergleichen') {
  console.log('Aufruf: node daten-stand.mjs merken|vergleichen <Datenbank> <Ablage> <Stand.json>');
  process.exit(2);
}

const vorher = JSON.parse(fs.readFileSync(standFile, 'utf8'));
let fehler = 0;
const pruefe = (bed, t) => (bed ? console.log(`OK   ${t}`) : (console.log(`FEHLER ${t}`), fehler++));
for (const [tabelle, n] of Object.entries(vorher.zeilen)) {
  const nach = jetzt.zeilen[tabelle];
  if (ENTFERNT.has(tabelle) && nach === undefined) { console.log(`OK   Tabelle ${tabelle}: bewusst entfernt (${n} Zeilen vorher)`); continue; }
  if (GENAU.has(tabelle)) pruefe(nach === n, `Tabelle ${tabelle}: ${n} → ${nach ?? 'fehlt'} Zeilen`);
  else if (nach === undefined || nach < n) pruefe(false, `Tabelle ${tabelle}: ${n} → ${nach ?? 'fehlt'} Zeilen (weniger als vorher)`);
}
const weg = Object.keys(vorher.dateien).filter((p) => !(p in jetzt.dateien));
const anders = Object.keys(vorher.dateien).filter((p) => p in jetzt.dateien && jetzt.dateien[p] !== vorher.dateien[p]);
pruefe(!weg.length, `alle ${Object.keys(vorher.dateien).length} Dateien der Ablage noch da${weg.length ? ` – fehlen: ${weg.slice(0, 5).join(', ')}` : ''}`);
pruefe(!anders.length, `Dateien der Ablage unverändert (SHA-256)${anders.length ? ` – verändert: ${anders.slice(0, 5).join(', ')}` : ''}`);
console.log(fehler ? `${fehler} Fehler` : 'Datenstand nach dem Update vollständig erhalten');
process.exit(fehler ? 1 : 0);
