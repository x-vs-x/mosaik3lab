import fs from 'node:fs';
import path from 'node:path';
import { FileStore } from '../kern/files';
import { BildDienst, Bildpflege } from '../kern/bilder';
import { lockContent, lockHolder } from '../kern/lock';
import type { Storage } from './repositories';
import { backupInto, dbInfo, migrate, openDb } from '../kern/db';
import { importLegacyJson, type ImportReport, type LegacyPaths } from './sqlite/importJson';
import { ProposalRepository } from '../module/vorschlaege/vorschlaege.repository';
import { SessionRepository } from '../kern/auth/sitzungen';
import { RequesterRepository, UserRepository } from '../module/konten/konten.repository';
import { SettingsRepository } from '../module/einstellungen/einstellungen.repository';
import { MasterDataRepository } from '../module/stammdaten/stammdaten.repository';
import { ItemRepository } from '../module/katalog/katalog.repository';
import { OrderRepository } from '../module/anfragen/anfragen.repository';

export type { Storage } from './repositories';

export interface StoragePaths {
  /** SQLite-Datei, Standard <STORAGE_DIR>/mosaik3lab.db */
  dbFile: string;
  /** Wurzel der Dateiablage, Standard <STORAGE_DIR>/ablage (Server-Manager: ABLAGE_DIR) */
  ablageDir: string;
  /** Bisheriger JSON-Datenordner (Sperrdatei, Session-Geheimnis, Quelle der einmaligen Übernahme) */
  dataDir: string;
  /** Bisherige Upload-Ordner – nur noch Quelle der einmaligen Übernahme */
  imagesDir: string;
  modelsDir: string;
  videosDir: string;
}

/**
 * Plug & Play: legt Datenbank, Tabellen und Ablage selbst an, spielt ausstehende Migrationen ein (vorher Sicherung)
 * und übernimmt beim ersten Start einmalig die bisherigen JSON-Daten samt Dateien.
 */
export async function createSqliteStorage(paths: StoragePaths): Promise<Storage & { importReport?: ImportReport }> {
  fs.mkdirSync(paths.dataDir, { recursive: true });
  const releaseLock = acquireLock(paths.dataDir);
  let db: ReturnType<typeof openDb> | undefined;
  try {
    db = openDb(paths.dbFile);
    migrate(db, { backupDir: path.join(path.dirname(paths.dbFile), 'sicherungen') });

    const files = new FileStore(db, paths.ablageDir);
    await files.init();
    const masterData = new MasterDataRepository(db);
    const repos = {
      users: new UserRepository(db, files),
      items: new ItemRepository(db, files),
      orders: new OrderRepository(db, files),
      requesters: new RequesterRepository(db, files),
      proposals: new ProposalRepository(db, files),
      sessions: new SessionRepository(db),
      masterData,
      settings: new SettingsRepository(db, masterData),
    };
    repos.settings.init();
    const legacy: LegacyPaths = { dataDir: paths.dataDir, imagesDir: paths.imagesDir, modelsDir: paths.modelsDir, videosDir: paths.videosDir };
    const importReport = await importLegacyJson(db, files, repos, legacy);

    const conn = db;
    const bilder = new BildDienst(files);
    const bildpflege = new Bildpflege(files, bilder);
    return {
      ...repos,
      files,
      bilder,
      bildpflege,
      importReport,
      sqlite: { db: conn, items: repos.items, settings: repos.settings },
      database: {
        file: paths.dbFile,
        info: () => dbInfo(conn, paths.dbFile),
        backupInto: (target: string) => backupInto(conn, target),
      },
      async close() {
        // Hintergrund-Arbeit zuerst beenden: Bildpflege abbrechen, Rechen-Thread sofort beenden (kein Warten aufs laufende
        // Bild), dann aufs Ende des Laufs warten – geht beim nächsten Start weiter
        await bildpflege.beenden();
        await bilder.beenden();
        if (conn.isOpen) {
          try {
            conn.exec('PRAGMA wal_checkpoint(TRUNCATE)');
          } catch {
            /* egal – WAL wird beim nächsten Öffnen übernommen */
          }
          conn.close();
        }
        releaseLock();
      },
    };
  } catch (err) {
    if (db?.isOpen) db.close();
    releaseLock();
    throw err;
  }
}

/**
 * Verhindert, dass zwei Serverprozesse gleichzeitig mit demselben Datenbestand arbeiten.
 * Eine verwaiste Sperre (Prozess existiert nicht mehr oder Rechner seitdem neu gestartet) wird übernommen. Der Server-Manager prüft dieselbe Datei.
 */
function acquireLock(dataDir: string): () => void {
  const lockPath = path.join(dataDir, '.lock');
  const tryCreate = () => fs.writeFileSync(lockPath, lockContent(), { flag: 'wx' });

  try {
    tryCreate();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    const pid = lockHolder(fs.readFileSync(lockPath, 'utf8'));
    if (pid) {
      throw new Error(`Der Datenbestand in ${dataDir} wird bereits von einem anderen Serverprozess (PID ${pid}) verwendet.`);
    }
    fs.rmSync(lockPath, { force: true });
    tryCreate();
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.off('exit', release);
    try {
      if (fs.readFileSync(lockPath, 'utf8').split(' ')[0] === String(process.pid)) fs.rmSync(lockPath, { force: true });
    } catch {
      /* bereits entfernt */
    }
  };
  process.once('exit', release);
  return release;
}

