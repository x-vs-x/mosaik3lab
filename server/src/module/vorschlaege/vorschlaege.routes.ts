import { Router } from 'express';
import { MAX_PROPOSAL_PHOTOS } from '@mosaik3lab/shared/vorschlaege';
import { toOwnProposal } from './vorschlaege.sicht';
import type { Auth } from '../../kern/auth/middleware';
import { param, queryText, sendMissingImage } from '../../kern/http';
import { rateLimit } from '../../kern/rateLimit';
import { bildUpload } from '../../kern/uploads';
import type { Storage } from '../../storage';
import { createRequester } from '../konten/konten.service';
import { answerProposal, convertProposal, listProposals, loadProposal, myProposals, proposalPhoto, submitProposal } from './vorschlaege.service';
import { proposalUpdateSchema } from '@mosaik3lab/shared/vorschlaege';

/** Fotos eines Vorschlags: gleiche Prüfung wie Artikelbilder (Endung + Magic Bytes, max. 5 MB), höchstens 5 Stück. */
const photoUpload = bildUpload(MAX_PROPOSAL_PHOTOS, 'Fotos');

/** /api/proposals – Vorschläge der Lehrkräfte; Bearbeitung durch das Druck-Team. */
export function proposalRoutes(storage: Storage, auth: Auth) {
  const router = Router();

  const createLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 15,
    message: 'Es wurden sehr viele Vorschläge gesendet. Bitte später erneut versuchen.',
  });

  // Vorschlag einreichen (angemeldete Lehrkraft). Multipart: Feld „data“ = JSON, Dateien „photos“ (max. 5).
  router.post('/', auth.requirePermission('vorschlaege:eigene'), createLimit, photoUpload.array('photos', MAX_PROPOSAL_PHOTOS), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    // Konten (Druck-Team/Admin) ohne Eintrag im Lehrkräfte-Verzeichnis bekommen ihn beim ersten Vorschlag.
    const requester = req.requester ?? (req.user ? await createRequester(storage, req.user.email) : undefined);
    const created = await submitProposal(storage, requester, req.body?.data, files);
    res.status(201).json(toOwnProposal(created));
  });

  // Eigene Vorschläge der Lehrkraft (mit Status und Antwort des Teams)
  router.get('/mine', auth.requirePermission('vorschlaege:eigene'), async (req, res) => {
    res.json(req.requester ? (await myProposals(storage, req.requester.id)).map(toOwnProposal) : []);
  });

  // Alle Vorschläge (Druck-Team / Admin)
  router.get('/', auth.requirePermission('vorschlaege:sehen'), async (req, res) => {
    res.json(listProposals(storage, queryText(req.query.status), queryText(req.query.q)));
  });

  // Nur die Zahl neuer Vorschläge (Zähler in der Seitenleiste, bei jedem Seitenwechsel)
  router.get('/anzahl-neu', auth.requirePermission('vorschlaege:sehen'), (_req, res) => {
    res.json({ neu: storage.proposals.countByStatus('neu') });
  });

  // Foto eines Vorschlags: die einreichende Lehrkraft und wer Vorschläge sehen darf
  router.get('/:id/photos/:file', async (req, res) => {
    const datei = await proposalPhoto(storage, param(req.params.id), param(req.params.file), req.user, req.requester);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type(datei.mime);
    res.sendFile(storage.files.absPath(datei), (err) => {
      if (err && !res.headersSent) sendMissingImage(res); // Datei fehlt (z. B. Backup ohne Dateien)
    });
  });

  router.get('/:id', auth.requirePermission('vorschlaege:sehen'), async (req, res) => {
    res.json(await loadProposal(storage, param(req.params.id)));
  });

  // Status ändern und der Lehrkraft antworten
  router.patch('/:id', auth.requirePermission('vorschlaege:bearbeiten'), async (req, res) => {
    const { status, reply } = proposalUpdateSchema.parse(req.body);
    res.json(await answerProposal(storage, param(req.params.id), status, reply, req.user!));
  });

  // „In Druckteil umwandeln“
  router.post('/:id/convert', auth.requirePermission('vorschlaege:umwandeln'), async (req, res) => {
    res.status(201).json(await convertProposal(storage, param(req.params.id), req.user!));
  });

  return router;
}
