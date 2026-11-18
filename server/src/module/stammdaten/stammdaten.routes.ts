import { Router } from 'express';
import { BAMBU_KATALOG } from '../../domain/bambuKatalog';
import type { Auth } from '../../kern/auth/middleware';
import { notFound } from '../../kern/errors';
import { param } from '../../kern/http';
import type { Storage } from '../../storage';
import { leseHinweis, loescheHinweis, ohneNeue } from './bambuAbgleich';
import { importFilaments, isMasterDataList, saveList, setFilamentAvailability, toggleStatus } from './stammdaten.service';
import { statusToggleSchema } from '@mosaik3lab/shared/anfragen';
import { filamentAvailabilitySchema, filamentImportSchema, type BambuKatalogAntwort } from '@mosaik3lab/shared/stammdaten';

/**
 * Stammdaten, Bestellstatus-Schalter und Bambu-Palette – eingehängt in /api/admin/settings. Jede Route nennt ihr Recht:
 * Stammdaten und Bambu-Palette „masterdata:manage“ (auch für Druck-Team-Konten), der Ablauf der Anfragen „settings:manage“.
 */
export function masterDataRoutes(storage: Storage, auth: Auth) {
  const router = Router();
  const stammdatenRecht = auth.requirePermission('masterdata:manage');
  const einstellungenRecht = auth.requirePermission('settings:manage');

  router.put('/masterdata/:list', stammdatenRecht, async (req, res) => {
    const list = param(req.params.list);
    if (!isMasterDataList(list)) throw notFound('Unbekannte Stammdatenliste.');
    res.json(await saveList(storage, list, req.body?.entries));
  });

  // --- Bestellstatus (feste Liste, nur an/aus) --------------------------------------
  router.patch('/order-statuses/:id', einstellungenRecht, async (req, res) => {
    const { active } = statusToggleSchema.parse(req.body);
    res.json(await toggleStatus(storage, param(req.params.id), active));
  });

  // --- Farbrollen aus dem Bambu-Lab-Katalog -------------------------------------------
  router.get('/bambu-palette', stammdatenRecht, (_req, res) => {
    const { quelle, stand, eintraege } = BAMBU_KATALOG;
    res.json({ quelle, stand, eintraege, hinweis: leseHinweis(storage) } satisfies BambuKatalogAntwort);
  });

  /** Hinweis nach dem Abgleich gelesen → ausblenden. */
  router.delete('/bambu-palette/hinweis', stammdatenRecht, (_req, res) => {
    loescheHinweis(storage);
    res.status(204).end();
  });

  router.post('/masterdata/filaments/import', stammdatenRecht, async (req, res) => {
    const { ids } = filamentImportSchema.parse(req.body);
    const result = await importFilaments(storage, ids);
    ohneNeue(storage, ids);
    res.json(result);
  });

  return router;
}

/** /api/filaments – Farbrollen als leer/verfügbar markieren; darf auch das Druck-Team (schnell, auch am Handy). */
export function filamentRoutes(storage: Storage, auth: Auth) {
  const router = Router();
  router.patch('/:id/availability', auth.requirePermission('filaments:manage'), async (req, res) => {
    const { available } = filamentAvailabilitySchema.parse(req.body);
    res.json(await setFilamentAvailability(storage, param(req.params.id), available));
  });
  return router;
}
