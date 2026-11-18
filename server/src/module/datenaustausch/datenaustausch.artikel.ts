import path from 'node:path';
import { istDruckteilBild } from '../../kern/bilder';
import { newId, UUID_PATTERN } from '../../kern/ids';
import { MIME_BY_EXT } from '../../kern/objekttypen';
import type { ColorArea, ItemVideo } from '@mosaik3lab/shared/katalog';
import { itemInputSchema } from '@mosaik3lab/shared/katalog';
import type { Item, ModelFile } from '../../domain/types';
import { normalizeItemInput } from '../katalog/katalog.service';
import type { ItemRepository } from '../katalog/katalog.repository';
import { dateiName, type Datei, type FileStore } from '../../kern/files';
import { nextNumber, type Db } from '../../kern/db';
import { MAX_IMAGES_PER_ITEM, MAX_MODELS_PER_ITEM, MAX_VIDEOS_PER_ITEM } from '../../kern/uploads';
import { PAKET_ROLLEN, type Paket, type PaketArtikel } from './datenaustausch.export';
import { ID } from './datenaustausch.paket';
import { lc } from './datenaustausch.abgleich';
import type { AusfuehrenOptionen, Bericht, Detail, Ergebnis } from './datenaustausch.service';
import type { ergaenzeStammdaten } from './datenaustausch.stammdaten';

// Import, Abschnitt 3: ein Druckteil der Datei einspielen (Farben zuordnen, prüfen, Dateien vorbereiten, mit dem
// vorhandenen vergleichen, Nummer vergeben, speichern). Läuft in der Transaktion von rechne() (datenaustausch.service.ts).

/** Alles, was ein Druckteil beim Einspielen aus dem Gesamtablauf braucht (Zustand wird hier fortgeschrieben). */
export interface ArtikelKontext {
  paket: Paket;
  opt: AusfuehrenOptionen;
  treffer: Map<PaketArtikel, Item | undefined>;
  vorherArtikel: Item[];
  files: FileStore;
  itemRepo: ItemRepository;
  db: Db;
  dateiSnap: Map<string, Datei[]>;
  shaVonName: (objektId: string, name: string) => string;
  fil: ReturnType<typeof ergaenzeStammdaten>['fil'];
  filamentIds: Set<string>;
  kategorieVon: Map<string, string>;
  materialVon: Map<string, string>;
  bereichVon: Map<string, string>;
  farbenVon: (ar: ColorArea) => unknown;
  nummerBelegt: (n: string) => boolean;
  vergebeneNummern: Set<string>;
  jetzt: string;
  lokal: Map<string, string>;
  belegtePfade: Set<string>;
  verschiebe: Ergebnis['verschiebe'];
  loeschen: Datei[];
  z: Bericht['abschnitte'];
  details: Detail[];
  skip: (a: PaketArtikel, grund: string) => void;
  zuordnung: (a: PaketArtikel) => string;
}

/**
 * Vergleichswert eines Druckteils (ohne technische IDs von Dateien, mit Prüfsummen der Dateien). Ähnliche Druckteile
 * gehören bewusst nicht dazu: Sie werden in beiden Modi nur ergänzt, unabhängig davon, ob das Druckteil ersetzt wird.
 * Zählten sie mit, würde ein unverändertes Druckteil nur wegen einer neuen Verknüpfung als „ersetzt“ gelten (samt neu
 * geschriebener Dateien), und weil Partner außerhalb des Exports hier fehlen oder andere IDs haben, wäre der Vergleich nie stabil.
 */
function fingerabdruck(i: Pick<Item, 'name' | 'shortDescription' | 'description' | 'categories' | 'kind' | 'useAreas' | 'sizes' | 'colorAreas' | 'price' | 'customFields' | 'material' | 'materialInfo' | 'printTimeMinutes' | 'safetyNotes' | 'links' | 'published'>, videos: { title: string; url: string; sha: string }[], dateien: { rolle: string; sha: string }[] | null, farben: (a: ColorArea) => unknown) {
  return JSON.stringify({
    n: i.name,
    k: i.shortDescription,
    b: i.description,
    c: i.categories,
    art: i.kind,
    a: [...i.useAreas].sort(),
    g: i.sizes,
    f: i.colorAreas.map((a) => [a.name, farben(a)]),
    p: i.price,
    x: i.customFields.map((f) => [f.label, f.type, f.required, f.maxLength, f.hint, f.options]),
    m: i.material,
    mi: i.materialInfo,
    t: i.printTimeMinutes,
    s: i.safetyNotes,
    l: i.links.map((l) => [l.text, l.beschreibung, l.url]),
    v: i.published,
    vid: videos.map((v) => [v.title, v.url, v.sha]),
    d: dateien,
  });
}

export function spieleArtikelEin(a: PaketArtikel, k: ArtikelKontext): void {
  const { paket, opt, treffer, vorherArtikel, files, itemRepo, db, dateiSnap, shaVonName, fil, filamentIds, kategorieVon, materialVon } = k;
  const { bereichVon, farbenVon, nummerBelegt, vergebeneNummern, jetzt, lokal, belegtePfade, verschiebe, loeschen, z, details, skip, zuordnung } = k;
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
    return;
  }
  if (ohneFarbe.size) {
    const n = ohneFarbe.size;
    details.push({ status: 'hinweis', bereich: 'Druckteil', name: zuordnung(a), text: `${n === 1 ? 'eine Farbe ist' : `${n} Farben sind`} in der Datei nicht beschrieben und ${n === 1 ? 'fehlt' : 'fehlen'} deshalb – bitte danach im Druckteil prüfen` });
  }
  const parsed = itemInputSchema.safeParse({
    name: a.name,
    shortDescription: a.shortDescription,
    description: a.description,
    categories: a.categories,
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
    links: a.links,
    published: a.published,
  });
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    skip(a, `Angaben unvollständig (${i.path.join('.') || 'Angaben'}: ${i.message})`);
    return;
  }
  const data = normalizeItemInput(parsed.data);
  // Schreibweise der Stammdaten hier übernehmen (Groß/Klein egal).
  data.categories = [...new Set(data.categories.map((c) => kategorieVon.get(lc(c)) ?? c))];
  data.material = materialVon.get(lc(data.material)) ?? data.material;
  data.useAreas = data.useAreas.map((u) => bereichVon.get(lc(u)) ?? u);
  const anzahl = (r: string) => a.dateien.filter((d) => d.rolle === r).length;
  if (anzahl('bild') > MAX_IMAGES_PER_ITEM || anzahl('druckdatei') > MAX_MODELS_PER_ITEM || anzahl('video') > MAX_VIDEOS_PER_ITEM) {
    skip(a, `zu viele Dateien (Bilder max. ${MAX_IMAGES_PER_ITEM}, Druckdateien max. ${MAX_MODELS_PER_ITEM}, Videos max. ${MAX_VIDEOS_PER_ITEM})`);
    return;
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
    const gleich = fingerabdruck(aktuell, vorhVideos, vorhDateien, farbenVon) === fingerabdruck(data, neuVideos, paket.mitDateien ? [...dateienFinger].sort((x, y) => x.rolle.localeCompare(y.rolle)) : null, farbenVon);
    if (gleich) {
      z.artikel.unveraendert++;
      z.dateien.unveraendert += dateiMap.size;
      return;
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
  lokal.set(a.id, id);

  for (const n of neueDateien) {
    files.insert(n.datei);
    belegtePfade.add(n.datei.pfad);
    if (opt.tmpDir) verschiebe.push({ von: path.join(opt.tmpDir, n.von), nach: files.absPath(n.datei), bildId: istDruckteilBild(n.datei) ? n.datei.id : undefined });
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
    categories: data.categories,
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
    links: data.links,
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
