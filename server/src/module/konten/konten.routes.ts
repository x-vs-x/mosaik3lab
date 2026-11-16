import { Router, type Request } from 'express';
import { permissionsForRequester, permissionsForUser } from '../../domain/permissions';
import { accountSessionUser, teacherSessionUser } from '../../domain/types';
import { permissionsOf, type Auth, type AuthOptions } from '../../kern/auth/middleware';
import { rateLimit } from '../../kern/rateLimit';
import { SESSION_COOKIE } from '../../kern/auth/sessionCookie';
import type { Storage } from '../../storage';
import { changeOwnPassword, checkLogin, findAccount, recordLogin, registerRequester, sessionPayload } from './konten.service';
import { linkInfo, passwortSetzen } from './passwortlink';
import { adminPasswortLink, listPersonen, passwortVergessen, savePerson } from './personen.service';
import {
  identifySchema,
  loginSchema,
  passwordChangeSchema,
  passwortSetzenSchema,
  passwortVergessenSchema,
  personSchema,
} from '@mosaik3lab/shared/konten';
import { emailSchema } from '@mosaik3lab/shared/basis';
import { z } from 'zod';

/** Neue Session-ID nach Login (Schutz vor Session Fixation), dann Anmeldung eintragen. */
async function startSession(req: Request, data: { userId?: string; requesterId?: string }) {
  await new Promise<void>((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
  Object.assign(req.session, data);
  await new Promise<void>((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
}

/** /api/auth – Anmeldung in zwei Schritten, Abmelden, eigenes Passwort, Passwort per Link. */
export function authRoutes(storage: Storage, auth: Auth, opts: AuthOptions) {
  const router = Router();
  // Begrenzt beide Anmeldeschritte je IP-Adresse (u. a. gegen das Durchprobieren von E-Mail-Adressen).
  const loginLimit = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 60,
    message: 'Zu viele Anmeldeversuche. Bitte in einigen Minuten erneut versuchen.',
  });
  const registerLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    message: 'Es wurden sehr viele Adressen angelegt. Bitte später erneut versuchen.',
  });
  const linkLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: 'Es wurden sehr viele Links angefordert. Bitte später erneut versuchen.',
  });

  const signedInTeacher = async (req: Request, requesterId: string) => {
    const requester = (await storage.requesters.findById(requesterId))!;
    await startSession(req, { requesterId });
    return { result: 'signed-in', ...sessionPayload(teacherSessionUser(requester), permissionsForRequester(requester)) };
  };

  // Schritt 1: E-Mail prüfen. Antwort nur „password“ (Konto → Schritt 2), „signed-in“
  // (bekannte Lehrkraft, direkt angemeldet) oder „unknown“ – nie weitere Kontodaten.
  router.post('/identify', loginLimit, async (req, res) => {
    const { email } = identifySchema.parse(req.body);
    if (await findAccount(storage, email)) {
      res.json({ result: 'password' });
      return;
    }
    const requester = await storage.requesters.findByEmail(email);
    if (!requester) {
      res.json({ result: 'unknown' });
      return;
    }
    res.json(await signedInTeacher(req, requester.id));
  });

  // Unbekannte E-Mail: „Jetzt Konto anlegen“ – legt eine Lehrkraft an und meldet sie direkt an.
  router.post('/register', registerLimit, async (req, res) => {
    const { email } = identifySchema.parse(req.body);
    const requester = await registerRequester(storage, email);
    res.status(201).json(await signedInTeacher(req, requester.id));
  });

  // Schritt 2: Passwort für Konten von Admin und Druck-Team.
  router.post('/login', loginLimit, async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await checkLogin(storage, email, password, opts);
    await startSession(req, { userId: user.id });
    const updated = await recordLogin(storage, user);
    res.json(sessionPayload(accountSessionUser(updated), permissionsForUser(updated, await storage.requesters.findByEmail(updated.email))));
  });

  router.post('/logout', (req, res, next) => {
    // Gleicher Pfad wie beim Setzen (Basis-Pfad), sonst bleibt das Cookie stehen.
    const { path, httpOnly, sameSite, secure } = req.session.cookie;
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie(SESSION_COOKIE, { path, httpOnly, sameSite, secure: secure === true });
      res.json({ ok: true });
    });
  });

  router.get('/me', (req, res) => {
    const permissions = permissionsOf(req) ?? [];
    if (req.user) res.json(sessionPayload(accountSessionUser(req.user), permissions));
    else if (req.requester) res.json(sessionPayload(teacherSessionUser(req.requester), permissions));
    else res.json({ user: null, permissions: [] });
  });

  router.post('/password', auth.requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = passwordChangeSchema.parse(req.body);
    await changeOwnPassword(storage, req.user!, currentPassword, newPassword, req.sessionID);
    res.json({ ok: true });
  });

  // „Passwort vergessen?“ – immer dieselbe Antwort, damit niemand Adressen ausprobieren kann. Der Versand läuft
  // im Hintergrund, sonst verriete die längere Antwortzeit (SMTP), dass es zur Adresse ein Konto gibt.
  router.post('/passwort-vergessen', linkLimit, async (req, res) => {
    const { email } = passwortVergessenSchema.parse(req.body);
    passwortVergessen(storage, email).catch((err) => console.warn('[Anmeldung] „Passwort vergessen“ fehlgeschlagen:', (err as Error).message));
    res.json({ ok: true });
  });

  // Link aus der Mail: Für wen ist er? (Token im Rumpf, nicht in der Adresse – landet so in keinem Protokoll.)
  router.post('/passwort-link', loginLimit, async (req, res) => {
    const { token } = passwortSetzenSchema.pick({ token: true }).parse(req.body);
    res.json(await linkInfo(storage, token));
  });

  // Passwort über den Link festlegen – danach direkt angemeldet.
  router.post('/passwort-setzen', loginLimit, async (req, res) => {
    const { token, password } = passwortSetzenSchema.parse(req.body);
    const user = await passwortSetzen(storage, token, password);
    await startSession(req, { userId: user.id });
    const updated = await recordLogin(storage, user);
    res.json(sessionPayload(accountSessionUser(updated), permissionsForUser(updated, await storage.requesters.findByEmail(updated.email))));
  });

  return router;
}

/** /api/personen – Personen und Rechte (nur mit „users:manage“, also Administratoren). */
export function personRoutes(storage: Storage, auth: Auth) {
  const router = Router();
  router.use(auth.requirePermission('users:manage'));

  router.get('/', async (_req, res) => {
    res.json(await listPersonen(storage));
  });

  router.put('/', async (req, res) => {
    res.json(await savePerson(storage, req.user!, personSchema.parse(req.body)));
  });

  router.post('/passwort-link', async (req, res) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    res.json(await adminPasswortLink(storage, email));
  });

  return router;
}
