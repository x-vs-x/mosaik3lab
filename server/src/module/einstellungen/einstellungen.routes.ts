import { Router } from 'express';
import type { AppConfig } from '../../config';
import type { Auth } from '../../kern/auth/middleware';
import { mailConfigInfo } from '../../kern/mail/mailConfig';
import type { Storage } from '../../storage';
import { masterDataRoutes } from '../stammdaten/stammdaten.routes';
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

/**
 * /api/admin/settings – Einstellungen der App („settings:manage“); Stammdaten hängen darunter, jede Route mit ihrem
 * eigenen Prüfpunkt (module/stammdaten).
 */
export function adminSettingsRoutes(storage: Storage, auth: Auth) {
  const router = Router();
  const settingsRight = auth.requirePermission('settings:manage');

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

  router.get('/', settingsRight, async (_req, res) => {
    res.json(await present());
  });

  router.use(masterDataRoutes(storage, auth));

  // --- Bestellformular -------------------------------------------------------------
  router.put('/orderform', settingsRight, async (req, res) => {
    const orderForm = orderFormSchema.parse(req.body);
    await storage.settings.update((s) => ({ ...s, orderForm }));
    merkeDomainGesetzt(storage); // ab jetzt ändert die Ersteinrichtung die Domain nicht mehr
    res.json(await present());
  });

  // --- Schalter (für spätere Erweiterungen) -------------------------------------
  router.put('/features', settingsRight, async (req, res) => {
    const features = featuresSchema.parse(req.body);
    await storage.settings.update((s) => ({ ...s, features }));
    res.json(await present());
  });

  // Alles Übrige (unbekannte Pfade) wie bisher nur mit dem Einstellungsrecht – danach 404.
  router.use(settingsRight);
  return router;
}
