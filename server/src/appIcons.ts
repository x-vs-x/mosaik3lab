import path from 'node:path';
import express, { type Router } from 'express';

/**
 * App-Icons für Home-Bildschirm, Lesezeichen und Tab – robust für alle Geräte.
 * iOS/Safari fragt Icons teils an festen Namen ab (/apple-touch-icon-precomposed.png, /apple-touch-icon-180x180.png …).
 * Alle Varianten liefern das eine 180-px-Icon. Fehlende Bild-/Icon-Dateien → 404 statt der Startseite als „Bild“
 * (sonst hält iOS die HTML-Seite für das Icon und zeigt nur einen Buchstaben). Die Wurzel-Adressen
 * (/apple-touch-icon.png, /favicon.ico ohne Basis-Pfad) beantwortet das Portal (manager/lib/portalserver.mjs).
 */
const APPLE_ICON_ALIAS = /^\/apple-touch-icon(-\d+x\d+)?(-precomposed)?\.png$/;
const BILD_ENDUNG = /\.(png|jpe?g|gif|webp|avif|svg|ico|webmanifest)$/i;

/** Unter dem Basis-Pfad, nach den statischen Dateien und vor der Startseiten-Rückfallregel einhängen. */
export function iconRoutes(distDir: string): Router {
  const r = express.Router();
  const apple = path.join(distDir, 'apple-touch-icon.png');
  r.get(APPLE_ICON_ALIAS, (_req, res, next) => res.sendFile(apple, { maxAge: '1d' }, (err) => err && next(err)));
  r.get(BILD_ENDUNG, (_req, res) => res.status(404).type('text').send('Datei nicht gefunden.'));
  return r;
}
