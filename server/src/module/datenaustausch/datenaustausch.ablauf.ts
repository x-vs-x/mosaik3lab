import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { austauschLaeuft } from '../../kern/bilder';
import { stamp } from '../../kern/db';
import { conflict, notFound } from '../../kern/errors';
import type { Storage } from '../../storage';
import type { Paket } from './datenaustausch.export';
import { leseKopf, pruefeDateien, type DateiInfo } from './datenaustausch.paket';
import { fuehreAus, vorschau, type Bericht, type Modus } from './datenaustausch.service';
import type { ImportErgebnis, ImportVorschau } from '@mosaik3lab/shared/datenaustausch';

// Ablauf des Einspielens über zwei Anfragen: Datei hochladen → Vorschau (wartet bis zu 30 Minuten) → ausführen oder
// verwerfen. Hier liegen die wartenden Vorschauen, das Aufräumen, die Sperre „nur ein Import gleichzeitig“ und die
// Sicherung vor dem Import; die Routen (datenaustausch.routes.ts) parsen nur und antworten.

const VORSCHAU_GUELTIG_MS = 30 * 60 * 1000;
const AUFRAEUMEN_MS = 5 * 60 * 1000;

interface Wartend {
  id: string;
  nutzerId: string;
  datei: string;
  paket: Paket;
  infos: Map<string, DateiInfo>;
  groesse: number;
  bis: number;
  /** Wird gerade eingespielt – nicht verwerfen. */
  inArbeit?: boolean;
}

export class ImportAblauf {
  private readonly wartend = new Map<string, Wartend>();
  private beschaeftigt = false;

  /** `uploadDir`: hochgeladene Dateien; `ablageTmp`: geprüfte Dateien vor dem Verschieben (gleiches Laufwerk wie die Ablage). */
  constructor(
    private readonly storage: Storage,
    readonly uploadDir: string,
    private readonly ablageTmp: string,
  ) {
    // Reste eines abgebrochenen Imports (Neustart) aufräumen. Gesperrte Reste (Virenscanner, Indexer) verhindern den Start
    // nicht – sie werden beim nächsten Start erneut versucht.
    for (const dir of [uploadDir, ablageTmp]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (err) {
        console.warn(`[Import] Reste in ${dir} bleiben liegen: ${(err as Error).message}`);
      }
    }
    // Abgebrochene Vorschauen (Fenster geschlossen) belegen bis zu 1 GB – regelmäßig verwerfen, auch ohne neuen Import.
    setInterval(() => this.aufraeumen().catch((e: Error) => console.warn('[Import] Aufräumen fehlgeschlagen:', e.message)), AUFRAEUMEN_MS).unref();
  }

  private async verwerfe(w: Wartend) {
    this.wartend.delete(w.id);
    // maxRetries: unter Windows halten Virenscanner/Indexer Dateien kurz fest (EBUSY/EPERM).
    await fsp.rm(w.datei, { force: true, maxRetries: 5, retryDelay: 100 });
    await fsp.rm(path.join(this.ablageTmp, w.id), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }

  private async aufraeumen() {
    for (const w of [...this.wartend.values()]) if (w.bis < Date.now() && !w.inArbeit) await this.verwerfe(w);
  }

  /** Hochgeladene Datei prüfen und für beide Modi durchrechnen; die Datei wartet danach auf „ausführen“. */
  async vorschauAnlegen(file: { path: string; size: number }, nutzerId: string): Promise<ImportVorschau> {
    let behalten = false;
    try {
      await this.aufraeumen();
      const paket = await leseKopf(file.path);
      const infos = await pruefeDateien(file.path, paket);
      const berichte: Record<Modus, Bericht> = {
        ueberspringen: vorschau(this.storage, paket, 'ueberspringen', infos),
        ersetzen: vorschau(this.storage, paket, 'ersetzen', infos),
      };
      const id = crypto.randomBytes(16).toString('hex');
      // Höchstens eine wartende Vorschau je Person: eine ältere (abgebrochener Versuch) wird verworfen.
      for (const alt of [...this.wartend.values()]) if (alt.nutzerId === nutzerId && !alt.inArbeit) await this.verwerfe(alt);
      this.wartend.set(id, { id, nutzerId, datei: file.path, paket, infos, groesse: file.size, bis: Date.now() + VORSCHAU_GUELTIG_MS });
      behalten = true;
      return {
        importId: id,
        gueltigBis: new Date(Date.now() + VORSCHAU_GUELTIG_MS).toISOString(),
        dateigroesse: file.size,
        kopf: {
          exportiertAm: paket.exportiertAm,
          appVersion: paket.appVersion,
          mitDateien: paket.mitDateien,
          hinweise: paket.hinweise,
          artikel: paket.artikel.length,
          vorhanden: berichte.ueberspringen.vorhanden,
          dateien: infos.size,
          version: paket.version,
        },
        berichte,
      };
    } finally {
      if (!behalten) await fsp.rm(file.path, { force: true });
    }
  }

  /** Vorschau verwerfen (nur die eigene, nicht während des Einspielens). */
  async verwerfen(id: string, nutzerId: string) {
    const w = this.wartend.get(id);
    if (w && w.nutzerId === nutzerId && !w.inArbeit) await this.verwerfe(w);
  }

  /** Einspielen: vorher die Datenbank sichern, dann alles oder nichts. */
  async ausfuehren(importId: string, modus: Modus, nutzer: { id: string; email: string }): Promise<ImportErgebnis> {
    const w = this.wartend.get(importId);
    if (!w || w.nutzerId !== nutzer.id || w.bis < Date.now()) throw notFound('Die Vorschau ist abgelaufen. Bitte die Datei erneut auswählen.');
    if (this.beschaeftigt) throw conflict('Es wird gerade schon eine Datei eingespielt. Bitte kurz warten.');
    this.beschaeftigt = true;
    w.inArbeit = true;
    const importFertig = austauschLaeuft(); // Bildpflege pausiert solange, Originale bleiben unverändert
    const tmpDir = path.join(this.ablageTmp, w.id);
    try {
      // 1) Sicherung der Datenbank (Dateien der Ablage sichert das Backup des Server-Managers).
      const ordner = this.storage.database.sicherungsOrdner;
      let sicherung = path.join(ordner, `mosaik3lab-vor-import-${stamp()}.db`);
      for (let n = 2; fs.existsSync(sicherung); n++) sicherung = path.join(ordner, `mosaik3lab-vor-import-${stamp()}-${n}.db`);
      this.storage.database.backupInto(sicherung);
      // 2) Dateien erneut prüfen und in den Temp-Bereich der Ablage schreiben.
      const infos = await pruefeDateien(w.datei, w.paket, tmpDir);
      // 3) Datenbank in einer Transaktion ändern, Dateien verschieben; bei Fehler alles zurück.
      const bericht = await fuehreAus(this.storage, w.paket, modus, infos, tmpDir);
      console.log(`[Import] ${nutzer.email} hat ${w.paket.artikel.length} Druckteile eingespielt (${modus}, Sicherung: ${sicherung}).`);
      return { bericht, sicherung: path.basename(sicherung) };
    } finally {
      // Erst aufräumen, dann antworten: sonst sieht der Aufrufer den Temp-Ordner beim Verschwinden.
      await this.verwerfe(w).catch((e) => console.warn('[Import] Aufräumen fehlgeschlagen:', e));
      this.beschaeftigt = false;
      importFertig();
    }
  }
}
