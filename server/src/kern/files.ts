import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { newId } from '../domain/ids';
import { MIME_BY_EXT, type DateiRolle, type Objekttyp } from '../domain/objekttypen';
import type { Db, Row } from './db';
import { str } from './db';

export type ImageExt = 'jpg' | 'png' | 'webp';
export type ModelExt = 'stl' | '3mf';
export type VideoExt = 'mp4' | 'webm';

/** Öffentlicher Dateiname einer Datei: <datei-id>.<endung> (so stehen Bilder in Item.images). */
export const IMAGE_NAME = /^[a-f0-9-]{36}\.(jpg|png|webp)$/;
export const MODEL_NAME = /^[a-f0-9-]{36}\.(stl|3mf)$/;
export const VIDEO_NAME = /^[a-f0-9-]{36}\.(mp4|webm)$/;

/** IDs, die als Ordnername taugen (keine Pfadzeichen). */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_EXT = /^[a-z0-9]{1,8}$/;

/** Eine Datei als Datensatz (Tabelle `datei`). */
export interface Datei {
  id: string;
  objekttyp: Objekttyp;
  objektId: string;
  rolle: DateiRolle;
  originalname: string;
  mime: string;
  groesse: number;
  sha256: string;
  /** Relativ zum Ablageordner, immer mit „/“: <objekttyp>/<objekt-id>/<rolle>/<datei-id>.<endung> */
  pfad: string;
  sortierung: number;
  erstelltAm: string;
  erstelltVon: string;
}

export interface SaveInput {
  objekttyp: Objekttyp;
  objektId: string;
  rolle: DateiRolle;
  buffer: Buffer;
  ext: string;
  originalname?: string;
  erstelltVon?: string;
  /** Nur für die Übernahme alter Daten: vorhandene ID beibehalten. */
  id?: string;
  erstelltAm?: string;
  sortierung?: number;
}

export const dateiName = (d: Pick<Datei, 'id' | 'pfad'>) => `${d.id}${path.posix.extname(d.pfad)}`;
export const sha256 = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');

export function dateiFromRow(r: Row): Datei {
  return {
    id: str(r.id),
    objekttyp: str(r.objekttyp) as Objekttyp,
    objektId: str(r.objekt_id),
    rolle: str(r.rolle) as DateiRolle,
    originalname: str(r.originalname),
    mime: str(r.mime),
    groesse: Number(r.groesse),
    sha256: str(r.sha256),
    pfad: str(r.pfad),
    sortierung: Number(r.sortierung),
    erstelltAm: str(r.erstellt_am),
    erstelltVon: str(r.erstellt_von),
  };
}

/**
 * Dateiablage: jede Datei ist ein Datensatz in `datei`, abgelegt unter
 * <ablage>/<objekttyp>/<objekt-id>/<rolle>/<datei-id>.<endung>. In der Datenbank steht nur der relative Pfad,
 * der Ablageordner kann also verschoben werden. Dateinamen vergibt immer der Server; Druckdateien werden nur als
 * Bytes gespeichert und nie ausgeführt. Ausgeliefert wird nur über die API (Rechteprüfung in module/katalog/katalog.routes.ts, Fotos: module/vorschlaege).
 */
export class FileStore {
  constructor(
    private readonly db: Db,
    readonly root: string,
  ) {}

  async init() {
    await fs.mkdir(this.root, { recursive: true });
  }

  relPath(objekttyp: Objekttyp, objektId: string, rolle: DateiRolle, id: string, ext: string): string {
    if (!SAFE_ID.test(objektId) || !SAFE_ID.test(id) || !SAFE_EXT.test(ext)) throw new Error('Ungültiger Dateiname.');
    return `${objekttyp}/${objektId}/${rolle}/${id}.${ext}`;
  }

  /** Absoluter Pfad – nur innerhalb des Ablageordners. */
  absPath(d: Pick<Datei, 'pfad'>): string {
    const p = path.resolve(this.root, ...d.pfad.split('/'));
    const rel = path.relative(path.resolve(this.root), p);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Pfad außerhalb der Ablage.');
    return p;
  }

  /** Schreibt die Datei und legt den Datensatz an. Scheitert das Eintragen, wird die Datei wieder entfernt. */
  async save(input: SaveInput): Promise<Datei> {
    const id = input.id ?? newId();
    const ext = input.ext.toLowerCase();
    const pfad = this.relPath(input.objekttyp, input.objektId, input.rolle, id, ext);
    const datei: Datei = {
      id,
      objekttyp: input.objekttyp,
      objektId: input.objektId,
      rolle: input.rolle,
      originalname: input.originalname ?? '',
      mime: MIME_BY_EXT[ext] ?? 'application/octet-stream',
      groesse: input.buffer.length,
      sha256: sha256(input.buffer),
      pfad,
      sortierung: input.sortierung ?? this.nextSort(input.objekttyp, input.objektId, input.rolle),
      erstelltAm: input.erstelltAm ?? new Date().toISOString(),
      erstelltVon: input.erstelltVon ?? '',
    };
    const abs = this.absPath(datei);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, input.buffer, { flag: 'wx' });
    try {
      this.insert(datei);
    } catch (err) {
      await fs.rm(abs, { force: true });
      throw err;
    }
    return datei;
  }

  /** Nur den Datensatz eintragen (Datei liegt bereits an ihrem Platz, z. B. bei der Übernahme). */
  insert(d: Datei) {
    this.db
      .prepare(
        `INSERT INTO datei (id, objekttyp, objekt_id, rolle, originalname, mime, groesse, sha256, pfad, sortierung, erstellt_am, erstellt_von)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(d.id, d.objekttyp, d.objektId, d.rolle, d.originalname, d.mime, d.groesse, d.sha256, d.pfad, d.sortierung, d.erstelltAm, d.erstelltVon);
  }

  private nextSort(objekttyp: Objekttyp, objektId: string, rolle: DateiRolle): number {
    const r = this.db
      .prepare('SELECT MAX(sortierung) AS s FROM datei WHERE objekttyp = ? AND objekt_id = ? AND rolle = ?')
      .get(objekttyp, objektId, rolle) as { s: number | null };
    return (r.s ?? -1) + 1;
  }

  find(id: string): Datei | undefined {
    const r = this.db.prepare('SELECT * FROM datei WHERE id = ?').get(id) as Row | undefined;
    return r && dateiFromRow(r);
  }

  /** Sucht eine Datei über ihren öffentlichen Namen (<id>.<endung>); Endung und ggf. Rolle müssen passen. */
  findByName(name: string, rolle?: DateiRolle): Datei | undefined {
    const m = /^([A-Za-z0-9_-]{1,64})\.([a-z0-9]{1,8})$/.exec(name);
    if (!m) return undefined;
    const d = this.find(m[1]);
    if (!d || dateiName(d) !== name || (rolle && d.rolle !== rolle)) return undefined;
    return d;
  }

  list(objekttyp: Objekttyp, objektId: string, rolle?: DateiRolle): Datei[] {
    const rows = rolle
      ? this.db
          .prepare('SELECT * FROM datei WHERE objekttyp = ? AND objekt_id = ? AND rolle = ? ORDER BY sortierung, erstellt_am')
          .all(objekttyp, objektId, rolle)
      : this.db.prepare('SELECT * FROM datei WHERE objekttyp = ? AND objekt_id = ? ORDER BY rolle, sortierung').all(objekttyp, objektId);
    return (rows as Row[]).map(dateiFromRow);
  }

  /** Alle Dateien eines Objekttyps (für die Artikel-Liste in einem Rutsch). */
  listByTyp(objekttyp: Objekttyp): Datei[] {
    return (this.db.prepare('SELECT * FROM datei WHERE objekttyp = ? ORDER BY sortierung, erstellt_am').all(objekttyp) as Row[]).map(dateiFromRow);
  }

  /** Entfernt Datensätze (innerhalb der laufenden Transaktion). Die Dateien danach mit unlink() löschen. */
  removeRows(ids: string[]): Datei[] {
    const removed: Datei[] = [];
    for (const id of ids) {
      const d = this.find(id);
      if (!d) continue;
      this.db.prepare('DELETE FROM datei WHERE id = ?').run(id);
      removed.push(d);
    }
    return removed;
  }

  removeRowsFor(objekttyp: Objekttyp, objektId: string): Datei[] {
    return this.removeRows(this.list(objekttyp, objektId).map((d) => d.id));
  }

  /** Löscht Dateien von der Platte (nach dem Commit) und räumt leere Ordner auf. Fehler nur ins Log (Waisen-Prüfung: doctor). */
  async unlink(dateien: Datei[]) {
    for (const d of dateien) {
      try {
        const abs = this.absPath(d);
        await fs.rm(abs, { force: true });
        await this.pruneDirs(path.dirname(abs));
      } catch (err) {
        console.warn(`[Ablage] Datei ${d.pfad} konnte nicht gelöscht werden: ${(err as Error).message}`);
      }
    }
  }

  /** Datensatz und Datei löschen (erst DB, dann Datei). */
  async delete(id: string) {
    await this.unlink(this.removeRows([id]));
  }

  private async pruneDirs(dir: string) {
    const root = path.resolve(this.root);
    for (let d = path.resolve(dir); d.startsWith(root) && d !== root; d = path.dirname(d)) {
      try {
        await fs.rmdir(d); // nur leere Ordner
      } catch {
        return;
      }
    }
  }
}
