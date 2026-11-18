import { Router } from 'express';
import type { AppConfig } from '../../config';
import type { Auth } from '../../kern/auth/middleware';
import type { Storage } from '../../storage';
import { neuigkeitenFuer } from './neuigkeiten.service';

/**
 * /api/neuigkeiten – „Was ist neu“ nach einem Update (auch vom Server-Manager genutzt). Prüfpunkt `settings:manage`
 * (hat nur der Administrator): ohne Anmeldung 401, ohne Recht 403.
 */
export function neuigkeitenRoutes(storage: Storage, auth: Auth, config: AppConfig) {
  const router = Router();
  router.use(auth.requirePermission('settings:manage'));

  router.get('/', (req, res) => {
    res.json(neuigkeitenFuer(storage.neuigkeiten, req.user!.id, { appVersion: config.appVersion, rootDir: config.rootDir }));
  });

  router.post('/gelesen', (req, res) => {
    storage.neuigkeiten.setGesehen(req.user!.id, config.appVersion);
    res.json({ ok: true });
  });
  return router;
}
