import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Category, Filament, MasterData, SimpleEntry } from '../../domain/settings';
import type { ColorArea, CustomField, Item } from '../../domain/types';
import { dateiName, type Datei } from '../../kern/files';
import type { Storage } from '../../storage';
import { schemaVersion } from '../../kern/db';
import { ROOT_DIR } from '../../config';
import { notFound } from '../../kern/errors';
import { aehnlicheFuerExport, type PaketAehnlich } from './datenaustausch.aehnliche';
import { ORDNER, zipStrom } from './datenaustausch.zip';

// Export-Datei für Druckteile (Format „mosaik3lab-stammdaten“; der Name bleibt, damit ältere Dateien lesbar bleiben).
//
// Format 2 (seit 1.7.0): eine ZIP-Datei – Aufbau und Sicherheitsregeln in datenaustausch.zip.ts. `paket.json` enthält
// dasselbe Objekt wie bisher die erste Zeile (Kopf, Stammdaten, Druckteile mit Datei-Metadaten samt SHA-256), dazu je
// Datei ihren Pfad im ZIP und je Druckteil seine ähnlichen Druckteile (`aehnliche`). Die Dateien liegen als echte
// Binärdateien daneben (kein Base64 mehr, im Explorer/Finder ansehbar).
//
// Format 1 (bis 1.6.x, wird weiter gelesen): eine JSON-Datei, zeilenweise aufgebaut:
//   Zeile 1:   {"format":…,"kopf":…,"stammdaten":…,"artikel":[…],"dateiinhalte":[
//   Zeile 2…:  {"id":"<datei-id>","daten":"<Base64>"},          (eine Datei je Zeile)
//   Letzte:    ]}
// Enthalten: die gewählten Druckteile (einer, mehrere oder alle) mit Bildern, Videos und Druckdateien und nur die
// Stammdaten, auf die sie verweisen (Kategorie, Einsatzbereiche, Material, Farbrollen). Nie enthalten: Anfragen,
// Lehrkräfte, Konten, Passwörter, Einstellungen.
// Ältere Exporte (`auswahl` fehlt: alle Stammdaten und Anfragestatus, evtl. ohne Dateien) liest der Import weiterhin.
// Ältere Installationen (bis 1.6.x) können ZIP nicht lesen und melden „keine Export-Datei“ – die Zielschule braucht 1.7.0.

export const PAKET_FORMAT = 'mosaik3lab-stammdaten';
/** Aktuelle Formatversion (2 = ZIP). Version 1 = JSON-Zeilen-Datei (wird nur noch gelesen). */
export const PAKET_VERSION = 2;
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
  /** Pfad im ZIP (Format 2), z. B. „bilder/<id>.png“; fehlt in Format 1. */
  pfad?: string;
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
  /** Ähnliche Druckteile (auch nicht exportierte): ID in der Quelle; Name und Nummer nur als Hilfe. Fehlt in älteren Dateien. */
  aehnliche: PaketAehnlich[];
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
    const file = path.join(ROOT_DIR, 'package.json');
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
  const aehnliche = aehnlicheFuerExport(storage.sqlite.db, items.map((i) => i.id));

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
        pfad: zipPfad(d),
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
    artikel.push({ ...rest, dateien: list, videos: paketVideos, aehnliche: aehnliche.get(item.id) ?? [] });
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

/** Dateiname: ein Druckteil → mosaik3lab-druckteil-<Nummer>.zip, sonst mosaik3lab-druckteile-JJJJ-MM-TT.zip */
export function exportDateiname(items: Pick<Item, 'number'>[], d = new Date()) {
  const nummer = (items.length === 1 ? (items[0].number ?? '') : '').replace(/[^A-Za-z0-9-]/g, '');
  return nummer ? `mosaik3lab-druckteil-${nummer}.zip` : `mosaik3lab-druckteile-${d.toISOString().slice(0, 10)}.zip`;
}

/** Pfad einer Datei im ZIP: Ordner nach Rolle, Name = Datei-ID + Endung der gespeicherten Datei. */
export const zipPfad = (d: Pick<Datei, 'id' | 'pfad' | 'rolle'>) => `${ORDNER[d.rolle as keyof typeof ORDNER]}/${dateiName(d)}`;

/**
 * Export vorbereiten (Fehler wie „gibt es nicht“ kommen hier, vor dem ersten Byte) → Dateiname und Strom (ZIP). Die
 * Dateien werden nacheinander von der Platte gelesen – im Speicher liegt immer nur ein Block.
 */
export async function erzeugeExport(storage: Storage, opts: ExportOptionen) {
  const { paket, inhalt, name } = await buildPaket(storage, opts);
  const dateien = inhalt.map((d) => ({ pfad: zipPfad(d), quelle: storage.files.absPath(d), groesse: d.groesse, mtime: d.erstelltAm }));
  return { name, artikel: paket.artikel.length, dateien: inhalt.length, strom: zipStrom(JSON.stringify(paket, null, 2), dateien) };
}

export type { ColorArea, CustomField };
