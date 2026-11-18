import { readFileSync } from 'node:fs';
import { Agent } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Entwicklungsserver; API-Aufrufe werden an das Express-Backend weitergeleitet.
// WEB_PORT/API_PORT erlauben parallele Test-Instanzen (Unter-Sessions).
// BASE_PATH (z. B. /mosaik3lab) lässt auch den Entwicklungsserver unter dem Verzeichnis laufen – wie im Betrieb.
// WEB_HOST: '::' = alle Adressen (IPv4 + IPv6, fürs Schulnetz); Standard nur dieser Rechner.
const webPort = Number(process.env.WEB_PORT ?? 5173);
const apiPort = Number(process.env.API_PORT ?? 3001);
const basePath = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');
const webHost = process.env.WEB_HOST ?? '127.0.0.1';
// Server-Manager unter ${basePath}/manager (wie das Portal im Betrieb): Präfix ab, Kopf X-Mosaik3lab-Manager immer selbst
// setzen (ein vom Browser mitgeschickter Wert wird überschrieben) – daran erkennt der Manager „über das Netz“.
const managerPort = Number(process.env.MANAGER_PORT ?? 5190);
const managerPrefix = `${basePath}/manager`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Verbindungen zu API und Manager wiederverwenden: Ohne Agent öffnet der Proxy je Anfrage eine neue Verbindung.
// Unter Windows bleiben dann einzelne Verbindungsaufbauten sekundenlang hängen (viele TIME_WAIT-Ports auf 127.0.0.1)
// – Seiten laden ewig, Anmeldungen scheitern scheinbar zufällig.
const keepAlive = new Agent({ keepAlive: true });

/** Setzt <base href> auf den Basis-Pfad und leitet / auf das Verzeichnis um (nur Entwicklungsserver). */
function devBasePath(): Plugin {
  return {
    name: 'mosaik3lab-dev-base-path',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace('<base href="/" />', `<base href="${basePath}/" />`),
    configureServer(server) {
      // Ein Gerät, das die Verbindung hart abbricht (ECONNRESET, z. B. Handy im WLAN), darf den Server nicht beenden.
      server.httpServer?.on('connection', (socket) => socket.on('error', () => {}));
      if (!basePath) return;
      server.middlewares.use((req, res, next) => {
        const [pathname, query = ''] = (req.url ?? '/').split(/\?(.*)/s);
        if (pathname === '/' || pathname === '/index.html' || pathname === basePath) {
          res.statusCode = 302;
          res.setHeader('Location', `${basePath}/${query ? `?${query}` : ''}`);
          res.end();
          return;
        }
        next();
      });
    },
  };
}

/**
 * Die zwei meistgenutzten Schriftschnitte (Atkinson Hyperlegible latin 400 und 700) früh laden: Sonst entdeckt der Browser
 * sie erst nach dem CSS – auf langsamem WLAN springt der Text sichtbar um. Relative Adressen wie alle Programmdateien
 * (<base href> setzt der Server, z. B. /mosaik3lab/). Nur im Build (Namen mit Inhalts-Prüfsumme).
 */
function schriftenVorladen(): Plugin {
  const SCHNITTE = [/^assets\/atkinson-hyperlegible-latin-400-normal-[^/]+\.woff2$/, /^assets\/atkinson-hyperlegible-latin-700-normal-[^/]+\.woff2$/];
  return {
    name: 'mosaik3lab-schriften-vorladen',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      // Direkt hinter <base href>: Davor würde die relative Adresse ohne Basis-Pfad aufgelöst.
      handler: (html, ctx) => {
        const links = SCHNITTE.flatMap((muster) => Object.keys(ctx.bundle ?? {}).filter((datei) => muster.test(datei)))
          .map((datei) => `\n    <link rel="preload" href="./${datei}" as="font" type="font/woff2" crossorigin />`)
          .join('');
        return html.replace(/(<base\s+href="[^"]*"\s*\/?>)/i, `$1${links}`);
      },
    },
  };
}

// Gebautes Frontend mit relativen Adressen (base './') – der Server setzt beim Ausliefern <base href> auf den eingestellten
// Basis-Pfad (Standard /, z. B. /mosaik3lab). So braucht ein anderer Pfad keinen neuen Build.
// Versionsnummer aus der obersten package.json (eine für alles) – in der App als APP_VERSION (src/lib/version.ts)
const appVersion = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : `${basePath}/`,
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [react(), tailwindcss(), devBasePath(), schriftenVorladen()],
  build: {
    rollupOptions: {
      output: {
        // React in eigenem Paket: ändert sich bei Updates der App nicht und bleibt im Zwischenspeicher der Geräte.
        manualChunks: (id) => (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id) ? 'react' : undefined),
      },
    },
  },
  server: {
    // HMR=off (Hauptstand zum Testen): keine Live-Verbindung → kein automatisches Neuladen, wenn der Browser den Tab
    // im Hintergrund drosselt und die Verbindung kurz abreißt (sonst gehen Formulareingaben verloren).
    hmr: process.env.HMR === 'off' ? false : undefined,
    ws: process.env.HMR === 'off' ? false : undefined,
    host: webHost,
    port: webPort,
    strictPort: true,
    proxy: {
      [`${basePath}/api`]: {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: false,
        agent: keepAlive,
        // Echte Geräte-Adresse mitgeben (X-Forwarded-For), sonst teilen sich alle Geräte die Login-Bremse von 127.0.0.1.
        xfwd: true,
      },
      [`^${escapeRe(managerPrefix)}(?=/|\\?|$)`]: {
        target: `http://127.0.0.1:${managerPort}`,
        changeOrigin: true, // Host = 127.0.0.1:<Port>, sonst lehnt der Manager ab
        agent: keepAlive,
        rewrite: (p) => {
          const rest = p.slice(managerPrefix.length);
          return rest.startsWith('/') ? rest : `/${rest}`;
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            proxyReq.setHeader('x-mosaik3lab-manager', managerPrefix);
            proxyReq.setHeader('x-forwarded-host', req.headers.host ?? '');
            proxyReq.setHeader('x-forwarded-proto', 'http');
            proxyReq.setHeader('x-forwarded-for', (req.socket.remoteAddress ?? '').replace(/^::ffff:/, ''));
          });
          // Manager aus: verständliche Seite statt leerem „500“ (wie das Portal im Betrieb). Läuft vor Vites eigener Behandlung.
          proxy.on('error', (_err, _req, res) => {
            if (!('writeHead' in res) || res.headersSent) return;
            res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(
              '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Server-Manager</title>' +
                '<body style="font:18px/1.5 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem"><h1>Der Server-Manager antwortet gerade nicht.</h1>' +
                `<p>Er läuft vermutlich nicht (erwartet auf 127.0.0.1:${managerPort}). Am Server starten: <code>npm run manager</code>.</p></body></html>`,
            );
          });
        },
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
}));
