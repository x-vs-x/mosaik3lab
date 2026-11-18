import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import multer from 'multer';
import { ZodError } from 'zod';
import { createAuth, csrfGuard } from './kern/auth/middleware';
import { RepositorySessionStore } from './kern/auth/sessionStore';
import { SESSION_COOKIE, sessionCookieGuard } from './kern/auth/sessionCookie';
import type { AppConfig } from './config';
import { indexHtmlHandler } from './basePath';
import { HttpError } from './kern/errors';
import { authRoutes, personRoutes } from './module/konten/konten.routes';
import { fileRoutes, itemRoutes } from './module/katalog/katalog.routes';
import { datenRoutes } from './module/datenaustausch/datenaustausch.routes';
import { dashboardRoutes, orderRoutes } from './module/anfragen/anfragen.routes';
import { proposalRoutes } from './module/vorschlaege/vorschlaege.routes';
import { adminSettingsRoutes, publicConfigRoutes } from './module/einstellungen/einstellungen.routes';
import { bambuAbgleichBeimStart } from './module/stammdaten/bambuAbgleich';
import { filamentRoutes } from './module/stammdaten/stammdaten.routes';
import { neuigkeitenRoutes } from './module/neuigkeiten/neuigkeiten.routes';
import { versionBeimStart } from './module/neuigkeiten/neuigkeiten.service';
import { migrateUserEmails, seedIfEmpty } from './seed/seed';
import { importLegacyMail, importLegacySessionSecret } from './kern/mail/mailConfig';
import { sessionGeheimnis, setBetriebWennNeu } from './kern/betrieb';
import { retirePathConfig } from './bootstrapConfig';
import { createSqliteStorage } from './storage';
import { MAX_IMAGE_BYTES, MAX_MODEL_BYTES, MAX_VIDEO_BYTES } from './kern/uploads';
import { zodFieldErrors } from '@mosaik3lab/shared/basis';


export async function createApp(config: AppConfig) {
  // Datenbank, Tabellen und Ablage legt die App selbst an; Migrationen und die einmalige JSON-Übernahme laufen hier.
  const storage = await createSqliteStorage(config);
  const db = storage.sqlite.db;
  // Betriebseinstellungen liegen in der Datenbank: alte Dateien (mail.json, settings.json, .session-secret) einmalig übernehmen.
  importLegacyMail(db, { storageDir: config.storageDir, dataDir: config.dataDir });
  importLegacySessionSecret(config.dataDir, (s) => setBetriebWennNeu(db, 'betrieb', 'sessionSecret', s, true));
  // Übernahme erledigt (oder nicht nötig) → früher in der App eingestellte Ablagepfade sichern und entfernen.
  retirePathConfig(config.rootDir);
  // Versionswechsel merken (für „Was ist neu“) – vor den Demo-Daten, sonst sähe eine Neuinstallation wie ein Update aus.
  versionBeimStart(storage.neuigkeiten, config.appVersion);
  if (config.seedDemoData) await seedIfEmpty(storage);
  await migrateUserEmails(storage);
  // Bambu-Farbrollen mit dem mitgelieferten Katalog abgleichen (wirkt nach Updates; eigene Farbrollen bleiben unberührt).
  bambuAbgleichBeimStart(storage);
  // Bildpflege einige Minuten nach dem Start (wenn /api/health längst grün ist) – nie im Installer/Update-Schritt.
  storage.bildpflege.planeStart(config.bildpflegeNachMs).catch((err: Error) => console.warn(`[Bilder] Bildpflege nicht geplant: ${err.message}`));

  // Außen: die eigentliche Express-App (hört nur auf 127.0.0.1, dahinter steht der Portal-Dienst des Server-Managers);
  // innen: alle Routen unter dem Basis-Pfad (Standard /, z. B. /mosaik3lab).
  const outer = express();
  outer.disable('x-powered-by');
  outer.set('trust proxy', 'loopback'); // X-Forwarded-* nur vom Portal auf demselben Rechner glauben
  const app = express.Router();
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      // upgrade-insecure-requests und HSTS nur bei echtem HTTPS – sonst bricht der Aufruf über http://<IP> im Schulnetz.
      contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': config.https ? [] : null } },
      strictTransportSecurity: config.https ? { maxAge: 15552000 } : false,
    }),
  );
  // Komprimieren (gzip/brotli, reines JavaScript): API-JSON, HTML, JS, CSS – spart im WLAN viel. Nicht: Bilder, Videos,
  // ZIP und Downloads (schon komprimiert bzw. Strom mit Content-Length und Range fürs Vorspulen).
  app.use(compression({ filter: komprimieren }));
  app.use(express.json({ limit: '100kb' }));

  if (config.logRequests) {
    app.use('/api', (req, res, next) => {
      const start = Date.now();
      res.on('finish', () => console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start} ms)`));
      next();
    });
  }

  const sessionStore = new RepositorySessionStore(storage.sessions, config.sessionMaxAgeMs);
  const sessionSecret = config.sessionSecret ?? sessionGeheimnis(db);
  app.use(sessionCookieGuard(sessionSecret, config.basePath));
  app.use(
    session({
      name: SESSION_COOKIE,
      secret: sessionSecret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'strict',
        path: config.basePath || '/', // Cookie gilt nur unter dem Basis-Pfad der App
        // „auto“: sicher, sobald die Anfrage über HTTPS kam (Portal meldet X-Forwarded-Proto, trust proxy ist an).
        secure: config.https ? true : 'auto',
        maxAge: config.sessionMaxAgeMs,
      },
    }),
  );

  const authOptions = { allowDemoAccounts: config.allowDemoAccounts };
  const auth = createAuth(storage, authOptions);

  app.use('/api', csrfGuard, auth.loadUser);
  app.get('/api/health', (_req, res) => {
    // db: für den Server-Manager (Status-Seite, doctor).
    res.json({ ok: true, version: config.appVersion, demoAccountsEnabled: config.allowDemoAccounts, db: storage.database.info() });
  });
  app.use('/api/config', publicConfigRoutes(storage, config));
  app.use('/api/admin/settings', adminSettingsRoutes(storage, auth));
  app.use('/api/admin/daten', datenRoutes(storage, auth, config));
  app.use('/api/filaments', filamentRoutes(storage, auth));
  app.use('/api/auth', authRoutes(storage, auth, authOptions));
  app.use('/api/items', itemRoutes(storage, auth));
  app.use('/api/orders', orderRoutes(storage, auth));
  app.use('/api/proposals', proposalRoutes(storage, auth));
  app.use('/api/personen', personRoutes(storage, auth));
  app.use('/api/dashboard', dashboardRoutes(storage, auth));
  app.use('/api/files', fileRoutes(storage, auth));
  app.use('/api/neuigkeiten', neuigkeitenRoutes(storage, auth, config));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Unbekannter API-Endpunkt.' });
  });

  // Gebautes Frontend ausliefern (npm start). Im Entwicklungsmodus übernimmt Vite.
  if (fs.existsSync(path.join(config.clientDistDir, 'index.html'))) {
    // „/index.html“ direkt aufgerufen: wie die Startseite behandeln (mit passendem Basis-Pfad), nicht als Rohdatei
    app.get('/index.html', indexHtmlHandler(config.clientDistDir, config.basePath));
    app.use(
      express.static(config.clientDistDir, {
        index: false,
        maxAge: '1h',
        // Programmdateien unter /assets haben den Inhalt im Namen (Vite) – dürfen dauerhaft zwischengespeichert werden
        setHeaders: (res, file) => {
          if (/[\\/]assets[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    // Fehlende Programmdatei (z. B. alter Tab nach einem Update) → 404 statt der Startseite als „JavaScript“ (leere Seite).
    app.use('/assets', (_req, res) => res.status(404).type('text').send('Datei nicht gefunden – bitte die Seite neu laden.'));
    app.get(/^\/(?!api\/).*/, indexHtmlHandler(config.clientDistDir, config.basePath));
  }

  app.use(errorHandler);

  if (config.basePath) {
    // /mosaik3lab → /mosaik3lab/ (die Seite braucht den Schrägstrich für <base href>); / → zur App
    outer.use((req, res, next) => (req.path === config.basePath ? res.redirect(301, `${config.basePath}/${req.url.slice(req.path.length)}`) : next()));
    outer.get('/', (_req, res) => res.redirect(302, `${config.basePath}/`));
  }
  outer.use(config.basePath || '/', app);

  return {
    app: outer,
    storage,
    async close() {
      sessionStore.stop();
      await storage.close();
    },
  };
}

/** Nur Text-Antworten komprimieren; Dateien der Ablage, Export-Download und Range-Anfragen nie. */
function komprimieren(req: Request, res: Response) {
  if (req.headers.range || /^[/]api[/](files[/]|admin[/]daten[/]export)/.test(req.path)) return false;
  return compression.filter(req, res); // prüft den Inhaltstyp (text/*, JSON, JavaScript, SVG …)
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, fields: err.fields });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Bitte überprüfen Sie Ihre Eingaben.', fields: zodFieldErrors(err) });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Die Datei ist zu groß (Bilder max. ${MAX_IMAGE_BYTES / 1024 / 1024} MB, Druckdateien max. ${MAX_MODEL_BYTES / 1024 / 1024} MB, Videos max. ${MAX_VIDEO_BYTES / 1024 / 1024} MB).`
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Zu viele Dateien oder unerwartetes Feld.'
          : 'Der Upload ist fehlgeschlagen.';
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: message });
    return;
  }
  const type = (err as { type?: string }).type;
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Ungültige Daten (kein gültiges JSON).' });
    return;
  }
  if (type === 'entity.too.large') {
    res.status(413).json({ error: 'Die Anfrage ist zu groß.' });
    return;
  }
  console.error('[Fehler]', err);
  res.status(500).json({ error: 'Ein unerwarteter Serverfehler ist aufgetreten.' });
};
