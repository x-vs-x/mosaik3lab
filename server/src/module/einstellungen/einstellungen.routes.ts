import { Router } from 'express';
import type { AppConfig } from '../../config';
import type { Auth } from '../../kern/auth/middleware';
import { mailConfigInfo } from '../../kern/mail/mailConfig';
import type { Storage } from '../../storage';
import { masterDataRoutes, MASTERDATA_PATHS } from '../stammdaten/stammdaten.routes';
import { featuresSchema, orderFormSchema } from '@mosaik3lab/shared/einstellungen';
import { merkeDomainGesetzt } from './einstellungen.service';

/** /api/config – öffentliche Konfiguration fürs Frontend (ohne Anmeldung): Stammdaten und Schalter. */
export function publicConfigRoutes(storage: Storage, config: AppConfig) {
  const router = Router();
  router.get('/', async (_req, res) => {
    const s = await storage.settings.get();
    res.json({
      masterData: s.masterData,
      features: s.features,
      orderForm: s.orderForm,
      demoAccountsEnabled: config.allowDemoAccounts,
    });
  });
  return router;
}

/** /api/admin/settings – Einstellungen der App; Stammdaten hängen mit eigenem Recht darunter (module/stammdaten). */
export function adminSettingsRoutes(storage: Storage, auth: Auth) {
  const router = Router();
  // Stammdaten (inkl. Bambu-Palette) können auch Druck-Team-Konten freigegeben werden; der Ablauf der Anfragen gehört zu den Einstellungen.
  const settingsRight = auth.requirePermission('settings:manage');
  const masterDataRight = auth.requirePermission('masterdata:manage');
  router.use((req, res, next) => (MASTERDATA_PATHS.test(req.path) ? masterDataRight : settingsRight)(req, res, next));

  const present = async () => {
    const s = await storage.settings.get();
    return {
      masterData: s.masterData,
      // Nur lesend: eingerichtet wird der Mailversand im Server-Manager (Datenbank). Keine Zugangsdaten.
      mail: mailConfigInfo(storage.sqlite.db),
      mailStatus: s.mailStatus,
      features: s.features,
      orderForm: s.orderForm,
      // Pfade gibt es hier nicht mehr: Sie gehören in den Server-Manager und gehen den Browser nichts an.
    };
  };

  router.get('/', async (_req, res) => {
    res.json(await present());
  });

  router.use(masterDataRoutes(storage));

  // --- Bestellformular -------------------------------------------------------------
  router.put('/orderform', async (req, res) => {
    const orderForm = orderFormSchema.parse(req.body);
    await storage.settings.update((s) => ({ ...s, orderForm }));
    merkeDomainGesetzt(storage); // ab jetzt ändert die Ersteinrichtung die Domain nicht mehr
    res.json(await present());
  });

  // --- Schalter (für spätere Erweiterungen) -------------------------------------
  router.put('/features', async (req, res) => {
    const features = featuresSchema.parse(req.body);
    await storage.settings.update((s) => ({ ...s, features }));
    res.json(await present());
  });

  return router;
}
