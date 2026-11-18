// Portal: einziger Zugang von außen (Port 80, mit HTTPS zusätzlich 443). Reines Node (node:http/node:https), keine Abhängigkeiten.
//   /<basePath>/…  →  Web-App auf 127.0.0.1:<appPort> (Streaming, große Uploads/Downloads, X-Forwarded-For/-Proto/-Host)
//   /<basePath>/manager…  →  Server-Manager auf 127.0.0.1:<managerPort> (ohne Präfix, Kopf X-Mosaik3lab-Manager)
//   /              →  Weiterleitung auf /<basePath>/
//   /apple-touch-icon*.png, /favicon.ico  →  Icons der App (iOS/Browser fragen an der Wurzel, auch ohne <link>)
//   /zertifikat    →  Anleitung + Zertifikat zum Herunterladen (nur bei HTTPS; bleibt auch über HTTP erreichbar)
// Bei HTTPS: Port 80 leitet auf HTTPS um, TLS endet hier. Die App selbst hört nur auf 127.0.0.1 (trust proxy: nur localhost).
// Dies ist ein Weiterleitungs-Dienst für EINE App im Schulnetz – kein Allzweck-Reverse-Proxy (kein WebSocket, kein Caching).
import http from 'node:http';
import https from 'node:https';

const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'proxy-connection']);
const MINUTES = 60_000;
const TIMEOUT_MS = 10 * MINUTES; // Upload/Download darf lange dauern, aber nicht ewig stillstehen

// Feste Icon-Adressen an der Wurzel: iOS „Zum Home-Bildschirm“ und Lesezeichen fragen dort; die App antwortet unter /<basePath>/…
const ROOT_ICON = /^\/(apple-touch-icon(-\d+x\d+)?(-precomposed)?\.png|favicon\.ico)$/;

const clientIp = (req) => (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const page = (title, body) =>
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>` +
  // Schrift in rem (wächst mit der Grundschrift des Geräts), lange Wörter mit Silbentrennung statt über den Rand,
  // allein stehende Links mit Tippfläche ≥ 44 px.
  `<style>body{font:1.125rem/1.5 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;color:#1c1917;overflow-wrap:anywhere;hyphens:auto;-webkit-hyphens:auto}a{color:#8a1d00}a.knopf{display:inline-block;padding:.6rem 0}h1{font-size:1.5rem}code{background:#f5f5f4;padding:.1em .3em}</style></head><body>${body}</body></html>`;

const CERT_HELP = (cn, base) =>
  page('Zertifikat installieren – Mosaik³LAB',
    `<h1>Zertifikat installieren</h1><p>Damit Ihr Gerät <strong>${esc(cn)}</strong> als sicher anerkennt (kein Warnhinweis mehr), einmalig das Zertifikat laden und als vertrauenswürdig eintragen.</p>` +
    `<p><a class="knopf" href="/zertifikat.cer" download>Zertifikat herunterladen (.cer)</a></p>` +
    `<ul><li><strong>Windows:</strong> Datei öffnen → „Zertifikat installieren“ → „Lokaler Computer“ → „Alle Zertifikate in folgendem Speicher speichern“ → <em>Vertrauenswürdige Stammzertifizierungsstellen</em>.</li>` +
    `<li><strong>iPad/iPhone:</strong> Datei laden → „Profil geladen“ in den Einstellungen installieren → danach unter Einstellungen → Allgemein → Info → Zertifikatsvertrauenseinstellungen <em>vollständiges Vertrauen</em> aktivieren.</li>` +
    `<li><strong>Android:</strong> Einstellungen → Sicherheit → Verschlüsselung &amp; Anmeldedaten → Zertifikat installieren → CA-Zertifikat.</li>` +
    `<li><strong>Mac:</strong> Datei öffnen (Schlüsselbund) → Zertifikat doppelklicken → Vertrauen → „Immer vertrauen“.</li></ul>` +
    `<p>Ohne vertrautes Zertifikat lädt iPhone/iPad beim „Zum Home-Bildschirm“ das Logo nicht (es erscheint nur ein Buchstabe).</p>` +
    `<p><a class="knopf" href="${esc(base || '/')}">Weiter zu Mosaik³LAB</a></p>`);

function notFoundPage(basePath) {
  return page('Nicht gefunden', `<h1>Diese Adresse gibt es hier nicht.</h1><p>Mosaik³LAB finden Sie unter <a href="${esc(basePath || '/')}/">${esc(basePath || '/')}/</a>.</p>`);
}
function badGatewayPage() {
  return page('Mosaik³LAB antwortet nicht', '<h1>Mosaik³LAB antwortet gerade nicht.</h1><p>Die Anwendung startet vielleicht gerade neu. Bitte in einer Minute noch einmal versuchen. Bleibt es dabei, bitte die Technik informieren (Server-Manager → Dienste).</p>');
}

/**
 * Anfrage bearbeiten. opts: { basePath, appPort, managerPort?, scheme: 'http'|'https', certInfo: () => { cn, der } | null }.
 */
export function handleRequest(req, res, opts) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const base = opts.basePath;

  if (opts.certInfo && (p === '/zertifikat' || p === '/zertifikat.cer')) {
    const cert = opts.certInfo();
    if (cert) {
      if (p === '/zertifikat.cer') {
        res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="mosaik3lab.cer"', 'Cache-Control': 'no-store' });
        return res.end(cert.der);
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(CERT_HELP(cert.cn, base));
    }
  }
  // Server-Manager über die App-Adresse: /<pfad>/manager… → Manager auf 127.0.0.1 (Pfad ohne Präfix). Der Kopf
  // X-Mosaik3lab-Manager wird hier IMMER gesetzt – daran erkennt der Manager „über das Netz“ (lib/remote.mjs).
  const mgr = `${base}/manager`;
  if (opts.managerPort && (p === mgr || p.startsWith(`${mgr}/`))) {
    return proxy(req, res, opts, { port: opts.managerPort, path: (p.slice(mgr.length) || '/') + url.search, host: `127.0.0.1:${opts.managerPort}`, manager: mgr });
  }
  if (base && (p === '/' || p === '/index.html')) {
    res.writeHead(302, { Location: `${base}/${url.search}` });
    return res.end();
  }
  if (base && (req.method === 'GET' || req.method === 'HEAD') && ROOT_ICON.test(p)) {
    return proxy(req, res, opts, { port: opts.appPort, path: `${base}${p}${url.search}` });
  }
  if (base && !(p === base || p.startsWith(`${base}/`))) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(notFoundPage(base));
  }
  proxy(req, res, opts);
}

/** Weiterleiten an die App (Standard), an einen anderen App-Pfad (target: { port, path }) oder an den Manager (target: { port, path, host, manager }). */
function proxy(req, res, opts, target = null) {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (HOP.has(k) || k.startsWith('x-forwarded-') || k === 'forwarded' || k === 'x-mosaik3lab-manager') continue; // von außen mitgeschickte Angaben werden nie geglaubt
    headers[k] = v;
  }
  headers['x-forwarded-for'] = clientIp(req);
  headers['x-forwarded-proto'] = opts.scheme;
  headers['x-forwarded-host'] = req.headers.host ?? '';
  if (target?.manager) Object.assign(headers, { host: target.host, 'x-mosaik3lab-manager': target.manager });
  const upstream = http.request({ host: '127.0.0.1', port: target?.port ?? opts.appPort, method: req.method, path: target?.path ?? req.url, headers, timeout: TIMEOUT_MS }, (up) => {
    const out = {};
    for (const [k, v] of Object.entries(up.headers)) if (!HOP.has(k)) out[k] = v;
    res.writeHead(up.statusCode ?? 502, up.statusMessage, out);
    up.pipe(res);
    up.on('error', () => res.destroy());
  });
  const fail = () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(target?.manager ? page('Server-Manager antwortet nicht', '<h1>Der Server-Manager antwortet gerade nicht.</h1><p>Bitte in einer Minute noch einmal versuchen oder direkt am Server öffnen.</p>') : badGatewayPage());
    } else res.destroy();
  };
  upstream.on('timeout', () => upstream.destroy(new Error('Zeitüberschreitung')));
  upstream.on('error', fail);
  req.on('aborted', () => upstream.destroy());
  res.on('close', () => !res.writableEnded && upstream.destroy());
  req.pipe(upstream);
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function tune(server) {
  server.requestTimeout = 0; // große Uploads (Export/Import bis 1 GB) dürfen länger als 5 Minuten dauern
  server.headersTimeout = 60_000;
  server.keepAliveTimeout = 65_000;
  server.on('clientError', (_err, socket) => socket.destroy());
  server.on('error', () => {});
  return server;
}

/**
 * Portal starten. opts: { host, httpPort, httpsPort, tls ({ pfx, passphrase } | { cert, key } | null), basePath, appPort,
 * certInfo: () => { cn, der } | null }. Wirft bei belegtem Port (err.code === 'EADDRINUSE', err.port gesetzt).
 * → { close(), ports }
 */
export async function startPortal(opts) {
  const servers = [];
  const close = () => Promise.all(servers.map((s) => new Promise((r) => { s.close(() => r()); s.closeAllConnections?.(); })));
  try {
    if (opts.tls) {
      const secure = tune(https.createServer({ ...opts.tls, minVersion: 'TLSv1.2' }, (req, res) => handleRequest(req, res, { ...opts, scheme: 'https' })));
      servers.push(secure);
      await listen(secure, opts.httpsPort, opts.host).catch((err) => Promise.reject(Object.assign(err, { port: opts.httpsPort })));
      const plain = tune(http.createServer((req, res) => {
        const url = new URL(req.url, 'http://x');
        if (url.pathname === '/zertifikat' || url.pathname === '/zertifikat.cer') return handleRequest(req, res, { ...opts, scheme: 'http' }); // Zertifikat muss ohne Warnung ladbar sein
        const host = (req.headers.host ?? 'localhost').replace(/:\d+$/, '').replace(/^\[(.*)\]$/, '[$1]');
        res.writeHead(301, { Location: `https://${host}${opts.httpsPort === 443 ? '' : `:${opts.httpsPort}`}${req.url}`, 'Cache-Control': 'no-store' });
        res.end();
      }));
      servers.push(plain);
      await listen(plain, opts.httpPort, opts.host).catch((err) => Promise.reject(Object.assign(err, { port: opts.httpPort })));
      return { close, ports: [opts.httpPort, opts.httpsPort] };
    }
    const plain = tune(http.createServer((req, res) => handleRequest(req, res, { ...opts, scheme: 'http', certInfo: null })));
    servers.push(plain);
    await listen(plain, opts.httpPort, opts.host).catch((err) => Promise.reject(Object.assign(err, { port: opts.httpPort })));
    return { close, ports: [opts.httpPort] };
  } catch (err) {
    await close();
    throw err;
  }
}
