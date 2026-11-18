import { newId } from '../../domain/ids';
import { userCan } from '../../domain/permissions';
import { allAreaColors, singleColorArea, type ColorArea, type CustomField, type Item, type ItemVideo, type ModelFile, type User } from '../../domain/types';
import { badRequest, notFound } from '../../kern/errors';
import { dateiName, type Datei } from '../../kern/files';
import {
  detectImage,
  detectModel,
  detectVideo,
  MAX_IMAGES_PER_ITEM,
  MAX_MODELS_PER_ITEM,
  MAX_VIDEOS_PER_ITEM,
  originalName,
} from '../../kern/uploads';
import type { Storage } from '../../storage';
import type { ParsedItemInput } from '@mosaik3lab/shared/katalog';
import { passtZurSuche } from '@mosaik3lab/shared/suche';

// Regeln für Druckteile: Eingaben vereinheitlichen, Stammdaten prüfen, Sichtbarkeit, Bilder/Videos/Druckdateien.

/** Eingabe nach dem Vereinheitlichen: Farbbereiche mit IDs, colors = alle Farben aller Bereiche. */
type ItemData = Omit<ParsedItemInput, 'colors' | 'colorAreas' | 'customFields'> & {
  colors: string[];
  colorAreas: ColorArea[];
  customFields: CustomField[];
};

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Behält gültige, eindeutige IDs (damit Anfragen zuordenbar bleiben), vergibt sonst neue. */
function withIds<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.map((entry) => {
    const id = ID_PATTERN.test(entry.id) && !seen.has(entry.id) ? entry.id : newId();
    seen.add(id);
    return { ...entry, id };
  });
}

export function normalizeItemInput(input: ParsedItemInput): ItemData {
  const { colors, colorAreas, customFields, links, ...rest } = input;
  // „Alle Farben“: keine feste Liste speichern.
  const areas = withIds(colorAreas ?? singleColorArea(colors ?? [])).map((a) =>
    a.alleFarben ? { ...a, colors: [], gruppen: [] } : { ...a, alleFarben: false, gruppen: a.gruppen ?? [] },
  );
  return { ...rest, colorAreas: areas, colors: allAreaColors(areas), customFields: withIds(customFields), links: withIds(links) };
}

export const siehtEntwuerfe = (user: User | undefined) => userCan(user, 'catalog:view');

/** Nur das Druck-Team sieht Details zu Druckdateien. */
export function presentItem(item: Item, user: User | undefined) {
  const base = { ...item, modelFileCount: item.modelFiles.length };
  return siehtEntwuerfe(user) ? base : { ...base, modelFiles: [] };
}

const touched = () => new Date().toISOString();

/** Kategorie, Einsatzbereiche, Material und Farbrollen müssen in den Stammdaten vorhanden sein. */
async function assertMasterData(storage: Storage, input: ItemData) {
  const { masterData: md } = await storage.settings.get();
  const fields: Record<string, string> = {};
  if (!md.categories.some((c) => c.name === input.category)) fields.category = 'Unbekannte Kategorie';
  if (!md.materials.some((m) => m.name === input.material)) fields.material = 'Unbekanntes Material';
  if (input.useAreas.some((a) => !md.useAreas.some((u) => u.name === a))) fields.useAreas = 'Unbekannter Einsatzbereich';
  // Farben werden per Filament-ID referenziert (Item.colors).
  if (input.colors.some((id) => !md.filaments.some((f) => f.id === id))) {
    fields.colors = 'Unbekannte Farbrolle';
    fields.colorAreas = 'Unbekannte Farbrolle';
  }
  if (Object.keys(fields).length) throw badRequest('Bitte Werte aus den Stammdaten wählen.', fields);
}

export interface ItemFilter {
  q: string;
  category: string;
  area: string;
  kind: string;
  all: boolean;
}

/** Katalog mit Suche und Filtern; Entwürfe nur mit Verwaltungsrecht und `all`. */
export async function listItems(storage: Storage, user: User | undefined, f: ItemFilter) {
  const includeUnpublished = f.all && siehtEntwuerfe(user);
  const items = (includeUnpublished ? await storage.items.list() : storage.items.listPublished())
    .filter((i) => !f.category || i.category === f.category)
    .filter((i) => !f.area || i.useAreas.includes(f.area))
    // Art-Filter: „Hilfsmittel“ bzw. „Lehrmittel“ zeigt auch Druckteile der Art „beides“.
    .filter((i) => !f.kind || i.kind === f.kind || (i.kind === 'beides' && (f.kind === 'hilfsmittel' || f.kind === 'lehrmittel')))
    // Suche wie überall in der App (Umlaute, ß, mehrere Wörter): shared/src/suche.ts
    .filter((i) => passtZurSuche([i.name, i.shortDescription, i.description, i.category, i.material, ...i.useAreas], f.q))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return items.map((i) => presentItem(i, user));
}

export async function loadVisible(storage: Storage, id: string, user: User | undefined) {
  const item = await storage.items.findById(id);
  if (!item || (!item.published && !siehtEntwuerfe(user))) throw notFound('Druckteil nicht gefunden.');
  return item;
}

/** Änderung an einem Druckteil; nicht gefunden → 404. */
async function change(storage: Storage, id: string, fn: (current: Item) => Item) {
  const updated = await storage.items.update(id, fn);
  if (!updated) throw notFound('Druckteil nicht gefunden.');
  return updated;
}

export async function createItem(storage: Storage, input: ParsedItemInput) {
  const data = normalizeItemInput(input);
  await assertMasterData(storage, data);
  const now = touched();
  return storage.items.create({ ...data, id: newId(), images: [], modelFiles: [], videos: [], isDemo: false, createdAt: now, updatedAt: now });
}

export async function updateItem(storage: Storage, id: string, input: ParsedItemInput) {
  const data = normalizeItemInput(input);
  await assertMasterData(storage, data);
  return change(storage, id, (current) => ({ ...current, ...data, updatedAt: touched() }));
}

export const setPublished = (storage: Storage, id: string, published: boolean) =>
  change(storage, id, (c) => ({ ...c, published, updatedAt: touched() }));

/** Bilder, Druckdateien und Videos löscht der Speicher mit; Anfragen behalten ihren Namens-Schnappschuss. */
export async function deleteItem(storage: Storage, id: string) {
  if (!(await storage.items.delete(id))) throw notFound('Druckteil nicht gefunden.');
}

// --- Bilder ------------------------------------------------------------------

export async function addImages(storage: Storage, id: string, files: Express.Multer.File[], userId: string) {
  if (files.length === 0) throw badRequest('Bitte mindestens ein Bild auswählen.');
  const item = await storage.items.findById(id);
  if (!item) throw notFound('Druckteil nicht gefunden.');
  if (item.images.length + files.length > MAX_IMAGES_PER_ITEM) {
    throw badRequest(`Pro Druckteil sind höchstens ${MAX_IMAGES_PER_ITEM} Bilder möglich.`);
  }
  const exts = files.map(detectImage); // erst alles prüfen, dann speichern
  const gespeichert: Datei[] = [];
  // Erst eintragen (ein gleichzeitiges Speichern des Formulars darf die neuen Bilder nicht verwerfen), dann verarbeiten.
  // Scheitert das Eintragen (Druckteil inzwischen gelöscht, Höchstzahl durch gleichzeitigen Upload erreicht), werden die
  // Dateien wieder entfernt.
  const eingetragen = await mitAufraeumen(storage, gespeichert, async () => {
    for (let i = 0; i < files.length; i++) {
      gespeichert.push(
        await storage.files.save({ objekttyp: 'artikel', objektId: item.id, rolle: 'bild', buffer: files[i].buffer, ext: exts[i], originalname: originalName(files[i]), erstelltVon: userId }),
      );
    }
    const namen = gespeichert.map(dateiName);
    return change(storage, item.id, (c) => {
      if (c.images.length + namen.length > MAX_IMAGES_PER_ITEM) throw badRequest(`Pro Druckteil sind höchstens ${MAX_IMAGES_PER_ITEM} Bilder möglich.`);
      return { ...c, images: [...new Set([...c.images, ...namen])], updatedAt: touched() };
    });
  });
  const saved = gespeichert.map(dateiName);
  const geaendert = await bilderVerarbeiten(storage, saved);
  return geaendert ? ((await storage.items.findById(item.id)) ?? eingetragen) : eingetragen;
}

/** Gesamtzeit, die ein Upload höchstens auf die Verarbeitung wartet; der Rest läuft in der Bildpflege nach. */
const UPLOAD_VERARBEITUNG_MS = 120_000;

/**
 * Neue Bilder gleich fertig verarbeiten (Original ggf. verkleinern, Vorschaubilder „karte“ und „mini“), bevor die Antwort
 * kommt. Scheitert das, bleibt das Original gespeichert – die Bildpflege bzw. der erste Abruf holt es nach.
 * → true, wenn sich ein Dateiname geändert hat (z. B. PNG → JPG).
 */
async function bilderVerarbeiten(storage: Storage, namen: string[]) {
  const ende = Date.now() + UPLOAD_VERARBEITUNG_MS;
  let geaendert = false;
  for (const name of namen) {
    const d = storage.files.findByName(name, 'bild');
    if (!d) continue;
    if (Date.now() > ende) {
      storage.bildpflege.nachholen([d.id]).catch((err: Error) => console.warn(`[Bilder] Bildpflege: ${err.message}`));
      continue;
    }
    try {
      const r = await storage.bilder.verarbeite(d, 'sofort');
      if (dateiName(r.datei) !== name) geaendert = true;
    } catch (err) {
      console.warn(`[Bilder] ${d.pfad}: Vorschau nicht erzeugt, Original bleibt – ${(err as Error).message}`);
    }
  }
  return geaendert;
}

/**
 * Bildname aus dem Editor → aktueller Name im Druckteil. Die Bildpflege kann die Endung inzwischen geändert haben
 * (PNG → JPG, gleiche Datei-ID); offene Seiten schicken dann noch den alten Namen.
 */
const bildIdVon = (name: string) => name.replace(/[.][^.]*$/, '');
const aktuellerName = (images: string[], name: string) => (images.includes(name) ? name : (images.find((f) => bildIdVon(f) === bildIdVon(name)) ?? name));

export const reorderImages = (storage: Storage, id: string, wunsch: string[]) =>
  change(storage, id, (c) => {
    const images = wunsch.map((f) => aktuellerName(c.images, f));
    const same = images.length === c.images.length && new Set(images).size === images.length && images.every((f) => c.images.includes(f));
    if (!same) throw badRequest('Die Bildliste passt nicht zum Druckteil.');
    return { ...c, images, updatedAt: touched() };
  });

export const removeImage = (storage: Storage, id: string, name: string) =>
  change(storage, id, (c) => {
    const file = aktuellerName(c.images, name);
    if (!c.images.includes(file)) throw notFound('Bild nicht gefunden.');
    return { ...c, images: c.images.filter((f) => f !== file), updatedAt: touched() };
  });

// --- Videos (Upload MP4/WebM oder Link) --------------------------------------

const addVideo = (storage: Storage, itemId: string, video: ItemVideo) =>
  change(storage, itemId, (c) => {
    if (c.videos.length >= MAX_VIDEOS_PER_ITEM) {
      throw badRequest(`Pro Druckteil sind höchstens ${MAX_VIDEOS_PER_ITEM} Videos möglich.`);
    }
    return { ...c, videos: [...c.videos, video], updatedAt: touched() };
  });

/** Video-Datei speichern und eintragen; schlägt das Eintragen fehl, wird die Datei wieder entfernt. */
export async function uploadVideo(storage: Storage, itemId: string, file: Express.Multer.File, title: string, userId: string) {
  const ext = detectVideo(file);
  if (!(await storage.items.findById(itemId))) throw notFound('Druckteil nicht gefunden.');
  const original = originalName(file);
  const d = await storage.files.save({ objekttyp: 'artikel', objektId: itemId, rolle: 'video', buffer: file.buffer, ext, originalname: original, erstelltVon: userId });
  try {
    return await addVideo(storage, itemId, {
      id: newId(),
      title: title || original.replace(/\.[^.]+$/, ''),
      file: dateiName(d),
      url: '',
      sizeBytes: file.size,
      uploadedAt: touched(),
    });
  } catch (err) {
    await storage.files.delete(d.id);
    throw err;
  }
}

export const addVideoLink = (storage: Storage, itemId: string, title: string, url: string) =>
  addVideo(storage, itemId, { id: newId(), title: title || 'Video', file: '', url, sizeBytes: 0, uploadedAt: touched() });

export const removeVideo = (storage: Storage, itemId: string, videoId: string) =>
  change(storage, itemId, (c) => {
    const removed = c.videos.find((v) => v.id === videoId);
    if (!removed) throw notFound('Video nicht gefunden.');
    return { ...c, videos: c.videos.filter((v) => v !== removed), updatedAt: touched() };
  });

// --- Druckdateien (STL / 3MF) -----------------------------------------------

export async function addModels(storage: Storage, id: string, files: Express.Multer.File[], userId: string) {
  if (files.length === 0) throw badRequest('Bitte mindestens eine Druckdatei auswählen.');
  const item = await storage.items.findById(id);
  if (!item) throw notFound('Druckteil nicht gefunden.');
  if (item.modelFiles.length + files.length > MAX_MODELS_PER_ITEM) {
    throw badRequest(`Pro Druckteil sind höchstens ${MAX_MODELS_PER_ITEM} Druckdateien möglich.`);
  }
  const formats = files.map(detectModel);
  const gespeichert: Datei[] = [];
  return mitAufraeumen(storage, gespeichert, async () => {
    const added: ModelFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const d = await storage.files.save({ objekttyp: 'artikel', objektId: item.id, rolle: 'druckdatei', buffer: files[i].buffer, ext: formats[i], originalname: originalName(files[i]), erstelltVon: userId });
      gespeichert.push(d);
      added.push({ id: d.id, storedName: dateiName(d), originalName: d.originalname, format: formats[i], sizeBytes: d.groesse, uploadedAt: d.erstelltAm });
    }
    return change(storage, item.id, (c) => {
      if (c.modelFiles.length + added.length > MAX_MODELS_PER_ITEM) throw badRequest(`Pro Druckteil sind höchstens ${MAX_MODELS_PER_ITEM} Druckdateien möglich.`);
      return { ...c, modelFiles: [...c.modelFiles.filter((m) => !added.some((a) => a.id === m.id)), ...added], updatedAt: touched() };
    });
  });
}

/** Führt `fn` aus; wirft es, werden die bis dahin gespeicherten Dateien (Datensatz + Datei) wieder entfernt. */
async function mitAufraeumen<T>(storage: Storage, gespeichert: Datei[], fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    for (const d of gespeichert) await storage.files.delete(d.id).catch(() => undefined);
    throw err;
  }
}

export const removeModel = (storage: Storage, itemId: string, modelId: string) =>
  change(storage, itemId, (c) => {
    if (!c.modelFiles.some((m) => m.id === modelId)) throw notFound('Druckdatei nicht gefunden.');
    return { ...c, modelFiles: c.modelFiles.filter((m) => m.id !== modelId), updatedAt: touched() };
  });

// --- Auslieferung der Dateien ------------------------------------------------

/** Datei eines Druckteils: veröffentlicht → für alle, Entwurf → nur für das Druck-Team. */
export async function visibleItemFile(storage: Storage, name: string, rolle: 'bild' | 'video', user: User | undefined) {
  // Bild mit geänderter Endung (die Bildpflege hat z. B. PNG → JPG verkleinert): über die ID weiter finden (offene Seiten).
  const datei = storage.files.findByName(name, rolle) ?? (rolle === 'bild' ? storage.files.findByName(name, rolle, { endungEgal: true }) : undefined);
  if (!datei || datei.objekttyp !== 'artikel') return undefined;
  // nur die Sichtbarkeit lesen – nicht das ganze Druckteil (eine Abfrage je Bild statt rund zehn)
  const veroeffentlicht = storage.items.istVeroeffentlicht(datei.objektId);
  if (veroeffentlicht === undefined || (!veroeffentlicht && !siehtEntwuerfe(user))) return undefined;
  return datei;
}
