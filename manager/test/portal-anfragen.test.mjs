// Portal: unlesbare Anfragezeilen („GET //“, Backslash, „http://[“) dürfen den Dienst nicht beenden – früher warf new URL()
// und die unbehandelte Ausnahme stoppte das Portal (einziger Zugang von außen). Dazu: <pfad>/manager// erreicht den Manager
// als „/“ (nie als „//“, das der Manager nicht lesen kann) und die HTTPS-Umleitung übersteht dieselben Anfragen.
// Reiner Test: kleine HTTP-Server auf 127.0.0.1 (Portal + Schein-App + Schein-Manager), keine Installation, keine Dateien.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { startPortal, redirectToHttps } from '../lib/portalserver.mjs';
import { freePort, retryConnect } from './helpers/net.mjs';

const gesehen = { app: [], manager: [] };
const schein = (name) => http.createServer((req, res) => {
  gesehen[name].push({ url: req.url, kopf: req.headers['x-mosaik3lab-manager'] });
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(name);
});
const starte = async (server) => {
  const port = await freePort();
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return port;
};
const app = schein('app');
const manager = schein('manager');
const appPort = await starte(app);
const managerPort = await starte(manager);
const httpPort = await freePort();
const portal = await startPortal({ host: '127.0.0.1', httpPort, httpsPort: 0, tls: null, basePath: '/mosaik3lab', appPort, managerPort, certInfo: null });
const umleitung = http.createServer((req, res) => redirectToHttps(req, res, { httpsPort: 8443, basePath: '/mosaik3lab', appPort, certInfo: null }));
const umleitungPort = await starte(umleitung);
after(async () => {
  await portal.close();
  for (const s of [app, manager, umleitung]) s.close();
});

/** Anfragezeile unverändert senden (http.request würde manche Adressen selbst ablehnen). → { status, location, text } */
const roh = (port, ziel, methode = 'GET') =>
  retryConnect(
    () =>
      new Promise((resolve, reject) => {
        const s = net.connect(port, '127.0.0.1');
        let text = '';
        s.setEncoding('utf8');
        s.setTimeout(5000, () => s.destroy(new Error(`keine Antwort auf „${ziel}“`))); // ohne die Korrektur bliebe die Anfrage unbeantwortet
        s.on('connect', () => s.write(`${methode} ${ziel} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`));
        s.on('data', (c) => (text += c));
        s.on('close', () => resolve({ status: Number(/^HTTP\/1\.1 (\d{3})/.exec(text)?.[1] ?? 0), location: /^location: (.*)$/im.exec(text)?.[1]?.trim(), text }));
        s.on('error', reject);
      }),
  );

const UNLESBAR = ['//', '//[', 'http://[', `/${String.fromCharCode(92)}`, '//:80', '//x:99999/'];

test('Unlesbare Anfragezeilen: 400 statt Absturz – das Portal antwortet danach weiter', async () => {
  for (const ziel of UNLESBAR) {
    const r = await roh(httpPort, ziel);
    assert.equal(r.status, 400, `${ziel} → ${r.text.slice(0, 80)}`);
    assert.match(r.text, /Diese Adresse ist ungültig/, ziel);
  }
  assert.deepEqual(gesehen.app, [], 'nichts davon erreicht die App');
  assert.deepEqual(gesehen.manager, [], 'nichts davon erreicht den Manager');
  // danach läuft alles wie vorher
  const start = await roh(httpPort, '/?x=1');
  assert.equal(start.status, 302);
  assert.equal(start.location, '/mosaik3lab/?x=1');
  assert.equal((await roh(httpPort, '/mosaik3lab/api/health')).status, 200);
  assert.deepEqual(gesehen.app, [{ url: '/mosaik3lab/api/health', kopf: undefined }]);
});

test('Server-Manager über das Portal: mehrere Schrägstriche werden zu einem, der Manager-Kopf ist immer gesetzt', async () => {
  for (const [ziel, erwartet] of [['/mosaik3lab/manager//', '/'], ['/mosaik3lab/manager///api/auth?x=1', '/api/auth?x=1'], ['/mosaik3lab/manager', '/'], ['/mosaik3lab/manager/api/status', '/api/status']]) {
    gesehen.manager.length = 0;
    const r = await roh(httpPort, ziel);
    assert.equal(r.status, 200, ziel);
    assert.deepEqual(gesehen.manager, [{ url: erwartet, kopf: '/mosaik3lab/manager' }], ziel);
  }
  // „//mosaik3lab/manager/…“ ist für URL() ein Rechnername – das führt nie zum Manager
  gesehen.manager.length = 0;
  assert.equal((await roh(httpPort, '//mosaik3lab/manager/api/auth')).status, 404);
  assert.deepEqual(gesehen.manager, []);
});

test('Wurzel-Icons: Pfad-Tricks und andere Methoden werden nicht weitergeleitet, die Adresse geht nur an die App', async () => {
  gesehen.app.length = 0;
  gesehen.manager.length = 0;
  const tricks = ['/apple-touch-icon..%2f.png', '/apple-touch-icon.png/..%2fmanager', '/apple-touch-icon.png%2f..%2fmosaik3lab%2fmanager', '/favicon.ico%00', '/favicon.ico/', '/APPLE-TOUCH-ICON.PNG', '/apple-touch-icon-1x.png', '/apple-touch-icon.png;x'];
  for (const ziel of tricks) assert.equal((await roh(httpPort, ziel)).status, 404, ziel);
  for (const methode of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) assert.equal((await roh(httpPort, '/favicon.ico', methode)).status, 404, methode);
  assert.deepEqual(gesehen.app, [], 'nichts davon erreicht die App');
  // „/x/../favicon.ico“ ist dieselbe Adresse wie „/favicon.ico“ – weitergeleitet wird die bereinigte, mit Abfrage
  assert.equal((await roh(httpPort, '/x/../favicon.ico?v=2')).status, 200);
  assert.equal((await roh(httpPort, '/apple-touch-icon.png', 'HEAD')).status, 200);
  assert.deepEqual(gesehen.app.map((g) => g.url), ['/mosaik3lab/favicon.ico?v=2', '/mosaik3lab/apple-touch-icon.png']);
  assert.deepEqual(gesehen.manager, [], 'nie der Manager');
});

test('HTTPS-Umleitung: unlesbare Anfragezeilen 400, alles andere weiter auf https', async () => {
  for (const ziel of UNLESBAR) assert.equal((await roh(umleitungPort, ziel)).status, 400, ziel);
  const r = await roh(umleitungPort, '/mosaik3lab/teile?x=1');
  assert.equal(r.status, 301);
  assert.equal(r.location, 'https://127.0.0.1:8443/mosaik3lab/teile?x=1');
});
