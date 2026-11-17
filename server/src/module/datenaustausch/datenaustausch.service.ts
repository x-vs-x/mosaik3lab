import fs from 'node:fs';
import { BAMBU_MARKE, katalogEintrag, katalogFelder, katalogNachNummer } from '../../domain/bambuKatalog';
import path from 'node:path';
import { newId, UUID_PATTERN } from '../../domain/ids';
import { MIME_BY_EXT } from '../../domain/objekttypen';
import type { Category, Filament, SimpleEntry } from '../../domain/settings';
import { type Item, type ItemVideo, type ModelFile } from '../../domain/types';
import { normalizeItemInput } from '../katalog/katalog.service';
import type { Storage } from '../../storage';
import { dateiName, type Datei } from '../../kern/files';
import { nextNumber, transaction } from '../../kern/db';
import { MAX_IMAGES_PER_ITEM, MAX_MODELS_PER_ITEM, MAX_VIDEOS_PER_ITEM } from '../../kern/uploads';
import { itemInputSchema } from '@mosaik3lab/shared/katalog';
import { COLOR_KEYS, ICON_KEYS } from '@mosaik3lab/shared/stammdaten';
import { PAKET_ROLLEN, type Paket, type PaketArtikel } from './datenaustausch.export';
import { ID, type DateiInfo } from './datenaustausch.paket';
import { ergaenze, lc } from './datenaustausch.abgleich';

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
  details: Detail[];
  /** Mehr Details, als angezeigt werden. */
  weitereDetails: number;
}

const MAX_DETAILS = 400;

const leer = (): Zaehler => ({ neu: 0, ersetzt: 0, unveraendert: 0, uebersprungen: 0 });

class Trocken extends Error {
  constructor(readonly bericht: Bericht) {
    super('trocken');
  }
}

interface Ergebnis {
  bericht: Bericht;
  verschiebe: { von: string; nach: string }[];
  loeschen: Datei[];
}

/** Vergleichswert eines Druckteils (ohne technische IDs von Dateien, mit Prüfsummen der Dateien). */
function fingerabdruck(i: Pick<Item, 'name' | 'shortDescription' | 'description' | 'category' | 'useAreas' | 'sizes' | 'colorAreas' | 'price' | 'customFields' | 'material' | 'materialInfo' | 'printTimeMinutes' | 'safetyNotes' | 'published'>, videos: { title: string; url: string; sha: string }[], dateien: { rolle: string; sha: string }[] | null) {
  return JSON.stringify({
    n: i.name,
    k: i.shortDescription,
    b: i.description,
    c: i.category,
    a: [...i.useAreas].sort(),
    g: i.sizes,
    f: i.colorAreas.map((a) => [a.name, a.alleFarben ? 'alle' : a.colors]),
    p: i.price,
    x: i.customFields.map((f) => [f.label, f.type, f.required, f.maxLength, f.hint, f.options]),
    m: i.material,
    mi: i.materialInfo,
    t: i.printTimeMinutes,
    s: i.safetyNotes,
    v: i.published,
    vid: videos.map((v) => [v.title, v.url, v.sha]),
    d: dateien,
  });
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
  const { db, items: itemRepo, settings: settingsRepo } = storage.sqlite;
  const files = storage.files;
  const ersetzen = opt.modus === 'ersetzen';
  const details: Detail[] = [];
  const z = { artikel: leer(), kategorien: leer(), einsatzbereiche: leer(), materialien: leer(), filamente: leer(), dateien: leer() };
  const verschiebe: { von: string; nach: string }[] = [];
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

  // 2) Bezüge dieser Druckteile zuordnen oder ergänzen (nur, was sie wirklich brauchen).
  const nachName = <T extends { name: string }>(liste: T[], name: string) => liste.find((e) => lc(e.name) === lc(name));
  const gebraucht = (namen: string[], ausPaket: (SimpleEntry | Category)[], neu: (name: string) => SimpleEntry | Category) =>
    [...new Map(namen.filter((n) => n.trim()).map((n) => [lc(n), n])).values()].map((n) => nachName(ausPaket, n) ?? neu(n));
  const kategorieNeu = (name: string): Category => ({ id: newId(), name, color: COLOR_KEYS[0], icon: ICON_KEYS[0] });
  const einfachNeu = (name: string): SimpleEntry => ({ id: newId(), name });
  const kat = ergaenze<Category>(md.categories, gebraucht(zuImportieren.map((a) => a.category), paket.stammdaten.kategorien, kategorieNeu) as Category[], {
    schluessel: (e) => lc(e.name), z: z.kategorien, bereich: 'Kategorie', name: (e) => e.name, details,
  });
  const einsatz = ergaenze<SimpleEntry>(md.useAreas, gebraucht(zuImportieren.flatMap((a) => a.useAreas), paket.stammdaten.einsatzbereiche, einfachNeu), {
    schluessel: (e) => lc(e.name), z: z.einsatzbereiche, bereich: 'Einsatzbereich', name: (e) => e.name, details,
  });
  const mat = ergaenze<SimpleEntry>(md.materials, gebraucht(zuImportieren.map((a) => a.material), paket.stammdaten.materialien, einfachNeu), {
    schluessel: (e) => lc(e.name), z: z.materialien, bereich: 'Material', name: (e) => e.name, details,
  });
  const farbIds = new Set(zuImportieren.flatMap((a) => a.colorAreas.flatMap((ar) => ar.colors)));
  // Bambu-Farben über Katalog-ID bzw. Bambu-Nummer erkennen (Name und Farbe können sich seit dem Export geändert haben);
  // dann gelten die Daten aus dem eigenen Katalog. Alles andere wird als eigene Farbrolle verglichen bzw. ergänzt.
  const paketFarben = paket.stammdaten.filamente
    .filter((f) => farbIds.has(f.id))
    .map((f): Filament => {
      const k = katalogEintrag(f.katalogId) ?? (lc(f.brand) === lc(BAMBU_MARKE) ? katalogNachNummer(f.herstellerNummer) : undefined);
      if (k) return { id: f.id, ...katalogFelder(k), available: f.available !== false };
      return { ...f, available: f.available !== false, katalogId: null, herstellerName: '', weggefallen: false };
    });
  const fil = ergaenze<Filament>(md.filaments, paketFarben, {
    schluessel: (e) => (e.katalogId ? `katalog|${e.katalogId}` : lc(`${e.brand}|${e.line}|${e.colorName}|${e.hex}`)),
    perId: true,
    z: z.filamente,
    bereich: 'Farbrolle',
    name: (e) => `${e.colorName} (${e.brand} ${e.line})`.replace(/\s+\)/, ')').trim(),
    details,
  });
  settingsRepo.write({ ...settings, masterData: { ...md, categories: kat.liste, useAreas: einsatz.liste, materials: mat.liste, filaments: fil.liste } });

  // 3) Druckteile
  const kategorieVon = new Map(kat.liste.map((k) => [lc(k.name), k.name]));
  const materialVon = new Map(mat.liste.map((m) => [lc(m.name), m.name]));
  const bereichVon = new Map(einsatz.liste.map((e) => [lc(e.name), e.name]));
  const filamentIds = new Set(fil.liste.map((f) => f.id));
  const vergebeneNummern = new Set<string>();
  const nummerBelegt = (n: string) => vergebeneNummern.has(n) || itemRepo.numberExists(n);
  const jetzt = new Date().toISOString();
  const belegtePfade = new Set<string>();

  for (const a of zuImportieren) {
    // Farben über die Zuordnung (ID in der Datei → ID hier). Eine Farbe, die die Datei nur als ID nennt, ohne sie zu
    // beschreiben (Marke, Farbname, Hex), lässt sich nicht anlegen: Sie fehlt dann und wird in Vorschau und Ergebnis genannt.
    // Ein Farbbereich ohne Farbe entfällt; bleibt gar keiner, ist das Druckteil nicht zu retten (Grund in der Vorschau).
    const ohneFarbe = new Set<string>();
    const colorAreas = a.colorAreas
      .map((ar) => ({
        ...ar,
        colors: ar.alleFarben
          ? []
          : [...new Set(ar.colors.map((c) => fil.map.get(c) ?? c))].filter((c) => {
              if (!filamentIds.has(c)) ohneFarbe.add(c);
              return filamentIds.has(c);
            }),
      }))
      .filter((ar) => ar.alleFarben || ar.colors.length > 0 || (ar.gruppen?.length ?? 0) > 0);
    if (!colorAreas.length) {
      skip(a, 'keine seiner Farben ist in der Datei beschrieben (Marke, Farbname, Hex fehlen) – bitte in der Quelle Farben zuordnen und neu exportieren');
      continue;
    }
    if (ohneFarbe.size) {
      const n = ohneFarbe.size;
      details.push({ status: 'hinweis', bereich: 'Druckteil', name: zuordnung(a), text: `${n === 1 ? 'eine Farbe ist' : `${n} Farben sind`} in der Datei nicht beschrieben und ${n === 1 ? 'fehlt' : 'fehlen'} deshalb – bitte danach im Druckteil prüfen` });
    }
    const parsed = itemInputSchema.safeParse({
      name: a.name,
      shortDescription: a.shortDescription,
      description: a.description,
      category: a.category,
      kind: a.kind,
      useAreas: a.useAreas,
      colorAreas,
      price: a.price,
      customFields: a.customFields,
      sizes: a.sizes,
      material: a.material,
      materialInfo: a.materialInfo,
      printTimeMinutes: a.printTimeMinutes,
      safetyNotes: a.safetyNotes,
      published: a.published,
    });
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      skip(a, `Angaben unvollständig (${i.path.join('.') || 'Angaben'}: ${i.message})`);
      continue;
    }
    const data = normalizeItemInput(parsed.data);
    // Schreibweise der Stammdaten hier übernehmen (Groß/Klein egal).
    data.category = kategorieVon.get(lc(data.category)) ?? data.category;
    data.material = materialVon.get(lc(data.material)) ?? data.material;
    data.useAreas = data.useAreas.map((u) => bereichVon.get(lc(u)) ?? u);
    const anzahl = (r: string) => a.dateien.filter((d) => d.rolle === r).length;
    if (anzahl('bild') > MAX_IMAGES_PER_ITEM || anzahl('druckdatei') > MAX_MODELS_PER_ITEM || anzahl('video') > MAX_VIDEOS_PER_ITEM) {
      skip(a, `zu viele Dateien (Bilder max. ${MAX_IMAGES_PER_ITEM}, Druckdateien max. ${MAX_MODELS_PER_ITEM}, Videos max. ${MAX_VIDEOS_PER_ITEM})`);
      continue;
    }

    const aktuell = treffer.get(a);
    const id = aktuell ? aktuell.id : ID.test(a.id) && !vorherArtikel.some((i) => i.id === a.id) ? a.id : newId();

    // Dateien: vorhandene (gleiche ID und Prüfsumme am selben Druckteil) weiterverwenden, neue vorbereiten.
    const bild: { name: string; sort: number }[] = [];
    const modelle: ModelFile[] = [];
    const neueDateien: { datei: Datei; von: string }[] = [];
    const dateiMap = new Map<string, Datei>();
    const dateienFinger: { rolle: string; sha: string }[] = [];
    if (paket.mitDateien) {
      for (const d of [...a.dateien].sort((x, y) => x.rolle.localeCompare(y.rolle) || x.sortierung - y.sortierung)) {
        const info = opt.infos.get(d.id)!;
        const vorh = files.find(d.id);
        const wieder = !!vorh && vorh.objektId === id && vorh.objekttyp === 'artikel' && vorh.sha256 === d.sha256;
        const fid = wieder ? d.id : vorh || !UUID_PATTERN.test(d.id) ? newId() : d.id;
        dateienFinger.push({ rolle: d.rolle, sha: d.sha256 });
        let datei: Datei;
        if (wieder) {
          datei = vorh!;
        } else {
          datei = {
            id: fid,
            objekttyp: 'artikel',
            objektId: id,
            rolle: d.rolle,
            originalname: d.originalname,
            mime: MIME_BY_EXT[info.ext] ?? 'application/octet-stream',
            groesse: info.groesse,
            sha256: d.sha256,
            pfad: files.relPath('artikel', id, d.rolle, fid, info.ext),
            sortierung: d.sortierung,
            erstelltAm: d.erstelltAm || jetzt,
            erstelltVon: '',
          };
          neueDateien.push({ datei, von: d.id });
        }
        dateiMap.set(d.id, datei);
        if (d.rolle === 'bild') bild.push({ name: dateiName(datei), sort: d.sortierung });
        if (d.rolle === 'druckdatei') {
          modelle.push({ id: datei.id, storedName: dateiName(datei), originalName: datei.originalname, format: info.ext as ModelFile['format'], sizeBytes: datei.groesse, uploadedAt: datei.erstelltAm });
        }
      }
    }
    const videoFinger = a.videos.map((v) => ({ title: v.title, url: v.url, sha: v.dateiId ? (a.dateien.find((d) => d.id === v.dateiId)?.sha256 ?? '') : '' }));

    // Gleich wie vorhanden? Dateien nur vergleichen, wenn die Datei sie enthält (sonst bleiben vorhandene unberührt).
    if (aktuell) {
      const vorhDateien = paket.mitDateien
        ? (dateiSnap.get(aktuell.id) ?? []).filter((d) => (PAKET_ROLLEN as readonly string[]).includes(d.rolle)).map((d) => ({ rolle: d.rolle, sha: d.sha256 })).sort((x, y) => x.rolle.localeCompare(y.rolle))
        : null;
      const vorhVideos = aktuell.videos.filter((v) => paket.mitDateien || !v.file).map((v) => ({ title: v.title, url: v.url, sha: v.file ? shaVonName(aktuell.id, v.file) : '' }));
      const neuVideos = paket.mitDateien ? videoFinger : videoFinger.filter((_, k) => !a.videos[k].dateiId);
      const gleich = fingerabdruck(aktuell, vorhVideos, vorhDateien) === fingerabdruck(data, neuVideos, paket.mitDateien ? [...dateienFinger].sort((x, y) => x.rolle.localeCompare(y.rolle)) : null);
      if (gleich) {
        z.artikel.unveraendert++;
        z.dateien.unveraendert += dateiMap.size;
        continue;
      }
    }

    // Nummer: vorhandenes Druckteil behält seine; neues bekommt die aus der Datei, wenn sie frei ist.
    let nummer = aktuell?.number ?? '';
    if (!aktuell) {
      const wunsch = (a.number ?? '').trim();
      if (wunsch && !nummerBelegt(wunsch)) nummer = wunsch;
      else {
        nummer = nextNumber(db, 'artikel', new Date(), nummerBelegt);
        if (wunsch) details.push({ status: 'hinweis', bereich: 'Druckteil', name: a.name, text: `Nummer ${wunsch} ist hier schon vergeben – neue Nummer ${nummer}` });
      }
    }
    vergebeneNummern.add(nummer);

    for (const n of neueDateien) {
      files.insert(n.datei);
      belegtePfade.add(n.datei.pfad);
      if (opt.tmpDir) verschiebe.push({ von: path.join(opt.tmpDir, n.von), nach: files.absPath(n.datei) });
      z.dateien.neu++;
    }
    z.dateien.unveraendert += dateiMap.size - neueDateien.length;

    let videos: ItemVideo[];
    if (paket.mitDateien) {
      videos = a.videos.map((v) => {
        const d = v.dateiId ? dateiMap.get(v.dateiId) : undefined;
        return { id: ID.test(v.id) ? v.id : newId(), title: v.title, file: d ? dateiName(d) : '', url: d ? '' : v.url, sizeBytes: d?.groesse ?? 0, uploadedAt: v.uploadedAt || jetzt };
      });
    } else {
      // Ältere Datei ohne Dateien: vorhandene Videodateien bleiben, Links kommen aus der Datei.
      videos = [
        ...(aktuell?.videos.filter((v) => v.file) ?? []),
        ...a.videos.filter((v) => !v.dateiId && v.url).map((v) => ({ id: ID.test(v.id) ? v.id : newId(), title: v.title, file: '', url: v.url, sizeBytes: 0, uploadedAt: v.uploadedAt || jetzt })),
      ];
    }
    const vorhandeneVideoIds = itemRepo.videoIdsOfOtherItems(id);
    videos = videos.map((v) => (vorhandeneVideoIds.has(v.id) ? { ...v, id: newId() } : v));

    const item: Item = {
      id,
      number: nummer,
      name: data.name,
      shortDescription: data.shortDescription,
      description: data.description,
      category: data.category,
      kind: data.kind,
      useAreas: data.useAreas,
      sizes: data.sizes,
      colors: data.colors,
      colorAreas: data.colorAreas,
      price: data.price,
      customFields: data.customFields,
      videos,
      material: data.material,
      materialInfo: data.materialInfo,
      printTimeMinutes: data.printTimeMinutes,
      safetyNotes: data.safetyNotes,
      images: paket.mitDateien ? bild.sort((x, y) => x.sort - y.sort).map((b) => b.name) : (aktuell?.images ?? []),
      modelFiles: paket.mitDateien ? modelle : (aktuell?.modelFiles ?? []),
      published: data.published,
      isDemo: a.isDemo,
      createdAt: aktuell?.createdAt || a.createdAt || jetzt,
      updatedAt: jetzt,
    };
    loeschen.push(...itemRepo.save(item));
    for (const w of itemRepo.lastWarnings) details.push({ status: 'hinweis', bereich: 'Druckteil', name: a.name, text: w });
    if (aktuell) {
      z.artikel.ersetzt++;
      details.push({ status: 'ersetzt', bereich: 'Druckteil', name: `${nummer} – ${data.name}`, text: 'durch den Stand aus der Datei ersetzt' });
    } else {
      z.artikel.neu++;
      details.push({ status: 'neu', bereich: 'Druckteil', name: `${nummer} – ${data.name}` });
    }
  }

  // Dateien, deren Pfad neu belegt wurde, nicht löschen (gleicher Pfad = neue Datei).
  const bericht: Bericht = {
    modus: opt.modus,
    artikel: paket.artikel.length,
    vorhanden: [...treffer.values()].filter(Boolean).length,
    abschnitte: z,
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
  return ergebnis.bericht;
}
