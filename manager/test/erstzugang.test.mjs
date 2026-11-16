// Ersteinrichtung über das Schulnetz (direkt nach der Installation, noch kein Administrator):
//   - über die App-Adresse (/mosaik3lab/manager, Portal → Manager) sind nur Seite, Anmeldestatus und „ersten
//     Administrator anlegen“ erreichbar – alles andere 403 (code „setup“)
//   - Anlegen über das Netz und direkt am Server ohne weiteren Code (seit 1.1.4); CSRF-Schutz bleibt
//   - die Adressen dafür gibt es nur direkt am Server (GET /api/auth/erstzugang, für den Installer / cli.mjs erstzugang)
//   - danach gilt wieder: über das Netz nur mit Admin-Sitzung der App (wie remote.test.mjs)
// Echte App-Skripte (create-admin über tsx), Systemaktionen nur im Probelauf (MOSAIK3LAB_SYSTEM_DRY_RUN) –
// keine echten Dienste. Freie Ports; Testdaten unter C:\Entwicklung\_testdaten\server-manager\ (werden gelöscht).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { startPortal } from '../lib/portalserver.mjs';
import { writeBereich } from '../lib/settingsdb.mjs';
import { freePort, retryConnect } from './helpers/net.mjs';

const MANAGER = path.resolve(import.meta.dirname, '..');
const TESTROOT = path.resolve(MANAGER, '..', '..', '_testdaten', 'server-manager');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'erstzugang-')));
const STORAGE = path.join(tmp, 'storage');
const DB = path.join(STORAGE, 'mosaik3lab.db');
const ALTCODE = path.join(tmp, 'logs', 'einrichtungscode.txt'); // Rest aus Versionen bis 1.1.3
const ADMIN = { email: 'chefin@schule.de', name: 'Chefin', password: 'Erstzugang-2026' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** cli.mjs erstzugang wie am Ende der Installer → { code (Exit), out } */
const cli = (...args) => new Promise((resolve) => execFile(process.execPath, [path.join(MANAGER, 'cli.mjs'), 'erstzugang', '--port', String(managerPort), ...args], { env: { ...process.env, MANAGER_CONFIG: path.join(tmp, 'mosaik3lab.json') }, timeout: 90_000, windowsHide: true }, (err, out) => resolve({ code: err?.code ?? 0, out })));

const request = (...args) => retryConnect(() => request1(...args));
function request1(port, method, urlPath, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers: { ...(data && { 'Content-Type': 'application/json' }), ...headers } }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          /* HTML */
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    r.on('error', reject);
    r.end(data);
  });
}

// App-Attrappe: /api/auth/me – „app=admin“ gilt als Admin-Sitzung (wie in remote.test.mjs)
let appPort, managerPort, portalPort, proc, token, portal;
const app = http.createServer((q, s) => {
  s.setHeader('Content-Type', 'application/json');
  if (new URL(q.url, 'http://x').pathname === '/mosaik3lab/api/auth/me') {
    return s.end(JSON.stringify((q.headers.cookie ?? '').includes('app=admin') ? { user: { role: 'admin' }, permissions: [] } : { user: null, permissions: [] }));
  }
  s.statusCode = 404;
  s.end('{}');
});

const direct = (method, p, opts) => request(managerPort, method, p, { ...opts, headers: { Host: `127.0.0.1:${managerPort}`, ...opts?.headers } });
const viaPortal = (method, p, opts) => request(portalPort, method, `/mosaik3lab/manager${p}`, { ...opts, headers: { Host: `127.0.0.1:${portalPort}`, ...opts?.headers } });
const remotePost = (p, body, headers = {}) => viaPortal('POST', p, { body, headers: { 'X-Manager-Token': token, Origin: `http://127.0.0.1:${portalPort}`, ...headers } });

before(async () => {
  [appPort, managerPort, portalPort] = [await freePort(), await freePort(), await freePort()];
  await new Promise((r) => app.listen(appPort, '127.0.0.1', r));
  fs.mkdirSync(STORAGE, { recursive: true });
  const configFile = path.join(tmp, 'mosaik3lab.json');
  fs.writeFileSync(configFile, JSON.stringify({ dataDir: STORAGE, managerPort }));
  fs.mkdirSync(path.dirname(ALTCODE), { recursive: true });
  fs.writeFileSync(ALTCODE, 'ABCD-EFGH\n');
  // wie nach der Installation: Portal an, im Netzwerk – aber noch keine Konten (Tabelle „benutzer“ fehlt ganz)
  writeBereich(DB, 'betrieb', { 'app.port': appPort, 'app.network': true, 'portal.enabled': true, 'portal.basePath': '/mosaik3lab', 'portal.httpPort': portalPort, 'portal.httpsPort': await freePort(), 'paths.backupDir': path.join(tmp, 'backups'), 'paths.logDir': path.join(tmp, 'logs') });
  proc = spawn(process.execPath, [path.join(MANAGER, 'server.mjs')], { env: { ...process.env, MANAGER_CONFIG: configFile, MOSAIK3LAB_QUIET: '1', MOSAIK3LAB_NO_AUTOMATION: '1', DISABLE_DEMO_ACCOUNTS: 'true', MOSAIK3LAB_SYSTEM_DRY_RUN: path.join(tmp, 'system.json') }, stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 40 && !token; i++) {
    await sleep(250);
    token = await direct('GET', '/').then((r) => /name="csrf-token" content="([a-f0-9]+)"/.exec(r.text)?.[1], () => null);
  }
  assert.ok(token, 'Manager gestartet');
  portal = await startPortal({ host: '127.0.0.1', httpPort: portalPort, httpsPort: 0, tls: null, basePath: '/mosaik3lab', appPort, managerPort, certInfo: null });
});

after(async () => {
  await portal?.close();
  proc?.kill();
  app.close();
  await sleep(500);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('Noch kein Administrator: über das Netz nur die Einrichtung erreichbar', async () => {
  const st = await viaPortal('GET', '/api/auth');
  assert.equal(st.status, 200);
  assert.deepEqual(st.json, { loggedIn: false, remote: true, needsAdmin: true, appBase: '/mosaik3lab', managerPort });
  const page = await viaPortal('GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.text, /<base href="\/mosaik3lab\/manager\/" \/>/);
  assert.match(page.text, /first-email/);
  assert.doesNotMatch(page.text, /Einrichtungscode/);
  assert.equal(fs.existsSync(ALTCODE), false, 'alte Code-Datei beim Start entfernt');
  for (const f of ['/app.js', '/app.css', '/icon.svg', '/ui.js', '/update.js', '/neuigkeiten.js', '/erweitert.js', '/einstellungen.js']) assert.equal((await viaPortal('GET', f)).status, 200, f);
  for (const p of ['/api/status', '/api/settings', '/api/mail', '/api/logs', '/api/auth/erstzugang']) {
    const r = await viaPortal('GET', p);
    assert.equal(r.status, 403, p);
    assert.equal(r.json.code, 'setup', p);
  }
  assert.equal((await remotePost('/api/backup', {})).status, 403, 'keine Aktionen');
  assert.equal((await remotePost('/api/auth/login', { email: ADMIN.email, password: ADMIN.password })).status, 403);
  // Direkt am Server: wie bisher (ohne Anmeldung nichts außer Einrichtung)
  assert.deepEqual((await direct('GET', '/api/auth')).json, { loggedIn: false, remote: false, needsAdmin: true, managerPort });
  assert.equal((await direct('GET', '/api/status')).status, 401);
});

test('Adressen für die Ersteinrichtung: nur direkt am Server, so zeigt sie der Installer', async () => {
  const a = await direct('GET', '/api/auth/erstzugang');
  assert.equal(a.status, 200, a.text);
  assert.deepEqual(Object.keys(a.json).sort(), ['localUrl', 'managerUrls', 'publicNetwork'], 'nur Adressen – kein Einrichtungscode mehr');
  assert.ok(a.json.managerUrls.length > 0, 'Adressen im Netz');
  for (const u of a.json.managerUrls) assert.match(u, /\/mosaik3lab\/manager\/$/);
  assert.equal(a.json.localUrl, `http://127.0.0.1:${managerPort}/`);
  const shown = await cli();
  assert.equal(shown.code, 0, shown.out);
  assert.match(shown.out, /\/mosaik3lab\/manager\//);
  assert.doesNotMatch(shown.out, /EINRICHTUNGSCODE/);
});

test('Über das Netz anlegen: CSRF-Schutz bleibt', async () => {
  assert.equal((await remotePost('/api/auth/first', ADMIN, { 'X-Manager-Token': 'falsch' })).status, 403, 'CSRF-Token');
  assert.equal((await remotePost('/api/auth/first', ADMIN, { Origin: 'http://evil.example' })).status, 403, 'Origin');
  assert.equal((await viaPortal('GET', '/api/auth')).json.needsAdmin, true, 'kein Konto angelegt');
});

test('Über das Netz: Administrator angelegt; danach nur noch mit Admin-Sitzung der App', { timeout: 180_000 }, async () => {
  assert.equal((await remotePost('/api/auth/first', { ...ADMIN, password: 'kurz' })).status, 400, 'Passwort zu kurz');
  const r = await remotePost('/api/auth/first', ADMIN);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.headers['set-cookie'], undefined, 'keine Manager-Sitzung über das Netz – die App-Sitzung zählt');
  const db = new DatabaseSync(DB, { readOnly: true });
  const row = db.prepare("SELECT email, rolle, aktiv FROM benutzer WHERE rolle = 'admin'").get();
  db.close();
  assert.deepEqual({ ...row }, { email: ADMIN.email, rolle: 'admin', aktiv: 1 });
  assert.equal((await direct('GET', '/api/auth/erstzugang')).status, 404);
  assert.equal((await remotePost('/api/auth/first', { ...ADMIN, email: 'zwei@schule.de' })).status, 403, 'kein zweiter „erster“ Admin');
  assert.equal((await direct('POST', '/api/auth/first', { body: { ...ADMIN, email: 'drei@schule.de' }, headers: { 'X-Manager-Token': token } })).status, 400, 'auch direkt am Server kein zweiter');
  // ab jetzt wie immer: ohne App-Admin-Sitzung kein Zugang, mit ihr alles
  assert.equal((await viaPortal('GET', '/api/auth')).status, 403);
  assert.equal((await viaPortal('GET', '/')).status, 403);
  assert.deepEqual((await viaPortal('GET', '/api/auth', { headers: { Cookie: 'app=admin' } })).json, { loggedIn: true, remote: true, needsAdmin: false, managerPort });
  assert.equal((await viaPortal('GET', '/api/status', { headers: { Cookie: 'app=admin' } })).status, 200);
  // Installer bei einem Update (Administrator vorhanden): nur Hinweis
  const upd = await cli();
  assert.equal(upd.code, 0, upd.out);
  assert.match(upd.out, /bereits einen Administrator/);
  // direkt am Server: Anmeldung mit genau diesem Konto
  const login = await direct('POST', '/api/auth/login', { body: { email: ADMIN.email, password: ADMIN.password }, headers: { 'X-Manager-Token': token } });
  assert.equal(login.status, 200, login.text);
});
