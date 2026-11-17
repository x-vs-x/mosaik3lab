// Typen zu erreichbarkeit.mjs (für die App, die die Datei aus TypeScript importiert).
export type Erreichbarkeit = 'auto' | 'schulnetz' | 'oeffentlich';
export declare const ERREICHBARKEIT: readonly ['auto', 'schulnetz', 'oeffentlich'];
export declare const HTTPS_EMPFOHLEN: string;
export interface Erkennung {
  schulnetz: boolean;
  grund: string;
}
export interface LinkPruefung {
  wahl: Erreichbarkeit;
  erkennung: Erkennung | null;
  hinweis: boolean;
  warnung: string;
  httpsHinweis: string;
}
export declare function erkenneErreichbarkeit(url: string): Erkennung;
export declare function pruefeLinks(c?: { appBaseUrl?: string; erreichbarkeit?: string }): LinkPruefung;
export declare function waehleNetzAdresse(
  interfaces: Record<string, ReadonlyArray<{ address: string; family: string | number; internal: boolean }> | undefined>,
): string | null;
