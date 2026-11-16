import crypto from 'node:crypto';
import type { RequestHandler } from 'express';

/** Name des Sitzungs-Cookies (express-session). */
export const SESSION_COOKIE = 'm3l.sid';

/** Prüft die Signatur wie express-session (cookie-signature: „s:<id>.<HMAC-SHA256, base64 ohne =>“). */
function validlySigned(raw: string, secret: string) {
  if (!raw.startsWith('s:')) return false;
  const value = raw.slice(2);
  const dot = value.lastIndexOf('.');
  if (dot < 1) return false;
  const expected = crypto.createHmac('sha256', secret).update(value.slice(0, dot)).digest('base64').replace(/=+$/, '');
  const given = Buffer.from(value.slice(dot + 1));
  return given.length === Buffer.byteLength(expected) && crypto.timingSafeEqual(given, Buffer.from(expected));
}

const decode = (v: string) => {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

/**
 * Mehrere Sitzungs-Cookies gleichen Namens (z. B. ein altes mit Path=/ aus Versionen ohne Basis-Pfad oder von einer
 * Test-Instanz auf demselben Rechner): express-session liest nur das erste – ist das ungültig, wirkt man abgemeldet.
 * Daher nur das erste gültig signierte weiterreichen und das alte Cookie unter Path=/ löschen.
 */
export function sessionCookieGuard(secret: string, basePath: string): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.cookie;
    if (!header) return next();
    const parts = header.split(';').map((p) => p.trim()).filter(Boolean);
    const ours = parts.filter((p) => p.startsWith(`${SESSION_COOKIE}=`));
    if (ours.length < 2) return next();
    const valid = ours.find((p) => validlySigned(decode(p.slice(SESSION_COOKIE.length + 1)), secret));
    const others = parts.filter((p) => !p.startsWith(`${SESSION_COOKIE}=`));
    req.headers.cookie = [...others, ...(valid ? [valid] : [])].join('; ');
    // Nur löschbar, was einen anderen Pfad als die App hat; das eigene Cookie setzt express-session ohnehin neu.
    if (basePath) res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'strict' });
    next();
  };
}
