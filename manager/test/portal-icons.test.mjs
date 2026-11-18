// Portal: feste Icon-Adressen an der Wurzel (/apple-touch-icon.png, /favicon.ico) gehen an die App unter /<pfad>/…
// Reiner Test: nur zwei kleine HTTP-Server auf 127.0.0.1 (Portal-Handler + Schein-App), keine Installation, keine Dateien.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { handleRequest } from '../lib/portalserver.mjs';
import { freePort, retryConnect } from './helpers/net.mjs';

const seen = [];
const app = http.createServer((req, res) => {
  seen.push({ url: req.url, manager: req.headers['x-mosaik3lab-manager'] });
  res.writeHead(200, { 'Content-Type': req.url.endsWith('.ico') ? 'image/x-icon' : 'image/png' });
  res.end('bild');
});
const appPort = await freePort();
await new Promise((r) => app.listen(appPort, '127.0.0.1', r));
const portal = http.createServer((req, res) => handleRequest(req, res, { basePath: '/mosaik3lab', appPort, scheme: 'http', certInfo: null }));
const portalPort = await freePort();
await new Promise((r) => portal.listen(portalPort, '127.0.0.1', r));
const agent = new http.Agent({ keepAlive: true });
after(() => {
  agent.destroy();
  portal.close();
  app.close();
});

const get = (p, method = 'GET') =>
  retryConnect(
    () =>
      new Promise((resolve, reject) => {
        const r = http.request({ host: '127.0.0.1', port: portalPort, path: p, method, agent }, (res) => {
          res.resume();
          res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] ?? '' }));
        });
        r.on('error', reject);
        r.end();
      }),
  );

test('Wurzel-Icons gehen an die App unter dem Basis-Pfad (ohne Manager-Kopf)', async () => {
  for (const p of ['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/apple-touch-icon-180x180.png', '/favicon.ico']) {
    seen.length = 0;
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.type, /^image\//, p);
    assert.deepEqual(seen, [{ url: `/mosaik3lab${p}`, manager: undefined }], p);
  }
  assert.equal((await get('/favicon.ico', 'HEAD')).status, 200);
});

test('Andere Wurzel-Adressen bleiben 404, POST auf Icons wird nicht weitergeleitet', async () => {
  seen.length = 0;
  for (const p of ['/apple-touch-icon.png.bak', '/x/apple-touch-icon.png', '/favicon.png']) assert.equal((await get(p)).status, 404, p);
  assert.equal((await get('/favicon.ico', 'POST')).status, 404);
  assert.deepEqual(seen, []);
});
