// Zugang zum Server-Manager über die App-Adresse (http://<Server>/<pfad>/manager) – über Portal bzw. Vite-Proxy.
// Der Manager selbst hört weiter nur auf 127.0.0.1. Woran erkennt er „über das Netz“? Am Kopf X-Mosaik3lab-Manager, den
// Portal und Vite-Proxy IMMER selbst setzen (ein vom Browser mitgeschickter Wert wird überschrieben). Direkt auf
// 127.0.0.1:<Port> fehlt er → Anmeldung mit dem Admin-Konto der App (auth.mjs).
// Über das Netz gilt: angemeldet als Administrator der App – sonst nichts, keine zweite Anmeldung.
import http from 'node:http';

export const REMOTE_HEADER = 'x-mosaik3lab-manager';
const PREFIX = /^(\/[A-Za-z0-9._~-]+)*\/manager$/;

/** Anfrage über Portal/Proxy? → { prefix, appBase, ip, origin } · direkt → null · ungültiger Kopf → Fehler. */
export function remoteOf(req) {
  const raw = req.headers[REMOTE_HEADER];
  if (raw === undefined) return null;
  const prefix = String(raw);
  if (!PREFIX.test(prefix) || prefix.length > 100) throw Object.assign(new Error('Ungültige Weiterleitung.'), { status: 400 });
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const host = String(req.headers['x-forwarded-host'] ?? '');
  return { prefix, appBase: prefix.slice(0, -'/manager'.length), ip: String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || '?', https: proto === 'https', origin: host ? `${proto}://${host}` : null };
}

/**
 * Ist der Browser in der App als Administrator angemeldet? Fragt GET <appBase>/api/auth/me bei der App auf 127.0.0.1
 * (mit dem Cookie des Browsers). Antwort der App: { user: { role } | null, permissions }.
 */
export function isAppAdmin(req, appPort, appBase) {
  const cookie = req.headers.cookie;
  if (!cookie) return Promise.resolve(false);
  return new Promise((resolve) => {
    const r = http.get({ host: '127.0.0.1', port: appPort, path: `${appBase}/api/auth/me`, headers: { Cookie: cookie, Accept: 'application/json' }, timeout: 5000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(res.statusCode === 200 && JSON.parse(Buffer.concat(chunks)).user?.role === 'admin');
        } catch {
          resolve(false);
        }
      });
    });
    r.on('timeout', () => r.destroy());
    r.on('error', () => resolve(false));
  });
}

/** Seite für den Browser, wenn der Zugang über das Netz nicht erlaubt ist. */
export function deniedPage(text, appBase) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Server-Manager</title></head>` +
    `<body><h1>Server-Manager</h1><p>${esc(text)}</p>` +
    `<p><a href="${esc(appBase || '')}/">Zu Mosaik³LAB</a></p></body></html>`;
}
