import { z } from 'zod';
import './basis';

// Datenaustausch: Antworten der Import-Vorschau und des Einspielens (Server: module/datenaustausch/, Client:
// features/verwaltung/DruckteileAustausch.tsx). Das Paketformat selbst liest nur der Server (datenaustausch.paket.ts).
export * from './werte/datenaustausch';

export const IMPORT_MODI = ['ueberspringen', 'ersetzen'] as const;
export type ImportModus = (typeof IMPORT_MODI)[number];

/** POST /api/admin/daten/import/ausfuehren */
export const importAusfuehrenSchema = z.object({
  importId: z.string().regex(/^[a-f0-9]{32}$/, 'Die Vorschau ist abgelaufen. Bitte die Datei erneut auswählen.'),
  modus: z.enum(IMPORT_MODI).default('ueberspringen'),
});
export type ImportAusfuehrenInput = z.input<typeof importAusfuehrenSchema>;

export interface ImportZaehler {
  neu: number;
  /** Vorhandenes Druckteil durch den Stand der Datei ersetzt. */
  ersetzt: number;
  /** Vorhanden und gleich (Stammdaten: schon vorhanden). */
  unveraendert: number;
  uebersprungen: number;
}

export interface ImportDetail {
  status: 'neu' | 'ersetzt' | 'uebersprungen' | 'hinweis';
  bereich: string;
  name: string;
  text?: string;
}

export interface VerknuepfungsZaehler {
  /** Neu angelegte Verknüpfungen (auch früher vorgemerkte, deren Partner jetzt da ist). */
  neu: number;
  /** Verknüpfungen aus der Datei, deren Partner hier noch fehlt (vorgemerkt). */
  wartend: number;
}

export interface ImportBericht {
  modus: ImportModus;
  /** Druckteile in der Datei. */
  artikel: number;
  /** Davon gibt es hier schon. */
  vorhanden: number;
  abschnitte: Record<'artikel' | 'kategorien' | 'einsatzbereiche' | 'materialien' | 'filamente' | 'dateien', ImportZaehler>;
  /** Ähnliche Druckteile: neu angelegte und vorgemerkte (Partner fehlt hier noch) Verknüpfungen. */
  verknuepfungen: VerknuepfungsZaehler;
  details: ImportDetail[];
  /** Mehr Details, als angezeigt werden. */
  weitereDetails: number;
}

/** POST /api/admin/daten/import/vorschau – die Datei wartet danach bis `gueltigBis` auf „ausführen“. */
export interface ImportVorschau {
  importId: string;
  gueltigBis: string;
  dateigroesse: number;
  kopf: {
    exportiertAm: string;
    appVersion: string;
    mitDateien: boolean;
    hinweise: string[];
    artikel: number;
    vorhanden: number;
    /** Geprüfte Bilder und Dateien im Paket. */
    dateien: number;
    /** Formatversion des Pakets. */
    version: number;
  };
  berichte: Record<ImportModus, ImportBericht>;
}

/** Antwort auf POST /api/admin/daten/import/ausfuehren. */
export interface ImportErgebnis {
  bericht: ImportBericht;
  /** Dateiname der Datenbank-Sicherung vor dem Einspielen. */
  sicherung: string;
}
