import crypto from 'node:crypto';
import { austauschLaeuft } from '../../kern/bilder';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Auth } from '../../kern/auth/middleware';
import type { AppConfig } from '../../config';
import { badRequest, HttpError } from '../../kern/errors';
import { param } from '../../kern/http';
import { rateLimit } from '../../kern/rateLimit';
import { ImportAblauf } from './datenaustausch.ablauf';
import { erzeugeExport, MAX_AUSWAHL } from './datenaustausch.export';
import { ID } from './datenaustausch.paket';
import type { Storage } from '../../storage';

// Druckteile exportieren und einspielen – der eine Weg dafür (Verwaltung → Druckteile, Rechte daten:export/daten:import).
//   GET  /export[?artikel=id1,id2]   eine ZIP-Datei mit den gewählten (ohne Angabe: allen) Druckteilen samt Dateien
//   (Einspielen nimmt ZIP und ältere JSON-Exporte – erkannt an den ersten Bytes, nicht am Dateinamen)
//   POST /import/vorschau            Datei hochladen und prüfen → Vorschau für „überspringen“ und „ersetzen“
//   POST /import/ausfuehren          { importId, modus } – alles oder nichts, vorher wird die Datenbank gesichert
//   DELETE /import/:id               Vorschau verwerfen
// Siehe datenaustausch.export.ts (Format), datenaustausch.paket.ts (Lesen/Prüfen), datenaustausch.ablauf.ts (wartende
// Vorschauen, Sicherung) und datenaustausch.service.ts (Rechnen in einer Transaktion).

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
  const ablauf = new ImportAblauf(storage, uploadDir, ablageTmp);

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
      },
      filename: (_req, _file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}.upload`),
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
    // Bis der Download fertig ist (oder abbricht), pausiert die Bildpflege und ersetzt kein Original – sonst verschwindet
    // eine Datei, die der Export gleich lesen will (PNG → JPG).
    const austauschFertig = austauschLaeuft();
    try {
      const artikel = req.query.artikel === undefined ? undefined : artikelQuery.parse(req.query.artikel);
      const exp = await erzeugeExport(storage, { artikel });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${exp.name}"`);
      res.setHeader('Cache-Control', 'no-store');
      console.log(`[Export] ${req.user?.email ?? '?'} lädt ${exp.name} (${exp.artikel} Druckteile, ${exp.dateien} Dateien).`);
      await pipeline(exp.strom, res);
    } catch (err) {
      if (res.headersSent) res.destroy(err as Error);
      else {
        res.removeHeader('Content-Disposition');
        next(err);
      }
    } finally {
      austauschFertig();
    }
  });

  router.post('/import/vorschau', auth.requirePermission('daten:import'), importLimit, einzelneDatei, async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('Bitte eine Export-Datei auswählen.');
    res.json(await ablauf.vorschauAnlegen(file, req.user!.id));
  });

  router.delete('/import/:id', auth.requirePermission('daten:import'), async (req, res) => {
    await ablauf.verwerfen(param(req.params.id), req.user!.id);
    res.status(204).end();
  });

  router.post('/import/ausfuehren', auth.requirePermission('daten:import'), importLimit, async (req, res) => {
    const body = ausfuehrenSchema.parse(req.body);
    res.json(await ablauf.ausfuehren(body.importId, body.modus, req.user!));
  });

  return router;
}
