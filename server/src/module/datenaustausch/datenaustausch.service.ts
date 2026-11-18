import fs from 'node:fs';
import path from 'node:path';
import { type ColorArea, inGruppen } from '@mosaik3lab/shared/katalog';
import { type Item } from '../../domain/types';
import type { Storage } from '../../storage';
import { dateiName, type Datei } from '../../kern/files';
import { transaction } from '../../kern/db';
import { type Paket, type PaketArtikel } from './datenaustausch.export';
import { type DateiInfo } from './datenaustausch.paket';
import { lc } from './datenaustausch.abgleich';
import { spieleArtikelEin, type ArtikelKontext } from './datenaustausch.artikel';
import { ergaenzeStammdaten } from './datenaustausch.stammdaten';
import { verknuepfe, type VerknuepfungsZaehler } from './datenaustausch.aehnliche';

// Druckteile einspielen (Format siehe datenaustausch.export.ts, Lesen/Prüfen: datenaustausch.paket.ts).
// Ablauf: 1) Kopf lesen und prüfen, 2) jede Datei einzeln prüfen (SHA-256, Größe, Magic Bytes), 3) „trocken“ durchrechnen
// (Vorschau, wird zurückgerollt), 4) ausführen: in EINER Transaktion Datenbank ändern und Dateien an ihren Platz verschieben.
// Scheitert etwas, wird alles zurückgenommen (alles oder nichts).
//
// Ein Druckteil „gibt es schon“, wenn die ID gleich ist (Datei stammt von hier) oder – bei Dateien von einer anderen
// Installation – genau ein Druckteil gleichen Namens existiert. Für diese gilt die Wahl:
//   ueberspringen  vorhandenes Druckteil bleibt unverändert (Standard)
//   ersetzen       vorhandenes Druckteil bekommt Texte, Bilder, Videos und Druckdateien aus der Datei (Nummer und ID bleiben)
// Kategorien, Einsatzbereiche, Materialien und Farbrollen der eingespielten Druckteile werden zugeordnet oder ergänzt;
// vorhandene Stammdaten werden nie geändert oder gelöscht. Ältere Dateien (vollständiger Export mit allen Stammdaten
// und Anfragestatus) werden genauso gelesen – nicht gebrauchte Stammdaten und Status werden ignoriert.
// Ähnliche Druckteile werden in beiden Modi nur hinzugefügt, nie gelöscht (datenaustausch.aehnliche.ts).

export type Modus = 'ueberspringen' | 'ersetzen';

export interface Zaehler {
  neu: number;
  /** Vorhandenes Druckteil durch den Stand der Datei ersetzt. */
  ersetzt: number;
  /** Vorhanden und gleich (Stammdaten: schon vorhanden). */
  unveraendert: number;
  uebersprungen: number;
}

export interface Detail {
  status: 'neu' | 'ersetzt' | 'uebersprungen' | 'hinweis';
  bereich: string;
  name: string;
  text?: string;
}

export interface Bericht {
  modus: Modus;
  /** Druckteile in der Datei. */
  artikel: number;
  /** Davon gibt es hier schon. */
  vorhanden: number;
  abschnitte: Record<'artikel' | 'kategorien' | 'einsatzbereiche' | 'materialien' | 'filamente' | 'dateien', Zaehler>;
  /** Ähnliche Druckteile: neu angelegte und vorgemerkte (Partner fehlt hier noch) Verknüpfungen. */
  verknuepfungen: VerknuepfungsZaehler;
  details: Detail[];
  /** Mehr Details, als angezeigt werden. */
  weitereDetails: number;
}

const MAX_DETAILS = 400;

export const leer = (): Zaehler => ({ neu: 0, ersetzt: 0, unveraendert: 0, uebersprungen: 0 });

class Trocken extends Error {
  constructor(readonly bericht: Bericht) {
    super('trocken');
  }
}

export interface Ergebnis {
  bericht: Bericht;
  verschiebe: { von: string; nach: string; bildId?: string }[];
  loeschen: Datei[];
}

export interface AusfuehrenOptionen {
  modus: Modus;
  /** Ordner mit den geprüften Dateien (Name = Datei-ID im Paket) – nur beim Ausführen. */
  tmpDir?: string;
  infos: Map<string, DateiInfo>;
}

/** Zu jedem Druckteil der Datei das vorhandene Druckteil (gleiche ID, sonst eindeutig gleicher Name). */
function ordneZu(paket: Paket, vorher: Item[]) {
  const nachId = new Map(vorher.map((i) => [i.id, i]));
  const nachName = new Map<string, Item[]>();
  for (const i of vorher) nachName.set(lc(i.name), [...(nachName.get(lc(i.name)) ?? []), i]);
  const vergeben = new Set<string>();
  const treffer = new Map<PaketArtikel, Item | undefined>();
  for (const a of paket.artikel) {
    let t = nachId.get(a.id);
    if (!t) {
      const gleich = nachName.get(lc(a.name)) ?? [];
      if (gleich.length === 1 && !paket.artikel.some((b) => b.id === gleich[0].id)) t = gleich[0];
    }
    if (t && vergeben.has(t.id)) t = undefined; // zwei Einträge der Datei auf dasselbe Druckteil: der zweite wird neu angelegt
    if (t) vergeben.add(t.id);
    treffer.set(a, t);
  }
  return treffer;
}

/** Gesamte Datenbankarbeit des Imports; läuft synchron in einer Transaktion. */
function rechne(storage: Storage, paket: Paket, opt: AusfuehrenOptionen): Ergebnis {
  const { db } = storage.sqlite;
  const { items: itemRepo, settings: settingsRepo } = storage;
  const files = storage.files;
  const ersetzen = opt.modus === 'ersetzen';
  const details: Detail[] = [];
  const z = { artikel: leer(), kategorien: leer(), einsatzbereiche: leer(), materialien: leer(), filamente: leer(), dateien: leer() };
  const verschiebe: Ergebnis['verschiebe'] = [];
  const loeschen: Datei[] = [];
  const settings = settingsRepo.read();
  const md = settings.masterData;
  const vorherArtikel = itemRepo.load();
  const dateiSnap = new Map<string, Datei[]>();
  for (const d of files.listByTyp('artikel')) dateiSnap.set(d.objektId, [...(dateiSnap.get(d.objektId) ?? []), d]);
  const shaVonName = (objektId: string, name: string) => (dateiSnap.get(objektId) ?? []).find((d) => dateiName(d) === name)?.sha256 ?? '';
  const zuordnung = (a: PaketArtikel) => (a.number ? `${a.number} – ${a.name}` : a.name);
  const skip = (a: PaketArtikel, grund: string) => {
    z.artikel.uebersprungen++;
    details.push({ status: 'uebersprungen', bereich: 'Druckteil', name: zuordnung(a), text: grund });
  };

  // 1) Welche Druckteile werden eingespielt?
  const treffer = ordneZu(paket, vorherArtikel);
  /** Druckteil der Datei (ID dort) → Druckteil hier, für die Verknüpfungen „ähnliche Druckteile“. */
  const lokal = new Map<string, string>();
  for (const [a, t] of treffer) if (t && !lokal.has(a.id)) lokal.set(a.id, t.id);
  const gesehenIds = new Set<string>();
  const zuImportieren: PaketArtikel[] = [];
  for (const a of paket.artikel) {
    if (gesehenIds.has(a.id)) {
      skip(a, 'kommt in der Datei doppelt vor');
      continue;
    }
    gesehenIds.add(a.id);
    const t = treffer.get(a);
    if (t && !ersetzen) {
      skip(a, t.name === a.name && t.id !== a.id ? 'ein Druckteil mit diesem Namen gibt es schon' : 'gibt es schon');
      continue;
    }
    zuImportieren.push(a);
  }

  // 2) Bezüge dieser Druckteile zuordnen oder ergänzen (nur, was sie wirklich brauchen; datenaustausch.stammdaten.ts).
  const { kat, einsatz, mat, fil } = ergaenzeStammdaten(md, paket, zuImportieren, z, details);
  settingsRepo.write({ ...settings, masterData: { ...md, categories: kat.liste, useAreas: einsatz.liste, materials: mat.liste, filaments: fil.liste } });

  // 3) Druckteile
  const kategorieVon = new Map(kat.liste.map((k) => [lc(k.name), k.name]));
  const materialVon = new Map(mat.liste.map((m) => [lc(m.name), m.name]));
  const bereichVon = new Map(einsatz.liste.map((e) => [lc(e.name), e.name]));
  const filamentIds = new Set(fil.liste.map((f) => f.id));
  // Vergleich der Farben: feste Rollen ohne die von Gruppen abgedeckten (die füllt der Server beim Lesen ein) + Gruppen.
  const rolleVon = new Map(fil.liste.map((f) => [f.id, f]));
  const farbenVon = (ar: ColorArea) =>
    ar.alleFarben ? 'alle' : [ar.colors.filter((c) => !inGruppen(rolleVon.get(c) ?? { brand: '', line: '' }, ar.gruppen)).sort(), [...(ar.gruppen ?? [])].sort()];
  const vergebeneNummern = new Set<string>();
  const nummerBelegt = (n: string) => vergebeneNummern.has(n) || itemRepo.numberExists(n);
  const jetzt = new Date().toISOString();
  const belegtePfade = new Set<string>();

  const k: ArtikelKontext = {
    paket, opt, treffer, vorherArtikel, files, itemRepo, db, dateiSnap, shaVonName, fil, filamentIds, kategorieVon, materialVon,
    bereichVon, farbenVon, nummerBelegt, vergebeneNummern, jetzt, lokal, belegtePfade, verschiebe, loeschen, z, details, skip, zuordnung,
  };
  for (const a of zuImportieren) spieleArtikelEin(a, k);

  // 4) Ähnliche Druckteile: anlegen, vormerken, früher vorgemerkte auflösen (nur hinzufügen).
  const verknuepfungen = verknuepfe(db, paket.artikel, lokal);

  // Dateien, deren Pfad neu belegt wurde, nicht löschen (gleicher Pfad = neue Datei).
  const bericht: Bericht = {
    modus: opt.modus,
    artikel: paket.artikel.length,
    vorhanden: [...treffer.values()].filter(Boolean).length,
    abschnitte: z,
    verknuepfungen,
    details: details.slice(0, MAX_DETAILS),
    weitereDetails: Math.max(0, details.length - MAX_DETAILS),
  };
  return { bericht, verschiebe, loeschen: loeschen.filter((d) => !belegtePfade.has(d.pfad)) };
}

/** Vorschau: rechnet alles durch und rollt zurück. Ändert weder Datenbank noch Ablage. */
export function vorschau(storage: Storage, paket: Paket, modus: Modus, infos: Map<string, DateiInfo>): Bericht {
  try {
    transaction(storage.sqlite.db, () => {
      throw new Trocken(rechne(storage, paket, { modus, infos }).bericht);
    });
  } catch (err) {
    if (err instanceof Trocken) return err.bericht;
    throw err;
  }
  throw new Error('unerreichbar');
}

/**
 * Führt den Import aus. Die Dateien liegen bereits geprüft in `tmpDir`. In der Transaktion werden sie an ihren
 * Platz in der Ablage verschoben; scheitert irgendetwas, wird die Datenbank zurückgerollt und bereits verschobene Dateien werden entfernt.
 */
export async function fuehreAus(storage: Storage, paket: Paket, modus: Modus, infos: Map<string, DateiInfo>, tmpDir: string): Promise<Bericht> {
  const verschoben: string[] = [];
  const neueOrdner: string[] = [];
  let ergebnis: Ergebnis;
  try {
    ergebnis = transaction(storage.sqlite.db, () => {
      const r = rechne(storage, paket, { modus, tmpDir, infos });
      for (const m of r.verschiebe) {
        const angelegt = fs.mkdirSync(path.dirname(m.nach), { recursive: true });
        if (angelegt) neueOrdner.push(angelegt);
        if (fs.existsSync(m.nach)) fs.rmSync(m.nach, { force: true });
        fs.renameSync(m.von, m.nach);
        verschoben.push(m.nach);
      }
      return r;
    });
  } catch (err) {
    for (const f of verschoben) fs.rmSync(f, { force: true });
    for (const d of neueOrdner) fs.rmSync(d, { recursive: true, force: true });
    throw err;
  }
  await storage.files.unlink(ergebnis.loeschen);
  // Eingespielte Bilder: alte Vorschaubilder (gleiche ID, anderer Inhalt) weg, neue im Hintergrund erzeugen.
  const bilder = ergebnis.verschiebe.flatMap((m) => (m.bildId ? [m.bildId] : []));
  for (const id of bilder) await storage.files.entferneVorschau(id);
  if (bilder.length) storage.bildpflege.nachholen(bilder).catch((err: Error) => console.warn(`[Import] Bildpflege: ${err.message}`));
  return ergebnis.bericht;
}
