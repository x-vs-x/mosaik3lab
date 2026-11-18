import { z } from 'zod';
import { httpLink, text, uniqueList } from './basis';
import { CUSTOM_FIELD_TYPES, ITEM_KINDS, MAX_COLOR_AREAS, MAX_CUSTOM_FIELDS, MAX_CUSTOM_VALUE_LENGTH, MAX_ITEM_LINKS } from './werte/katalog';

// Katalog: Druckteile mit Farbbereichen, Personalisierung, Videos und Art (Glossar: docs/ARCHITEKTUR.md).
// Listen, Grenzen und Farbgruppen-Hilfen ohne zod stehen in werte/katalog.ts (auch für den Client) – hier wieder exportiert.
// Kategorie, Einsatzbereiche, Material und Farbrollen prüft der Server zusätzlich gegen die Stammdaten (module/katalog/katalog.service.ts).
export * from './werte/katalog';

/** Benannter Farbbereich eines Druckteils (z. B. „Griff“, „Grundplatte“) mit den dort erlaubten Farbrollen. */
export const colorAreaSchema = z
  .object({
    /** Leer = neuer Bereich (ID vergibt der Server). */
    id: z.string().trim().max(64).default(''),
    name: text(1, 40),
    /**
     * „Alle Farben“: alle Farbrollen, auch später angelegte. colors ist dann beim Speichern egal; beim Lesen füllt der
     * Server alle Farbrollen ein (Lehrkräften werden davon nur die vorrätigen angeboten).
     */
    alleFarben: z.boolean().optional(),
    /** IDs von Farbrollen (Filamenten) aus den Stammdaten – bei „nur bestimmte Farben“. */
    colors: uniqueList(text(1, 64), 0, 200),
    /**
     * Ganze Gruppen, auch mit später angelegten Farbrollen: `linie:<Marke Linie>` (z. B. „linie:Bambu Lab PLA Basic“) oder
     * `art:<Materialart>` (z. B. „art:PLA“ = alle PLA-Linien). Beim Lesen füllt der Server die passenden Rollen in colors ein.
     */
    gruppen: uniqueList(text(1, 140), 0, 50).optional(),
  })
  .refine((a) => a.alleFarben || a.colors.length > 0 || (a.gruppen?.length ?? 0) > 0, {
    message: 'Bitte mindestens eine Farbe wählen',
    path: ['colors'],
  });
export type ColorArea = z.infer<typeof colorAreaSchema>;

/** POST /api/items/farbe-zuordnen – eine Farbrolle mehreren Druckteilen (Farbbereichen) auf einmal hinzufügen. */
export const farbeZuordnenSchema = z.object({
  filamentId: text(1, 64),
  ziele: z
    .array(z.object({ itemId: text(1, 64), bereiche: z.array(text(1, 64)).min(1).max(8) }))
    .min(1)
    .max(1000),
});
/** Antwort auf POST /api/items/farbe-zuordnen: geänderte Druckteile und Farbbereiche. */
export interface FarbeZuordnenErgebnis {
  druckteile: number;
  bereiche: number;
}

/** Angabe, die beim Anfragen eines personalisierbaren Druckteils abgefragt wird (z. B. „Beschriftung“). */
export const customFieldSchema = z
  .object({
    id: z.string().trim().max(64).default(''),
    label: text(1, 60),
    type: z.enum(CUSTOM_FIELD_TYPES),
    required: z.boolean().default(false),
    /** Höchstlänge der Eingabe (wird serverseitig geprüft). */
    maxLength: z.number().int().min(1).max(MAX_CUSTOM_VALUE_LENGTH).default(60),
    hint: z.string().trim().max(200).default(''),
    /** Nur bei Typ „select“: Auswahlmöglichkeiten. */
    options: uniqueList(text(1, 60), 0, 30).default([]),
  })
  .refine((f) => f.type !== 'select' || f.options.length > 0, {
    message: 'Auswahlfelder brauchen mindestens eine Auswahlmöglichkeit',
    path: ['options'],
  });
export type CustomField = z.infer<typeof customFieldSchema>;

/** Link-Knopf am Druckteil, z. B. „Taster-Beispiel“ mit Link zum Bestellen eines Elektroteils. */
export const itemLinkSchema = z.object({
  /** Leer = neuer Link (ID vergibt der Server). */
  id: z.string().trim().max(64).default(''),
  /** Knopftext. */
  text: text(1, 60),
  /** Kurze Beschreibung unter dem Knopf (freiwillig). */
  beschreibung: z.string().trim().max(300).default(''),
  url: httpLink,
});
export type ItemLink = z.infer<typeof itemLinkSchema>;

export const itemInputSchema = z.object({
  name: text(3, 100),
  shortDescription: text(10, 200),
  description: z.string().trim().max(3000).default(''),
  category: text(1, 60),
  kind: z.enum(ITEM_KINDS).default('hilfsmittel'),
  useAreas: z
    .array(text(1, 60))
    .max(50)
    .default([])
    .transform((l) => [...new Set(l)]),
  // Filament-IDs aus den Stammdaten.
  // Ältere Clients senden nur colors (ein Bereich), neuere colorAreas; Item.colors wird daraus abgeleitet.
  colors: uniqueList(text(1, 64), 1, 30).optional(),
  colorAreas: z.array(colorAreaSchema).min(1).max(MAX_COLOR_AREAS).optional(),
  /** Freier Preistext, z. B. „ca. 2 € Material“ – leer = keine Angabe. */
  price: z.string().trim().max(80).default(''),
  customFields: z.array(customFieldSchema).max(MAX_CUSTOM_FIELDS).default([]),
  /** Verfügbare Größen – freiwillig; leer = beim Anfragen keine Größenwahl. */
  sizes: uniqueList(text(1, 60), 0, 20).default([]),
  material: text(1, 60),
  materialInfo: z.string().trim().max(1000).default(''),
  printTimeMinutes: z.number().int().min(1).max(10000),
  safetyNotes: uniqueList(text(1, 300), 0, 20).default([]),
  /** Link-Knöpfe (z. B. Bestellliste, Zubehör) – leer = keine. */
  links: z.array(itemLinkSchema).max(MAX_ITEM_LINKS).default([]),
  published: z.boolean().default(false),
}).superRefine((input, ctx) => {
  if (!input.colorAreas && !input.colors) {
    ctx.addIssue({ code: 'custom', path: ['colorAreas'], message: 'Bitte mindestens eine Farbe wählen' });
  }
  const names = (input.colorAreas ?? []).map((a) => a.name.toLocaleLowerCase('de-DE'));
  if (new Set(names).size !== names.length) {
    ctx.addIssue({ code: 'custom', path: ['colorAreas'], message: 'Jeder Farbbereich braucht einen eigenen Namen' });
  }
  const labels = input.customFields.map((f) => f.label.toLocaleLowerCase('de-DE'));
  if (new Set(labels).size !== labels.length) {
    ctx.addIssue({ code: 'custom', path: ['customFields'], message: 'Jedes Feld braucht eine eigene Bezeichnung' });
  }
});
/** Geprüfte Eingabe (Server) – colors/colorAreas je nach Client-Version. */
export type ParsedItemInput = z.infer<typeof itemInputSchema>;
/** Was die Oberfläche sendet (Formularstand im Editor): immer mit Farbbereichen. */
export type ItemInput = Omit<ParsedItemInput, 'colors' | 'colorAreas'> & { colorAreas: ColorArea[] };

export const publishSchema = z.object({ published: z.boolean() });

const videoTitle = z.string().trim().max(100).default('');
export const videoLinkSchema = z.object({ title: videoTitle, url: httpLink });
export const videoUploadSchema = z.object({ title: videoTitle });

export const imageOrderSchema = z.object({ images: z.array(z.string()).max(10) });

/** Video zu einem Druckteil: hochgeladene Datei (MP4/WebM) oder Link. */
export interface ItemVideo {
  id: string;
  title: string;
  /** Gespeicherter (zufälliger) Dateiname – leer bei Links. */
  file: string;
  /** Externer Link (http/https) – leer bei hochgeladenen Dateien. */
  url: string;
  sizeBytes: number;
  uploadedAt: string;
}

/** Druckdatei (STL/3MF) aus Sicht der Oberfläche. Der Server speichert zusätzlich den Ablagenamen. */
export interface ModelFile {
  id: string;
  /** Ursprünglicher, bereinigter Dateiname für den Download. */
  originalName: string;
  format: 'stl' | '3mf';
  sizeBytes: number;
  uploadedAt: string;
}

/** Gespeichertes Druckteil: geprüfte Eingabe + Felder, die der Server vergibt. */
export type Item<M extends ModelFile = ModelFile> = Omit<ParsedItemInput, 'colors' | 'colorAreas'> & {
  id: string;
  /** Lesbare Nummer, z. B. ART-0042 – vergibt der Speicher beim Anlegen. */
  number?: string;
  /** IDs von Farbrollen aller Bereiche (aus colorAreas abgeleitet). */
  colors: string[];
  /** Farbbereiche (mind. einer); einfarbige Teile haben genau einen. */
  colorAreas: ColorArea[];
  videos: ItemVideo[];
  /** Gespeicherte Bild-Dateinamen, erstes Bild = Titelbild. */
  images: string[];
  modelFiles: M[];
  /** Beispieldatensatz aus der Erstinstallation. */
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Druckteil in API-Antworten (GET /api/items…): mit Anzahl der Druckdateien. */
export type ItemView = Item & { modelFileCount: number };

/** Ähnliches Druckteil als kleine Karte (GET /api/items/:id/aehnliche). Verknüpfung gilt gegenseitig. */
export interface AehnlichesTeil {
  id: string;
  name: string;
  shortDescription: string;
  category: string;
  /** Titelbild (gespeicherter Dateiname) – leer, wenn es keins gibt. */
  image: string;
  published: boolean;
}

/** Ähnliches Druckteil hinzufügen: ID des anderen Druckteils. */
export const aehnlichSchema = z.object({ id: z.string().trim().min(1).max(64) });
