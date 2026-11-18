import type { SessionRepository } from '../kern/auth/sitzungen';
import type { BildDienst, Bildpflege } from '../kern/bilder';
import type { Db } from '../kern/db';
import type { FileStore } from '../kern/files';
import type { RequesterRepository, UserRepository } from '../module/konten/konten.repository';
import type { ProposalRepository } from '../module/vorschlaege/vorschlaege.repository';
import type { SettingsRepository } from '../module/einstellungen/einstellungen.repository';
import type { MasterDataRepository } from '../module/stammdaten/stammdaten.repository';
import type { ItemRepository } from '../module/katalog/katalog.repository';
import type { OrderRepository } from '../module/anfragen/anfragen.repository';

// Gesamter Speicher der App: Repositories der Fachbereiche (server/src/module/<bereich>/<bereich>.repository.ts),
// Dateiablage und Datenbank. Erzeugt in storage/index.ts, Tabellen siehe docs/DATENMODELL.md.

export interface Storage {
  users: UserRepository;
  items: ItemRepository;
  orders: OrderRepository;
  requesters: RequesterRepository;
  proposals: ProposalRepository;
  sessions: SessionRepository;
  settings: SettingsRepository;
  masterData: MasterDataRepository;
  /** Dateiablage (Tabelle `datei` + Ordner <ablage>/<objekttyp>/<objekt-id>/<rolle>/). */
  files: FileStore;
  /** Bilder der Druckteile: Vorschaubilder, Verkleinern (Rechen-Thread), Hintergrund-Lauf „Bildpflege“ (kern/bilder). */
  bilder: BildDienst;
  bildpflege: Bildpflege;
  /** Für Export/Import: direkter Zugriff auf die Datenbank (nur synchron in Transaktionen nutzen). */
  sqlite: { db: Db; items: ItemRepository; settings: SettingsRepository };
  database: {
    file: string;
    /** Für /api/health und den Server-Manager. */
    info(): { vorhanden: boolean; schemaVersion: number | null; groesseBytes: number };
    /** Konsistente Kopie im laufenden Betrieb (VACUUM INTO). */
    backupInto(target: string): void;
  };
  close(): Promise<void>;
}
