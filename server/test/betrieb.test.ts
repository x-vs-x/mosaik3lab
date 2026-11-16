// Betrieb: Produktivmodus (Demo-Zugänge, Rate-Limit), Basis-Pfad, Portal-Anbindung (HTTPS), HTTP im LAN.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { Client, mail, pw, SCHOOL, startServer, TEACHER } from './helfer';
const prod = await startServer({ allowDemoAccounts: false, seedDemoData: true });
test('Demo-Zugänge sind gesperrt, wenn deaktiviert', async () => {
  const c = new Client(prod.base);
  assert.equal((await c.identify(mail('admin'))).json.result, 'password');
  assert.equal((await c.login(mail('admin'), pw('admin'))).status, 403);
  const health = await c.req('GET', '/api/health');
  assert.equal(health.json.demoAccountsEnabled, false);
});
test('Bekannte Lehrkraft meldet sich auch im Produktivmodus an', async () => {
  const c = new Client(prod.base);
  assert.equal((await c.identify(TEACHER)).json.result, 'signed-in');
});
test('Rate-Limit greift auch beim E-Mail-Schritt', async () => {
  const c = new Client(prod.base);
  let last = 0;
  for (let i = 0; i < 70 && last !== 429; i++) last = (await c.identify(`probe${i}@${SCHOOL}`)).status;
  assert.equal(last, 429);
});
after(() => prod.stop());

test('Demo-Regel wie im Server-Manager: Entwicklung erlaubt, installiert nur mit Schalter', () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, DISABLE_DEMO_ACCOUNTS: process.env.DISABLE_DEMO_ACCOUNTS };
  const demo = (nodeEnv: string | undefined, disable: string | undefined) => {
    for (const [k, v] of Object.entries({ NODE_ENV: nodeEnv, DISABLE_DEMO_ACCOUNTS: disable })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return loadConfig({ storageDir: os.tmpdir() }).allowDemoAccounts;
  };
  try {
    assert.equal(demo(undefined, undefined), true, 'Entwicklung');
    assert.equal(demo(undefined, 'true'), false, 'Entwicklung, abgeschaltet');
    assert.equal(demo('production', undefined), false, 'installiert ohne Angabe');
    assert.equal(demo('production', 'true'), false, 'installiert, Schalter aus');
    assert.equal(demo('production', 'false'), true, 'installiert, Schalter „Demo-Konten“ an (manager/runners/webapp.mjs)');
  } finally {
    demo(saved.NODE_ENV, saved.DISABLE_DEMO_ACCOUNTS);
  }
});

const fakeDist = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-dist-'));
await fs.mkdir(path.join(fakeDist, 'assets'), { recursive: true });
await fs.writeFile(path.join(fakeDist, 'index.html'), '<!doctype html><html><head><base href="/" /><link rel="icon" href="./favicon.svg" /></head><body><div id="root"></div><script type="module" src="./assets/a.js"></script></body></html>');
await fs.writeFile(path.join(fakeDist, 'assets', 'a.js'), 'console.log(1)');
const noRedirect = (url: string, headers: Record<string, string> = {}) => fetch(url, { redirect: 'manual', headers });
test('Ohne Basis-Pfad: App unter /, keine HTTPS-Anweisungen im LAN (W1), kein HSTS', async () => {
  const plain = await startServer({ allowDemoAccounts: true, seedDemoData: false, clientDistDir: fakeDist });
  try {
    const page = await noRedirect(`${plain.base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<base href="\/" \/>/);
    const csp = page.headers.get('content-security-policy') ?? '';
    assert.ok(csp.includes("default-src 'self'"), csp);
    assert.ok(!csp.includes('upgrade-insecure-requests'), 'bricht sonst http://<IP> im Schulnetz');
    assert.equal(page.headers.get('strict-transport-security'), null);
    assert.equal((await noRedirect(`${plain.base}/api/health`)).status, 200);
    assert.equal((await noRedirect(`${plain.base}/verwaltung/artikel`)).status, 200, 'Seiten der App (Router-Pfade) liefern die Startseite');
    assert.equal((await noRedirect(`${plain.base}/assets/a.js`)).status, 200);
    assert.equal((await noRedirect(`${plain.base}/assets/alt-vor-update.js`)).status, 404, 'fehlende Programmdatei nicht als Startseite');
  } finally {
    await plain.stop();
  }
});
test('Aufruf über die LAN-IP (nicht nur localhost): Seite, API und Anmeldung funktionieren über http://<IP>', async () => {
  const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  if (!lan) return; // Rechner ohne Netzwerk-Adresse
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-test-'));
  const config = loadConfig({ storageDir, rootDir: storageDir, logRequests: false, clientDistDir: fakeDist, allowDemoAccounts: true, seedDemoData: true });
  const inst = await createApp(config);
  const server = inst.app.listen(0, '0.0.0.0');
  await new Promise((r) => server.once('listening', r));
  try {
    const base = `http://${lan}:${(server.address() as AddressInfo).port}`;
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.ok(!(page.headers.get('content-security-policy') ?? '').includes('upgrade-insecure-requests'));
    const c = new Client(base);
    assert.equal((await c.login(mail('admin'), pw('admin'))).status, 200);
    assert.equal((await c.req('GET', '/api/auth/me')).status, 200);
  } finally {
    await new Promise((r) => server.close(r));
    await inst.close();
    await fs.rm(storageDir, { recursive: true, force: true });
  }
});
test('Mit Basis-Pfad /mosaik3lab: alles darunter, Cookie-Pfad, Weiterleitungen', async () => {
  const sub = await startServer({ allowDemoAccounts: true, seedDemoData: true, clientDistDir: fakeDist, basePath: '/mosaik3lab' });
  try {
    const slash = await noRedirect(`${sub.base}/mosaik3lab?x=1`);
    assert.equal(slash.status, 301);
    assert.equal(slash.headers.get('location'), '/mosaik3lab/?x=1');
    const root = await noRedirect(`${sub.base}/`);
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/mosaik3lab/');
    const page = await noRedirect(`${sub.base}/mosaik3lab/`);
    assert.match(await page.text(), /<base href="\/mosaik3lab\/" \/>/);
    assert.match(await (await noRedirect(`${sub.base}/mosaik3lab/verwaltung/artikel`)).text(), /<base href="\/mosaik3lab\/" \/>/, 'Router-Pfade unter dem Basis-Pfad');
    assert.equal((await noRedirect(`${sub.base}/mosaik3lab/assets/a.js`)).status, 200);
    assert.equal((await noRedirect(`${sub.base}/mosaik3lab/api/health`)).status, 200);
    assert.equal((await noRedirect(`${sub.base}/api/health`)).status, 404, 'API nur unter dem Basis-Pfad');
    const c = new Client(`${sub.base}/mosaik3lab`);
    assert.equal((await c.login(mail('admin'), pw('admin'))).status, 200);
    assert.equal((await c.req('GET', '/api/auth/me')).status, 200);
    const raw = await fetch(`${sub.base}/mosaik3lab/api/auth/identify`, { method: 'POST', headers: { 'X-Requested-With': 'mosaik3lab', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: mail('admin') }) });
    assert.equal(raw.status, 200);
    const login = await fetch(`${sub.base}/mosaik3lab/api/auth/login`, { method: 'POST', headers: { 'X-Requested-With': 'mosaik3lab', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: mail('admin'), password: pw('admin') }) });
    assert.match(login.headers.get('set-cookie') ?? '', /Path=\/mosaik3lab/, 'Cookie gilt nur unter dem Basis-Pfad');
    assert.ok(!/;\s*Secure/i.test(login.headers.get('set-cookie') ?? ''), 'ohne HTTPS kein Secure-Cookie');
  } finally {
    await sub.stop();
  }
});
test('Hinter dem Portal über HTTPS: Cookie „Secure“ (X-Forwarded-Proto nur von localhost), HSTS und upgrade-insecure-requests', async () => {
  const https = await startServer({ allowDemoAccounts: true, seedDemoData: true, clientDistDir: fakeDist, basePath: '/mosaik3lab', https: true });
  try {
    const login = await fetch(`${https.base}/mosaik3lab/api/auth/login`, { method: 'POST', headers: { 'X-Requested-With': 'mosaik3lab', 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' }, body: JSON.stringify({ email: mail('admin'), password: pw('admin') }) });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie') ?? '', /;\s*Secure/i);
    const page = await fetch(`${https.base}/mosaik3lab/`);
    assert.match(page.headers.get('content-security-policy') ?? '', /upgrade-insecure-requests/);
    assert.match(page.headers.get('strict-transport-security') ?? '', /max-age=/);
  } finally {
    await https.stop();
  }
});
after(() => fs.rm(fakeDist, { recursive: true, force: true }));
