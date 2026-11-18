import { z } from 'zod';
import { text, type MitId } from './basis';
import type { OrderStatusDef } from './anfragen';
import { COLOR_KEYS, ICON_KEYS } from './werte/stammdaten';

// Stammdaten, die die Administration pflegt: Kategorien, Einsatzbereiche, Materialien, Farbrollen (Filamente).
// Die feste Statusliste steht in anfragen.ts. Listen und Hilfen ohne zod: werte/stammdaten.ts (hier wieder exportiert).
export * from './werte/stammdaten';

const entryId = z.string().trim().max(64).optional();
const entryName = text(1, 60);

const categoryInput = z.object({ id: entryId, name: entryName, color: z.enum(COLOR_KEYS), icon: z.enum(ICON_KEYS) });
const simpleEntryInput = z.object({ id: entryId, name: entryName });
const filamentInput = z.object({
  id: entryId,
  brand: z.string().trim().max(60).default(''),
  /** Produktlinie, z. B. „PLA Basic“. */
  line: z.string().trim().max(60).default(''),
  colorName: text(1, 60),
  /** Farbwert für die Anzeige, z. B. #00B1B7 */
  hex: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Farbwert im Format #RRGGBB').transform((h) => h.toUpperCase()),
  /** Artikel- bzw. Farbnummer des Herstellers (Bambu Lab: 5-stellig, z. B. 10101) – bei eigenen Rollen freiwillig. */
  herstellerNummer: z.string().trim().max(20).default(''),
  /** Fehlt der Wert, bleibt der gespeicherte erhalten (neue Rollen: verfügbar). */
  available: z.boolean().optional(),
});

/** PUT /api/admin/master-data/:list – ganze Liste auf einmal (leere ID = neuer Eintrag). */
export const masterDataSchemas = {
  categories: z.array(categoryInput),
  useAreas: z.array(simpleEntryInput),
  materials: z.array(simpleEntryInput),
  filaments: z.array(filamentInput),
};
export type MasterDataList = keyof typeof masterDataSchemas;

export type Category = MitId<z.infer<typeof categoryInput>>;
export type SimpleEntry = MitId<z.infer<typeof simpleEntryInput>>;
/** Eine Filament-Farbrolle. Druckteile verweisen über die ID darauf (Item.colors). */
export type Filament = MitId<Omit<z.infer<typeof filamentInput>, 'available'>> & {
  /** false = Rolle leer/nicht vorrätig – Farbe wird im Katalog und Anfrageformular nicht angeboten. */
  available: boolean;
  /**
   * Herkunft: ID im mitgelieferten Bambu-Lab-Katalog (dann sind Marke, Linie, Namen, Nummer und Farbe schreibgeschützt
   * und werden bei Updates abgeglichen) oder null = eigene Farbrolle (frei editierbar, der Abgleich fasst sie nie an).
   */
  katalogId: string | null;
  /** Originalname des Herstellers (englisch, z. B. „Jade White“) – nur Katalog-Rollen. */
  herstellerName: string;
  /** Katalog-Rolle, die Bambu Lab nicht mehr führt. Bleibt bestehen, weil Druckteile darauf verweisen. */
  weggefallen: boolean;
};

export interface MasterData {
  categories: Category[];
  useAreas: SimpleEntry[];
  materials: SimpleEntry[];
  /** Farbrollen – Druckteile verweisen über die ID auf ihre verfügbaren Farben. */
  filaments: Filament[];
  /** Feste Liste (anfragen.ts), nur an-/ausschaltbar. „offen“ gilt für neue Anfragen. */
  orderStatuses: OrderStatusDef[];
}

/** Farbrolle leer/verfügbar (Druck-Team). */
export const filamentAvailabilitySchema = z.object({ available: z.boolean() });

/** Import von Farbrollen aus dem mitgelieferten Bambu-Lab-Katalog (Katalog-IDs). */
export const filamentImportSchema = z.object({
  ids: z
    .array(z.string().trim().min(1).max(64))
    .min(1)
    .max(200)
    .transform((l) => [...new Set(l)]),
});

/** Eine Farbe im mitgelieferten Bambu-Lab-Katalog (server/src/domain/bambuKatalog.json). */
export interface BambuKatalogEintrag {
  /** Feste Katalog-ID, z. B. „bambu-pla-basic-black“ – ändert sich nie. */
  id: string;
  /** Bambu-Nummer, z. B. „10101“. */
  nummer: string;
  linie: string;
  /** Originalname (englisch), z. B. „Black“. */
  name: string;
  /** Deutscher Name laut Bambu Lab, z. B. „Schwarz“. */
  farbname: string;
  hex: string;
  /** Farbverlauf (mehrfarbige Rolle) – hex ist dann die erste Farbe. */
  verlauf?: boolean;
  weggefallen?: boolean;
}

/** Hinweis nach dem Abgleich bei einem Update: was sich an den Bambu-Farbrollen geändert hat. */
export interface BambuAbgleichHinweis {
  datum: string;
  /** Stand des Katalogs, z. B. „2026-09-22 (804d93bb)“. */
  stand: string;
  /** Kurze Zeilen, z. B. „Grau (PETG HF, Nr. 33101): Farbe #A3A6A6 → #ADB1B2“. */
  aenderungen: string[];
  /** Katalog-IDs, die seit dem letzten Abgleich neu im Katalog sind (werden nicht automatisch angelegt). */
  neu: string[];
}

/** GET /api/admin/settings/bambu-palette */
export interface BambuKatalogAntwort {
  quelle: string;
  stand: string;
  eintraege: BambuKatalogEintrag[];
  hinweis: BambuAbgleichHinweis | null;
}
