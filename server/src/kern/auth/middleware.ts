import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { forbidden, unauthorized } from '../errors';
import { permissionsForRequester, permissionsForUser } from '../../module/konten/rechte';
import { type Permission } from '@mosaik3lab/shared/konten';
import type { Requester } from '@mosaik3lab/shared/anfragen';
import type { User } from '../../domain/types';
import type { Storage } from '../../storage';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    /** Angemeldete Lehrkraft (Besteller-Verzeichnis) – Anmeldung nur per bekannter E-Mail. */
    requesterId?: string;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      /**
       * Lehrkraft mit derselben E-Mail: bei Lehrkräften ohne Konto die angemeldete Person selbst,
       * bei Konten ihr Eintrag im Lehrkräfte-Verzeichnis (falls vorhanden) für „Meine Anfragen“.
       */
      requester?: Requester;
    }
  }
}

export interface AuthOptions {
  allowDemoAccounts: boolean;
}

/** Konto mit Passwort, das sich anmelden darf (aktiv, Passwort festgelegt, Demo nur wenn erlaubt). */
export function canUseAccount(user: User | undefined, opts: AuthOptions): user is User {
  return !!user && user.active && user.role !== 'lehrkraft' && user.passwordHash !== '' && (opts.allowDemoAccounts || !user.isDemo);
}

/** Wirksame Rechte der angemeldeten Person; undefined = nicht angemeldet. */
export function permissionsOf(req: Request): Permission[] | undefined {
  if (req.user) return permissionsForUser(req.user, req.requester);
  return req.requester ? permissionsForRequester(req.requester) : undefined;
}

/**
 * Lädt den angemeldeten Benutzer bei jeder Anfrage frisch aus dem Speicher,
 * damit gesperrte Konten und geänderte Rechte sofort wirken.
 */
export function createAuth(storage: Storage, opts: AuthOptions) {
  const loadUser: RequestHandler = async (req, _res, next) => {
    const { userId, requesterId } = req.session ?? {};
    if (userId) {
      const user = await storage.users.findById(userId);
      // Konto auf „Lehrkraft“ zurückgestuft (inaktiv) → abmelden, danach Anmeldung ohne Passwort.
      if (canUseAccount(user, opts)) {
        req.user = user;
        req.requester = await storage.requesters.findByEmail(user.email);
      } else delete req.session.userId;
    } else if (requesterId) {
      const requester = await storage.requesters.findById(requesterId);
      if (requester) req.requester = requester;
      else delete req.session.requesterId;
    }
    next();
  };

  /** Nur Konten (Admin/Druck-Team) – z. B. Passwort ändern. */
  const requireAuth: RequestHandler = (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    next();
  };

  const requirePermission =
    (permission: Permission): RequestHandler =>
    (req: Request, _res: Response, next: NextFunction) => {
      const permissions = permissionsOf(req);
      if (!permissions) return next(unauthorized());
      if (!permissions.includes(permission)) return next(forbidden());
      next();
    };

  return { loadUser, requireAuth, requirePermission };
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Einfacher CSRF-Schutz: Ändernde API-Anfragen müssen einen eigenen Header tragen,
 * den Browser bei Cross-Site-Formularen nicht setzen können. Zusammen mit
 * SameSite=Strict-Cookies verhindert das Anfragen von fremden Seiten.
 */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'mosaik3lab') {
    return next(forbidden('Ungültige Anfrage (Sicherheitsprüfung fehlgeschlagen).'));
  }
  next();
};
