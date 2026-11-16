import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Auth } from '../../kern/auth/middleware';
import type { AppConfig } from '../../config';
import { badRequest, conflict, HttpError, notFound } from '../../kern/errors';
import { param } from '../../kern/http';
import { rateLimit } from '../../kern/rateLimit';
import { erzeugeExport, MAX_AUSWAHL, type Paket } from './datenaustausch.export';
import { ID, leseKopf, pruefeDateien, type DateiInfo } from './datenaustausch.paket';
import { fuehreAus, vorschau, type Bericht, type Modus } from './datenaustausch.service';
import type { Storage } from '../../storage';
import { stamp } from '../../kern/db';

// Druckteile exportieren und einspielen – der eine Weg dafür (Verwaltung → Druckteile, Rechte daten:export/daten:import).
//   GET  /export[?artikel=id1,id2]   eine Datei mit den gewählten (ohne Angabe: allen) Druckteilen samt Dateien
//   POST /import/vorschau            Datei hochladen und prüfen → Vorschau für „überspringen“ und „ersetzen“
//   POST /import/ausfuehren          { importId, modus } – alles oder nichts, vorher wird die Datenbank gesichert
//   DELETE /import/:id               Vorschau verwerfen
// Siehe datenaustausch.export.ts (Format), datenaustausch.paket.ts (Lesen/Prüfen) und datenaustausch.service.ts (Ablauf).

const VORSCHAU_GUELTIG_MS = 30 * 60 * 1000;

interface Wartend {
  id: string;
  nutzerId: string;
  datei: string;
  paket: Paket;
  infos: Map<string, DateiInfo>;
  groesse: number;
  bis: number;
}

const ausfuehrenSchema = z.object({
  importId: z.string().regex(/^[a-f0-9]{32}$/, 'Die Vorschau ist abgelaufen. Bitte die Datei erneut auswählen.'),
  modus: z.enum(['ueberspringen', 'ersetzen']).default('ueberspringen'),
});

/** `?artikel=id1,id2` – Auswahl für den Teil-Export (Länge begrenzt, damit die Adresse nicht zu lang wird). */
const artikelQuery = z
  .string({ message: 'Bitte die Druckteile als Liste von IDs angeben.' })
  .transform((s) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))])
  .pipe(z.array(z.string().regex(ID, 'Ungültige Druckteil-ID.')).min(1, 'Bitte mindestens ein Druckteil auswählen.').max(MAX_AUSWAHL, `Höchstens ${MAX_AUSWAHL} Druckteile auf einmal – oder „Alle“ wählen.`));

export function datenRoutes(storage: Storage, auth: Auth, config: AppConfig) {
  const router = Router();
  const uploadDir = path.join(config.storageDir, 'import-tmp');
  const ablageTmp = path.join(storage.files.root, '.import-tmp');
  const wartend = new Map<string, Wartend>();
  let beschaeftigt = false;

  // Reste eines abgebrochenen Imports (Neustart) aufräumen.
  fs.rmSync(uploadDir, { recursive: true, force: true });
  fs.rmSync(ablageTmp, { recursive: true, force: true });

  const verwerfe = async (w: Wartend) => {
    wartend.delete(w.id);
    // maxRetries: unter Windows halten Virenscanner/Indexer Dateien kurz fest (EBUSY/EPERM).
    await fsp.rm(w.datei, { force: true, maxRetries: 5, retryDelay: 100 });
    await fsp.rm(path.join(ablageTmp, w.id), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  };
  const aufraeumen = async () => {
    for (const w of [...wartend.values()]) if (w.bis < Date.now()) await verwerfe(w);
  };

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
      },
      filename: (_req, _file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}.json`),
    }),
    limits: { fileSize: config.importMaxBytes, files: 1, fields: 3 },
  });

  const einzelneDatei: RequestHandler = (req, res, next) =>
    upload.single('datei')(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(new HttpError(413, `Die Datei ist zu groß (höchstens ${Math.round(config.importMaxBytes / 1024 / 1024)} MB). Bitte weniger Druckteile auf einmal exportieren und einspielen.`));
      }
      next(err);
    });

  const importLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, message: 'Zu viele Import-Versuche. Bitte später erneut versuchen.' });

  router.get('/export', auth.requirePermission('daten:export'), async (req, res, next) => {
    try {
      const artikel = req.query.artikel === undefined ? undefined : artikelQuery.parse(req.query.artikel);
      const exp = await erzeugeExport(storage, { artikel });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${exp.name}"`);
      res.setHeader('Cache-Control', 'no-store');
      console.log(`[Export] ${req.user?.email ?? '?'} lädt ${exp.name} (${exp.artikel} Druckteile, ${exp.dateien} Dateien).`);
      await pipeline(Readable.from(exp.strom, { objectMode: false }), res);
    } catch (err) {
      if (res.headersSent) res.destroy(err as Error);
      else {
        res.removeHeader('Content-Disposition');
        next(err);
      }
    }
  });

  router.post('/import/vorschau', auth.requirePermission('daten:import'), importLimit, einzelneDatei, async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('Bitte eine Export-Datei auswählen.');
    let behalten = false;
    try {
      await aufraeumen();
      const paket = await leseKopf(file.path);
      const infos = await pruefeDateien(file.path, paket);
      const berichte: Record<Modus, Bericht> = {
        ueberspringen: vorschau(storage, paket, 'ueberspringen', infos),
        ersetzen: vorschau(storage, paket, 'ersetzen', infos),
      };
      const id = crypto.randomBytes(16).toString('hex');
      wartend.set(id, { id, nutzerId: req.user!.id, datei: file.path, paket, infos, groesse: file.size, bis: Date.now() + VORSCHAU_GUELTIG_MS });
      behalten = true;
      res.json({
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
        },
        berichte,
      });
    } finally {
      if (!behalten) await fsp.rm(file.path, { force: true });
    }
  });

  router.delete('/import/:id', auth.requirePermission('daten:import'), async (req, res) => {
    const w = wartend.get(param(req.params.id));
    if (w && w.nutzerId === req.user!.id) await verwerfe(w);
    res.status(204).end();
  });

  router.post('/import/ausfuehren', auth.requirePermission('daten:import'), importLimit, async (req, res) => {
    const body = ausfuehrenSchema.parse(req.body);
    const w = wartend.get(body.importId);
    if (!w || w.nutzerId !== req.user!.id || w.bis < Date.now()) throw notFound('Die Vorschau ist abgelaufen. Bitte die Datei erneut auswählen.');
    if (beschaeftigt) throw conflict('Es wird gerade schon eine Datei eingespielt. Bitte kurz warten.');
    beschaeftigt = true;
    const tmpDir = path.join(ablageTmp, w.id);
    let antwort: { bericht: unknown; sicherung: string };
    try {
      // 1) Sicherung der Datenbank (Dateien der Ablage sichert das Backup des Server-Managers).
      const sicherungsOrdner = path.join(path.dirname(config.dbFile), 'sicherungen');
      let sicherung = path.join(sicherungsOrdner, `mosaik3lab-vor-import-${stamp()}.db`);
      for (let n = 2; fs.existsSync(sicherung); n++) sicherung = path.join(sicherungsOrdner, `mosaik3lab-vor-import-${stamp()}-${n}.db`);
      storage.database.backupInto(sicherung);
      // 2) Dateien erneut prüfen und in den Temp-Bereich der Ablage schreiben.
      const infos = await pruefeDateien(w.datei, w.paket, tmpDir);
      // 3) Datenbank in einer Transaktion ändern, Dateien verschieben; bei Fehler alles zurück.
      const bericht = await fuehreAus(storage, w.paket, body.modus, infos, tmpDir);
      console.log(`[Import] ${req.user!.email} hat ${w.paket.artikel.length} Druckteile eingespielt (${body.modus}, Sicherung: ${sicherung}).`);
      antwort = { bericht, sicherung: path.basename(sicherung) };
    } finally {
      // Erst aufräumen, dann antworten: sonst sieht der Aufrufer den Temp-Ordner beim Verschwinden.
      await verwerfe(w).catch((e) => console.warn('[Import] Aufräumen fehlgeschlagen:', e));
      beschaeftigt = false;
    }
    res.json(antwort);
  });

  return router;
}
