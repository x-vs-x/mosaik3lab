import { Router, type RequestHandler } from 'express';
import type { AppConfig } from '../../config';
import { permissionsOf } from '../../kern/auth/middleware';
import { forbidden, unauthorized } from '../../kern/errors';
import type { NeuigkeitenRepository } from './neuigkeiten.repository';
import { neuigkeitenFuer } from './neuigkeiten.service';

/** /api/neuigkeiten – „Was ist neu“ nach einem Update, nur für Administratoren (auch vom Server-Manager genutzt). */
export function neuigkeitenRoutes(repo: NeuigkeitenRepository, config: AppConfig) {
  const router = Router();
  const nurAdmin: RequestHandler = (req, _res, next) => {
    if (req.user?.role === 'admin') return next();
    next(permissionsOf(req) ? forbidden() : unauthorized());
  };
  router.use(nurAdmin);

  router.get('/', (req, res) => {
    res.json(neuigkeitenFuer(repo, req.user!.id, { appVersion: config.appVersion, rootDir: config.rootDir }));
  });

  router.post('/gelesen', (req, res) => {
    repo.setGesehen(req.user!.id, config.appVersion);
    res.json({ ok: true });
  });
  return router;
}
