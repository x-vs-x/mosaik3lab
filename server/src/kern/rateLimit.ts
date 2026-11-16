import type { RequestHandler } from 'express';
import { HttpError } from './errors';

/**
 * Einfache Begrenzung je IP-Adresse (im Arbeitsspeicher).
 * Schützt die ohne Anmeldung nutzbaren Endpunkte vor massenhaften Anfragen.
 */
export function rateLimit({ windowMs, max, message }: { windowMs: number; max: number; message: string }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt < now) hits.delete(key);
  }, windowMs);
  timer.unref();

  return (req, _res, next) => {
    const key = req.ip ?? 'unbekannt';
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > max) return next(new HttpError(429, message));
    next();
  };
}
