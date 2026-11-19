import fs from 'node:fs';
import path from 'node:path';
import { FileStore } from '../kern/files';
import { BildDienst, Bildpflege, schonfristBis } from '../kern/bilder';
import { lockContent, lockHolder } from '../kern/lock';
import type { Storage } from './repositories';
import { backupInto, dbInfo, letzteMigrationAm, migrate, openDb } from '../kern/db';
import { ProposalRepository } from '../module/vorschlaege/vorschlaege.repository';
import { SessionRepository } from '../kern/auth/sitzungen';
import { RequesterRepository, UserRepository } from '../module/konten/konten.repository';
import { SettingsRepository } from '../module/einstellungen/einstellungen.repository';
import { MasterDataRepository } from '../module/stammdaten/stammdaten.repository';
import { ItemRepository } from '../module/katalog/katalog.repository';
import { OrderRepository } from '../module/anfragen/anfragen.repository';
import { NeuigkeitenRepository } from '../module/neuigkeiten/neuigkeiten.repository';

export type { Storage } from './repositories';

export interface StoragePaths {
  /** SQLite-Datei, Standard <STORAGE_DIR>/mosaik3lab.db */
  dbFile: string;
  /** Wurzel der Dateiablage, Standard <STORAGE_DIR>/ablage (Server-Manager: ABLAGE_DIR) */
  ablageDir: string;
  /** Ordner der Sperrdatei (.lock; der Server-Manager prüft dieselbe Datei) */
  dataDir: string;
}

/** Plug & Play: legt Datenbank, Tabellen und Ablage selbst an und spielt ausstehende Migrationen ein (vorher Sicherung). */
export async function createSqliteStorage(paths: StoragePaths): Promise<Storage> {
  fs.mkdirSync(paths.dataDir, { recursive: true });
  const releaseLock = acquireLock(paths.dataDir);
  let db: ReturnType<typeof openDb> | undefined;
  try {
    db = openDb(paths.dbFile);
    const sicherungsOrdner = path.join(path.dirname(paths.dbFile), 'sicherungen');
    migrate(db, { backupDir: sicherungsOrdner });

    const files = new FileStore(db, paths.ablageDir);
    await files.init();
    const masterData = new MasterDataRepository(db);
    const repos = {
      users: new UserRepository(db),
      items: new ItemRepository(db, files),
      orders: new OrderRepository(db),
      requesters: new RequesterRepository(db),
      proposals: new ProposalRepository(db, files),
      sessions: new SessionRepository(db),
      masterData,
      settings: new SettingsRepository(db, masterData),
      neuigkeiten: new NeuigkeitenRepository(db),
    };
    repos.settings.init();

    const conn = db;
    // Nach einer Migration (Update) eine Zeit lang keine Originale ersetzen – ein Rückfall spielt nur die Datenbank zurück.
    const originaleAb = schonfristBis(letzteMigrationAm(db));
    if (originaleAb) {
      console.log(`[Bilder] Datenbank wurde gerade aktualisiert – zu große Bilder werden erst ab ${new Date(originaleAb).toLocaleTimeString('de-DE')} verkleinert (Vorschaubilder entstehen sofort).`);
    }
    const bilder = new BildDienst(files, undefined, { originaleAb });
    const bildpflege = new Bildpflege(files, bilder);
    return {
      ...repos,
      files,
      bilder,
      bildpflege,
      sqlite: { db: conn },
      database: {
        file: paths.dbFile,
        sicherungsOrdner,
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

