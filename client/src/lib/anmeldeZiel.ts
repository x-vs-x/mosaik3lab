import type { Permission } from './types';

/** Startseiten der Verwaltung in der Reihenfolge der Navigation – die erste freigegebene ist die „Verwaltung“ der Person. */
const VERWALTUNG_START: [string, Permission][] = [
  ['/verwaltung', 'dashboard:view'],
  ['/verwaltung/bestellungen', 'orders:view'],
  ['/verwaltung/vorschlaege', 'vorschlaege:sehen'],
  ['/verwaltung/hilfsmittel', 'catalog:view'],
  ['/verwaltung/filamente', 'filaments:manage'],
  ['/verwaltung/stammdaten', 'masterdata:manage'],
  ['/verwaltung/einstellungen', 'settings:manage'],
  ['/verwaltung/personen', 'users:manage'],
];

/** Erste Verwaltungsseite, die die Person öffnen darf (undefined = keine, z. B. Lehrkraft). */
export function verwaltungsStart(can: (p: Permission) => boolean): string | undefined {
  return VERWALTUNG_START.find(([, p]) => can(p))?.[0];
}

/**
 * Ziel nach der Anmeldung: zurück zur vorher aufgerufenen Seite, sonst Team/Admin in die Verwaltung und Lehrkräfte in
 * den Katalog. Verwaltungsseiten nur für Personen mit Verwaltungsrechten (auch Druck-Team mit Einzelrechten wie Farbrollen).
 */
export function zielNachAnmeldung(from: string | undefined, can: (p: Permission) => boolean): string {
  const start = verwaltungsStart(can);
  if (start) return from ?? start;
  return from && !from.startsWith('/verwaltung') ? from : '/katalog';
}
