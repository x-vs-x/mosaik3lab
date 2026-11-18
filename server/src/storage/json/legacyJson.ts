import fs from 'node:fs';
import path from 'node:path';
import { ORDERFORM_VORGABE_BIS_1_6, withDefaults, type AppSettings } from '../../module/einstellungen/einstellungen.vorgaben';
import type { Item, User } from '../../domain/types';
import type { Order, Requester } from '@mosaik3lab/shared/anfragen';
import type { StoredSession } from '../../kern/auth/sitzungen';

// Lesen der bisherigen JSON-Dateien (bis Schema 1 der Speicher von Mosaik³LAB) – nur noch für die einmalige
// Übernahme in die Datenbank. Es wird nie in diese Dateien geschrieben; sie bleiben als Sicherung liegen.

export const LEGACY_FILES = ['users.json', 'items.json', 'orders.json', 'requesters.json', 'settings.json', 'sessions.json'] as const;

export interface LegacyData {
  users: User[];
  items: Item[];
  orders: Order[];
  requesters: Requester[];
  settings: AppSettings;
  sessions: Record<string, StoredSession>;
  /** Welche Dateien gelesen wurden (bzw. aus .bak, weil die Hauptdatei beschädigt war). */
  gelesen: string[];
}

export function hasLegacyData(dataDir: string): boolean {
  return LEGACY_FILES.some((f) => f !== 'sessions.json' && fs.existsSync(path.join(dataDir, f)));
}

function readFile<T>(dataDir: string, name: string, fallback: T, validate: (d: unknown) => T, gelesen: string[]): T {
  const main = path.join(dataDir, name);
  if (!fs.existsSync(main)) return fallback;
  try {
    const v = validate(JSON.parse(fs.readFileSync(main, 'utf8')));
    gelesen.push(name);
    return v;
  } catch (err) {
    // Hauptdatei beschädigt → Sicherung (.bak) verwenden, wie es der JSON-Speicher auch getan hätte.
    try {
      const v = validate(JSON.parse(fs.readFileSync(`${main}.bak`, 'utf8')));
      gelesen.push(`${name}.bak`);
      return v;
    } catch {
      throw new Error(`Die Datei ${main} ist beschädigt und es gibt kein gültiges Backup (${(err as Error).message}).`);
    }
  }
}

function arrayOf<T>(label: string) {
  return (data: unknown): T[] => {
    if (!Array.isArray(data)) throw new Error(`${label}: Erwartet wurde eine Liste.`);
    for (const e of data) {
      if (!e || typeof e !== 'object' || typeof (e as { id?: unknown }).id !== 'string') throw new Error(`${label}: Eintrag ohne gültige ID.`);
    }
    return data as T[];
  };
}

const objectOf =
  <T>(label: string) =>
  (data: unknown): T => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${label}: Erwartet wurde ein Objekt.`);
    return data as T;
  };

/** Alte JSON-Einstellungen: fehlen die erlaubten Domains, gilt die damalige Vorgabe (nicht die heutige neutrale). */
function legacySettings(raw: Partial<AppSettings>): AppSettings {
  const of = raw.orderForm as Partial<AppSettings['orderForm']> | undefined;
  const allowedEmailDomains = Array.isArray(of?.allowedEmailDomains) ? of.allowedEmailDomains : [...ORDERFORM_VORGABE_BIS_1_6.allowedEmailDomains];
  return withDefaults({ ...raw, orderForm: { ...(of ?? {}), allowedEmailDomains } });
}

export function readLegacyData(dataDir: string): LegacyData {
  const gelesen: string[] = [];
  return {
    users: readFile(dataDir, 'users.json', [], arrayOf<User>('users.json'), gelesen),
    items: readFile(dataDir, 'items.json', [], arrayOf<Item>('items.json'), gelesen),
    orders: readFile(dataDir, 'orders.json', [], arrayOf<Order>('orders.json'), gelesen),
    requesters: readFile(dataDir, 'requesters.json', [], arrayOf<Requester>('requesters.json'), gelesen),
    settings: legacySettings(readFile(dataDir, 'settings.json', {}, objectOf<Partial<AppSettings>>('settings.json'), gelesen)),
    sessions: readFile(dataDir, 'sessions.json', {}, objectOf<Record<string, StoredSession>>('sessions.json'), gelesen),
    gelesen,
  };
}
