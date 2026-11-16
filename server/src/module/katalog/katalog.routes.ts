import { Router } from 'express';
import type { Auth } from '../../kern/auth/middleware';
import { badRequest, notFound } from '../../kern/errors';
import { dateiName } from '../../kern/files';
import { param, sendMissingImage } from '../../kern/http';
import { imageUpload, MAX_IMAGES_PER_ITEM, modelUpload, videoUpload } from '../../kern/uploads';
import type { Storage } from '../../storage';
import {
  addImages,
  addModels,
  addVideoLink,
  createItem,
  deleteItem,
  listItems,
  loadVisible,
  presentItem,
  removeImage,
  removeModel,
  removeVideo,
  reorderImages,
  setPublished,
  updateItem,
  uploadVideo,
  visibleItemFile,
} from './katalog.service';
import { farbeZuordnen } from './farbeZuordnen';
import { farbeZuordnenSchema, imageOrderSchema, itemInputSchema, publishSchema, videoLinkSchema, videoUploadSchema } from '@mosaik3lab/shared/katalog';

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const uploaded = (files: unknown) => (files as Express.Multer.File[] | undefined) ?? [];

/** /api/items – Katalog. Lesen ohne Anmeldung (nur veröffentlichte Druckteile), Verwaltung mit „catalog:manage“. */
export function itemRoutes(storage: Storage, auth: Auth) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { q, category, area, kind } = req.query;
    res.json(await listItems(storage, req.user, { q: text(q), category: text(category), area: text(area), kind: text(kind), all: req.query.all === '1' }));
  });

  router.get('/:id', async (req, res) => {
    res.json(presentItem(await loadVisible(storage, param(req.params.id), req.user), req.user));
  });

  // --- Verwaltung (3D-Druck-Team und Administration) ---------------------------
  const manage = auth.requirePermission('catalog:manage');

  router.post('/', manage, async (req, res) => {
    res.status(201).json(presentItem(await createItem(storage, itemInputSchema.parse(req.body)), req.user!));
  });

  // Eine Farbrolle mehreren Druckteilen auf einmal hinzufügen (Farbrollen-Verwaltung → „Druckteilen zuordnen …“).
  router.post('/farbe-zuordnen', manage, (req, res) => {
    const { filamentId, ziele } = farbeZuordnenSchema.parse(req.body);
    res.json(farbeZuordnen(storage, filamentId, ziele));
  });

  router.put('/:id', manage, async (req, res) => {
    const input = itemInputSchema.parse(req.body);
    res.json(presentItem(await updateItem(storage, param(req.params.id), input), req.user!));
  });

  router.patch('/:id/publish', manage, async (req, res) => {
    const { published } = publishSchema.parse(req.body);
    res.json(presentItem(await setPublished(storage, param(req.params.id), published), req.user!));
  });

  router.delete('/:id', manage, async (req, res) => {
    await deleteItem(storage, param(req.params.id));
    res.json({ ok: true });
  });

  // --- Bilder ------------------------------------------------------------------
  router.post('/:id/images', manage, imageUpload.array('files', MAX_IMAGES_PER_ITEM), async (req, res) => {
    const updated = await addImages(storage, param(req.params.id), uploaded(req.files), req.user!.id);
    res.status(201).json(presentItem(updated, req.user!));
  });

  router.put('/:id/images/order', manage, async (req, res) => {
    const { images } = imageOrderSchema.parse(req.body);
    res.json(presentItem(await reorderImages(storage, param(req.params.id), images), req.user!));
  });

  router.delete('/:id/images/:file', manage, async (req, res) => {
    res.json(presentItem(await removeImage(storage, param(req.params.id), param(req.params.file)), req.user!));
  });

  // --- Videos (Upload MP4/WebM oder Link) --------------------------------------
  router.post('/:id/videos', manage, videoUpload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('Bitte ein Video auswählen.');
    const { title } = videoUploadSchema.parse(req.body ?? {});
    res.status(201).json(presentItem(await uploadVideo(storage, param(req.params.id), file, title, req.user!.id), req.user!));
  });

  router.post('/:id/videos/link', manage, async (req, res) => {
    const { title, url } = videoLinkSchema.parse(req.body);
    res.status(201).json(presentItem(await addVideoLink(storage, param(req.params.id), title, url), req.user!));
  });

  router.delete('/:id/videos/:videoId', manage, async (req, res) => {
    res.json(presentItem(await removeVideo(storage, param(req.params.id), param(req.params.videoId)), req.user!));
  });

  // --- Druckdateien (STL / 3MF) -----------------------------------------------
  router.post('/:id/models', manage, modelUpload.array('files', 5), async (req, res) => {
    const updated = await addModels(storage, param(req.params.id), uploaded(req.files), req.user!.id);
    res.status(201).json(presentItem(updated, req.user!));
  });

  router.delete('/:id/models/:modelId', manage, async (req, res) => {
    res.json(presentItem(await removeModel(storage, param(req.params.id), param(req.params.modelId)), req.user!));
  });

  return router;
}

/** /api/files – Bilder, Videos und Druckdateien der Druckteile. Ausgeliefert wird nur, was in der Tabelle „datei“ steht. */
export function fileRoutes(storage: Storage, auth: Auth) {
  const router = Router();

  // Bilder veröffentlichter Druckteile sind ohne Anmeldung abrufbar, Bilder von Entwürfen nur für das Druck-Team.
  router.get('/images/:file', async (req, res, next) => {
    const datei = await visibleItemFile(storage, param(req.params.file), 'bild', req.user);
    if (!datei) return next(notFound('Bild nicht gefunden.'));
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type(datei.mime);
    res.sendFile(storage.files.absPath(datei), (err) => {
      if (err && !res.headersSent) sendMissingImage(res); // Datensatz da, Datei fehlt (z. B. Backup ohne Dateien)
    });
  });

  // Videos: gleiche Sichtbarkeit wie Bilder. sendFile unterstützt Range-Anfragen (Vorspulen im Player).
  router.get('/videos/:file', async (req, res, next) => {
    const datei = await visibleItemFile(storage, param(req.params.file), 'video', req.user);
    if (!datei) return next(notFound('Video nicht gefunden.'));
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type(datei.mime);
    res.sendFile(storage.files.absPath(datei), (err) => {
      if (err && !res.headersSent) next(notFound('Datei nicht vorhanden (Video).'));
    });
  });

  // Druckdateien werden ausschließlich als Download ausgeliefert, nie interpretiert.
  router.get('/models/:itemId/:modelId', auth.requirePermission('files:models'), async (req, res, next) => {
    const datei = storage.files.find(param(req.params.modelId));
    if (!datei || datei.rolle !== 'druckdatei' || datei.objekttyp !== 'artikel' || datei.objektId !== param(req.params.itemId)) {
      return next(notFound('Druckdatei nicht gefunden.'));
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.download(storage.files.absPath(datei), datei.originalname || dateiName(datei), { headers: { 'Content-Type': 'application/octet-stream' } }, (err) => {
      if (err && !res.headersSent) next(notFound('Datei nicht vorhanden (Druckdatei).'));
    });
  });

  return router;
}
