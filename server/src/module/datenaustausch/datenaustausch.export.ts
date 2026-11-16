import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Category, Filament, MasterData, SimpleEntry } from '../../domain/settings';
import type { ColorArea, CustomField, Item } from '../../domain/types';
import type { Datei } from '../../kern/files';
import type { Storage } from '../../storage';
import { schemaVersion } from '../../kern/db';
import { notFound } from '../../kern/errors';

// Export-Datei für Druckteile (Format „mosaik3lab-stammdaten“, Version 1 – Name und Aufbau bleiben, damit ältere
// Dateien lesbar bleiben und ältere Installationen neue Dateien lesen können).
//
// Eine JSON-Datei, zeilenweise aufgebaut, damit sie auch bei großen Dateien nie ganz im Speicher stehen muss:
//   Zeile 1:   {"format":…,"kopf":…,"stammdaten":…,"artikel":[…],"dateiinhalte":[
//   Zeile 2…:  {"id":"<datei-id>","daten":"<Base64>"},          (eine Datei je Zeile)
//   Letzte:    ]}
// Die Datei ist als Ganzes gültiges JSON. Metadaten der Dateien (Rolle, Name, MIME, Größe, SHA-256) stehen beim
// Druckteil, die Bytes in `dateiinhalte`. Enthalten: die gewählten Druckteile (einer, mehrere oder alle) mit Bildern,
// Videos und Druckdateien und nur die Stammdaten, auf die sie verweisen (Kategorie, Einsatzbereiche, Material,
// Farbrollen). Nie enthalten: Anfragen, Lehrkräfte, Konten, Passwörter, Einstellungen.
// Ältere Exporte (`auswahl` fehlt: alle Stammdaten und Anfragestatus, evtl. ohne Dateien) liest der Import weiterhin.

export const PAKET_FORMAT = 'mosaik3lab-stammdaten';
export const PAKET_VERSION = 1;
export const KOPF_ENDE = ',"dateiinhalte":[';
export const PAKET_ENDE = ']}';
/** Dateirollen eines Artikels, die ins Paket gehören. */
export const PAKET_ROLLEN = ['bild', 'video', 'druckdatei'] as const;

export interface PaketDatei {
  id: string;
  rolle: (typeof PAKET_ROLLEN)[number];
  originalname: string;
  mime: string;
  groesse: number;
  sha256: string;
  sortierung: number;
  erstelltAm: string;
}

export interface PaketVideo {
  id: string;
  title: string;
  url: string;
  /** ID der Videodatei in `dateien` des Artikels (leer = nur Link). */
  dateiId: string;
  uploadedAt: string;
}

export type PaketArtikel = Omit<Item, 'images' | 'modelFiles' | 'videos' | 'colors'> & {
  dateien: PaketDatei[];
  videos: PaketVideo[];
};

export interface Paket {
  format: typeof PAKET_FORMAT;
  version: number;
  exportiertAm: string;
  appVersion: string;
  schemaVersion: number;
  mitDateien: boolean;
  /** Nur die Stammdaten der enthaltenen Druckteile (neue Exporte immer; fehlt in älteren = alle Stammdaten). */
  auswahl?: boolean;
  /** Hinweise des Exports (z. B. Dateien, die in der Ablage fehlten). */
  hinweise: string[];
  stammdaten: {
    kategorien: Category[];
    einsatzbereiche: SimpleEntry[];
    materialien: SimpleEntry[];
    filamente: Filament[];
    statusarten: { id: string; aktiv: boolean }[];
  };
  artikel: PaketArtikel[];
}

export function appVersion(): string {
  try {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    return String(JSON.parse(fs.readFileSync(file, 'utf8')).version ?? '0');
  } catch {
    return '0';
  }
}

const sortByNumber = (a: Item, b: Item) => (a.number ?? '').localeCompare(b.number ?? '') || a.id.localeCompare(b.id);

/** Höchstzahl Druckteile im Teil-Export (die IDs stehen in der Adresse). */
export const MAX_AUSWAHL = 200;

export interface ExportOptionen {
  /** Nur diese Druckteile (IDs) exportieren. Fehlt = alle. */
  artikel?: string[];
}

function waehleArtikel(items: Item[], ids: string[]): Item[] {
  const gewuenscht = new Set(ids);
  const gefunden = items.filter((i) => gewuenscht.has(i.id));
  if (!gefunden.length || gefunden.length !== gewuenscht.size) throw notFound('Mindestens eines der gewählten Druckteile gibt es nicht (mehr).');
  return gefunden;
}

/** Nur die Stammdaten, auf die die gewählten Druckteile verweisen. */
function benutzteStammdaten(md: MasterData, items: Item[]): MasterData {
  const kategorien = new Set(items.map((i) => i.category));
  const materialien = new Set(items.map((i) => i.material));
  const bereiche = new Set(items.flatMap((i) => i.useAreas));
  // „Alle Farben“ braucht keine Farbrollen in der Datei (am Ziel gelten dessen Farbrollen).
  const farben = new Set(items.flatMap((i) => i.colorAreas.flatMap((a) => (a.alleFarben ? [] : a.colors))));
  return {
    ...md,
    categories: md.categories.filter((k) => kategorien.has(k.name)),
    materials: md.materials.filter((m) => materialien.has(m.name)),
    useAreas: md.useAreas.filter((u) => bereiche.has(u.name)),
    filaments: md.filaments.filter((f) => farben.has(f.id)),
  };
}

/** Baut Kopf, Stammdaten und Artikel (nur Metadaten, ohne Dateibytes). */
export async function buildPaket(storage: Storage, opts: ExportOptionen) {
  const [settings, alleItems] = await Promise.all([storage.settings.get(), storage.items.list()]);
  if (!alleItems.length) throw notFound('Es gibt noch keine Druckteile zum Exportieren.');
  const items = opts.artikel ? waehleArtikel(alleItems, opts.artikel) : alleItems;
  const dateien = new Map<string, Datei[]>();
  for (const d of storage.files.listByTyp('artikel')) {
    if (!(PAKET_ROLLEN as readonly string[]).includes(d.rolle)) continue;
    dateien.set(d.objektId, [...(dateien.get(d.objektId) ?? []), d]);
  }
  const hinweise: string[] = [];
  const inhalt: Datei[] = [];

  const artikel: PaketArtikel[] = [];
  for (const item of [...items].sort(sortByNumber)) {
    const { images: _i, modelFiles: _m, videos, colors: _c, ...ohneFarbbereiche } = item;
    const rest = { ...ohneFarbbereiche, colorAreas: item.colorAreas.map((a) => (a.alleFarben ? { ...a, colors: [] } : a)) };
    const list: PaketDatei[] = [];
    for (const d of dateien.get(item.id) ?? []) {
      // Fehlt die Datei in der Ablage (oder hat sie eine andere Größe), kann sie nicht ins Paket.
      const stat = await fsp.stat(storage.files.absPath(d)).catch(() => undefined);
      if (!stat?.isFile() || stat.size !== d.groesse) {
        hinweise.push(`Datei „${d.originalname || d.id}“ von ${item.number ?? item.name} fehlt in der Ablage und wurde nicht exportiert.`);
        continue;
      }
      inhalt.push(d);
      list.push({
        id: d.id,
        rolle: d.rolle as PaketDatei['rolle'],
        originalname: d.originalname,
        mime: d.mime,
        groesse: d.groesse,
        sha256: d.sha256,
        sortierung: d.sortierung,
        erstelltAm: d.erstelltAm,
      });
    }
    const ids = new Set(list.map((d) => d.id));
    const dateiIdOfVideo = (v: Item['videos'][number]) => {
      const name = v.file?.replace(/\.[^.]+$/, '') ?? '';
      return name && ids.has(name) ? name : '';
    };
    const paketVideos: PaketVideo[] = [];
    for (const v of videos) {
      const dateiId = dateiIdOfVideo(v);
      if (v.file && !dateiId) continue; // hochgeladenes Video ohne Datei im Paket
      paketVideos.push({ id: v.id, title: v.title, url: v.url, dateiId, uploadedAt: v.uploadedAt });
    }
    artikel.push({ ...rest, dateien: list, videos: paketVideos });
  }

  const md = benutzteStammdaten(settings.masterData, items);
  const paket: Paket = {
    format: PAKET_FORMAT,
    version: PAKET_VERSION,
    exportiertAm: new Date().toISOString(),
    appVersion: appVersion(),
    schemaVersion: schemaVersion(storage.sqlite.db),
    mitDateien: true,
    auswahl: true,
    hinweise,
    stammdaten: {
      kategorien: md.categories,
      einsatzbereiche: md.useAreas,
      materialien: md.materials,
      filamente: md.filaments,
      statusarten: [],
    },
    artikel,
  };
  return { paket, inhalt, name: exportDateiname(items) };
}

/** Dateiname: ein Druckteil → mosaik3lab-druckteil-<Nummer>.json, sonst mosaik3lab-druckteile-JJJJ-MM-TT.json */
export function exportDateiname(items: Pick<Item, 'number'>[], d = new Date()) {
  const nummer = (items.length === 1 ? (items[0].number ?? '') : '').replace(/[^A-Za-z0-9-]/g, '');
  return nummer ? `mosaik3lab-druckteil-${nummer}.json` : `mosaik3lab-druckteile-${d.toISOString().slice(0, 10)}.json`;
}

/**
 * Export vorbereiten (Fehler wie „gibt es nicht“ kommen hier, vor dem ersten Byte) → Dateiname und Strom. Der Strom
 * liefert Textstücke; Dateien werden nacheinander von der Platte gelesen und in Base64-Blöcken ausgegeben – im Speicher
 * liegt nie mehr als ein Block (rund 1 MB).
 */
export async function erzeugeExport(storage: Storage, opts: ExportOptionen) {
  const { paket, inhalt, name } = await buildPaket(storage, opts);
  return { name, artikel: paket.artikel.length, dateien: inhalt.length, strom: paketStrom(storage, paket, inhalt) };
}

async function* paketStrom(storage: Storage, paket: Paket, inhalt: Datei[]): AsyncGenerator<string> {
  const kopf = JSON.stringify(paket);
  yield kopf.slice(0, -1) + KOPF_ENDE + '\n';
  for (let i = 0; i < inhalt.length; i++) {
    const d = inhalt[i];
    yield `{"id":${JSON.stringify(d.id)},"daten":"`;
    let rest = Buffer.alloc(0);
    // Blockgröße durch 3 teilbar, damit jeder Block für sich gültiges Base64 ergibt (Rest wird vorgetragen).
    for await (const chunk of fs.createReadStream(storage.files.absPath(d), { highWaterMark: 3 * 256 * 1024 }) as AsyncIterable<Buffer>) {
      const buf = rest.length ? Buffer.concat([rest, chunk]) : chunk;
      const usable = buf.length - (buf.length % 3);
      rest = buf.subarray(usable);
      if (usable) yield buf.subarray(0, usable).toString('base64');
    }
    if (rest.length) yield rest.toString('base64');
    yield `"}${i < inhalt.length - 1 ? ',' : ''}\n`;
  }
  yield PAKET_ENDE + '\n';
}

export type { ColorArea, CustomField };
