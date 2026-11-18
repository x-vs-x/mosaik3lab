// Fachliche Typen aus Sicht des Servers.
// Gemeinsame Typen und Schemas stehen einmal in shared/src/ (Paket @mosaik3lab/shared) – hier nur,
// was der Server zusätzlich speichert (Passwort-Hash, Ablagename der Druckdateien) und kleine Helfer.
// Unabhängig von der Speicherart (SQLite, Abbildung in storage/sqlite/).
import type { Account, SessionUser } from '@mosaik3lab/shared/konten';
import type { ColorArea, CustomField, ItemVideo, Item as SharedItem, ModelFile as SharedModelFile } from '@mosaik3lab/shared/katalog';
import type { Requester } from '@mosaik3lab/shared/anfragen';


export interface User extends Account {
  passwordHash: string;
}

export interface ModelFile extends SharedModelFile {
  /** Gespeicherter (zufälliger) Dateiname im Upload-Ordner. */
  storedName: string;
}

export type Item = SharedItem<ModelFile>;

/** Bisherige Druckteile ohne Farbbereiche: alle Farben in einem Bereich „Farbe“. */
export function singleColorArea(colors: string[]): ColorArea[] {
  return [{ id: 'farbe', name: 'Farbe', alleFarben: false, colors }];
}

/** Standardwerte der Produktdaten (einfarbig, ohne Preis, ohne Personalisierung, ohne Videos) – Demo-Daten und JSON-Übernahme. */
export function productDefaults(colors: string[]): { colorAreas: ColorArea[]; price: string; customFields: CustomField[]; videos: ItemVideo[] } {
  return { colorAreas: singleColorArea(colors), price: '', customFields: [], videos: [] };
}

/** Alle Farbrollen über alle Bereiche (ohne Doppelte) – wird als Item.colors gespeichert. */
export function allAreaColors(areas: ColorArea[]): string[] {
  return [...new Set(areas.flatMap((a) => a.colors))];
}

export function accountSessionUser(user: User): SessionUser {
  const { id, email, displayName, role, username, isDemo, lastLoginAt } = user;
  return { id, email, displayName, role, username, isDemo, lastLoginAt };
}

export function teacherSessionUser(requester: Requester): SessionUser {
  return {
    id: requester.id,
    email: requester.email,
    displayName: requester.email,
    role: 'lehrkraft',
    username: null,
    isDemo: false,
    lastLoginAt: null,
  };
}
