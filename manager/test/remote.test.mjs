// Anmeldung am Server-Manager = Admin-Konto der App.
//   - über die App-Adresse (/mosaik3lab/manager, Portal → Manager): Admin-Sitzung der App genügt, sonst 403
//   - direkt am Server: E-Mail + Passwort eines aktiven Administrators aus der Tabelle „benutzer“, Login-Bremse
//   - altes Manager-Passwort / Schalter „Über die App-Adresse“ werden aus der Datenbank entfernt
// Die App ist eine Attrappe, die GET /mosaik3lab/api/auth/me wie die echte App beantwortet ({ user: { role } | null }).
// Alles auf freien Ports; Testdaten unter C:\Entwicklung\_testdaten\server-manager\ (werden danach gelöscht).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { startPortal } from '../lib/portalserver.mjs';
import { readBereich, writeBereich } from '../lib/settingsdb.mjs';
import { freePort, retryConnect } from './helpers/net.mjs';

const MANAGER = path.resolve(import.meta.dirname, '..');
const TESTROOT = path.resolve(MANAGER, '..', '..', '_testdaten', 'server-manager');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'remote-')));
const DB = path.join(tmp, 'storage', 'mosaik3lab.db');
const PW = 'Admin-Test-2026';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** HTTP-Anfrage mit frei wählbaren Köpfen. → { status, headers, text, json } */
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

// ---------- App-Attrappe: /api/auth/me je nach Cookie; /echo zeigt, was bei der App ankommt ----------
const ROLES = { 'app=admin': 'admin', 'app=team': 'druckteam', 'app=lehrkraft': 'lehrkraft' };
let appPort, managerPort, portalPort, proc, token, portal;
const app = http.createServer((q, s) => {
  const p = new URL(q.url, 'http://x').pathname;
  s.setHeader('Content-Type', 'application/json');
  if (p === '/mosaik3lab/api/auth/me') {
    const role = Object.entries(ROLES).find(([c]) => (q.headers.cookie ?? '').split(/;\s*/).includes(c))?.[1];
    return s.end(JSON.stringify(role ? { user: { role }, permissions: [] } : { user: null, permissions: [] }));
  }
  if (p === '/mosaik3lab/echo') return s.end(JSON.stringify({ headers: q.headers }));
  s.statusCode = 404;
  s.end('{}');
});

const direct = (method, p, opts) => request(managerPort, method, p, { ...opts, headers: { Host: `127.0.0.1:${managerPort}`, ...opts?.headers } });
const login = (email, password) => direct('POST', '/api/auth/login', { body: { email, password }, headers: { 'X-Manager-Token': token } });
const viaPortal = (method, p, opts) => request(portalPort, method, `/mosaik3lab/manager${p}`, { ...opts, headers: { Host: `127.0.0.1:${portalPort}`, ...opts?.headers } });
const remotePost = (p, body, cookie, headers = {}) => viaPortal('POST', p, { body, headers: { Cookie: cookie, 'X-Manager-Token': token, Origin: `http://127.0.0.1:${portalPort}`, ...headers } });
const sid = (res) => res.headers['set-cookie']?.[0]?.split(';')[0];

/** Benutzer wie in der App (Tabelle „benutzer“, bcrypt) – mit dem bcryptjs der App. */
function seedUsers() {
  const bcrypt = createRequire(path.join(MANAGER, '..', 'server', 'package.json'))('bcryptjs');
  fs.mkdirSync(path.dirname(DB), { recursive: true });
  const db = new DatabaseSync(DB);
  db.exec('CREATE TABLE benutzer (id TEXT PRIMARY KEY, email TEXT, passwort_hash TEXT, rolle TEXT, aktiv INTEGER, ist_demo INTEGER)');
  const add = db.prepare('INSERT INTO benutzer VALUES (?, ?, ?, ?, ?, ?)');
  const hash = bcrypt.hashSync(PW, 4);
  add.run('1', 'chef@schule.de', hash, 'admin', 1, 0);
  add.run('2', 'team@schule.de', hash, 'druckteam', 1, 0);
  add.run('3', 'alt@schule.de', hash, 'admin', 0, 0);
  add.run('4', 'demo@schule.de', hash, 'admin', 1, 1);
  db.close();
  // So sah es früher aus: eigenes Manager-Passwort, Schalter „Über die App-Adresse“
  writeBereich(DB, 'manager', { 'manager.passwordHash': 'scrypt$salz$hash', 'manager.remote': false });
}

before(async () => {
  [appPort, managerPort, portalPort] = [await freePort(), await freePort(), await freePort()];
  await new Promise((r) => app.listen(appPort, '127.0.0.1', r));
  seedUsers();
  const configFile = path.join(tmp, 'mosaik3lab.json');
  fs.writeFileSync(configFile, JSON.stringify({ dataDir: path.join(tmp, 'storage'), managerPort }));
  writeBereich(DB, 'betrieb', { 'app.port': appPort, 'portal.enabled': true, 'portal.basePath': '/mosaik3lab', 'portal.httpPort': portalPort, 'portal.httpsPort': await freePort(), 'paths.backupDir': path.join(tmp, 'backups'), 'paths.logDir': path.join(tmp, 'logs') });
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

test('Altes Manager-Passwort und Schalter „Über die App-Adresse“ sind aus der Datenbank entfernt', () => {
  const m = readBereich(DB, 'manager');
  assert.equal(m['manager.passwordHash'], undefined);
  assert.equal(m['manager.remote'], undefined);
});

test('Portal leitet /mosaik3lab/manager an den Manager weiter (Präfix ab, <base href>); direkt bleibt alles wie bisher', async () => {
  const local = await direct('GET', '/');
  assert.equal(local.status, 200);
  assert.match(local.text, /<base href="\/" \/>/);
  assert.deepEqual((await direct('GET', '/api/auth')).json, { loggedIn: false, remote: false, needsAdmin: false, managerPort });

  for (const p of ['', '/', '/?x=1']) {
    const page = await viaPortal('GET', p, { headers: { Cookie: 'app=admin' } });
    assert.equal(page.status, 200, `/mosaik3lab/manager${p}`);
    assert.match(page.text, /<base href="\/mosaik3lab\/manager\/" \/>/);
  }
  assert.equal((await viaPortal('GET', '/app.css', { headers: { Cookie: 'app=admin' } })).status, 200);
  // Ein vom Browser mitgeschickter Kopf wird überschrieben (Manager) bzw. entfernt (App)
  const forged = await viaPortal('GET', '/', { headers: { Cookie: 'app=admin', 'X-Mosaik3lab-Manager': '/boese/manager' } });
  assert.match(forged.text, /<base href="\/mosaik3lab\/manager\/" \/>/);
  const echo = await request(portalPort, 'GET', '/mosaik3lab/echo', { headers: { 'X-Mosaik3lab-Manager': '/mosaik3lab/manager' } });
  assert.equal(echo.json.headers['x-mosaik3lab-manager'], undefined, 'die App bekommt den Kopf nie');
  // Manager hört weiter nur auf 127.0.0.1 und prüft den Host-Kopf
  assert.equal((await direct('GET', '/api/auth', { headers: { Host: `evil.example:${managerPort}` } })).status, 403);
});

test('Über die App-Adresse ohne Admin-Sitzung der App (Lehrkraft, Druck-Team, keine) → 403', async () => {
  const page = await viaPortal('GET', '/');
  assert.equal(page.status, 403);
  assert.match(page.text, /Nur für Administratoren/);
  assert.ok(!page.text.includes('csrf-token'), 'keine Manager-Seite');
  for (const cookie of [undefined, 'app=team', 'app=lehrkraft', 'app=unbekannt']) {
    const r = await viaPortal('GET', '/api/status', { headers: cookie ? { Cookie: cookie } : {} });
    assert.equal(r.status, 403, cookie);
    assert.equal(r.json.code, 'app-admin');
  }
});

test('Über die App-Adresse mit Admin-Sitzung der App: direkt drin, keine zweite Anmeldung, alles erlaubt, CSRF bleibt', async () => {
  const cookie = 'app=admin';
  assert.deepEqual((await viaPortal('GET', '/api/auth', { headers: { Cookie: cookie } })).json, { loggedIn: true, remote: true, needsAdmin: false, managerPort });
  const st = await viaPortal('GET', '/api/status', { headers: { Cookie: cookie } });
  assert.equal(st.status, 200);
  assert.ok(st.json.summary);
  assert.equal((await viaPortal('GET', '/api/settings', { headers: { Cookie: cookie } })).json.managerPort, managerPort);
  // früher „nur direkt am Server“ – jetzt auch über die App-Adresse (die Oberfläche fragt vorher nach)
  const stop = await remotePost('/api/services/webapp/stop', {}, cookie);
  assert.equal(stop.status, 200, stop.text);
  assert.equal((await remotePost('/api/auth/login', { email: 'chef@schule.de', password: PW }, cookie)).status, 400, 'keine eigene Anmeldung über das Netz');
  // CSRF: Token und Origin
  assert.equal((await remotePost('/api/backup/password', {}, cookie, { 'X-Manager-Token': 'falsch' })).status, 403);
  assert.equal((await remotePost('/api/backup/password', {}, cookie, { Origin: 'http://evil.example' })).status, 403);
  // App-Sitzung weg → sofort kein Zugang mehr
  assert.equal((await viaPortal('GET', '/api/status')).status, 403);
});

test('Direkt am Server: Anmeldung mit dem Admin-Konto der App; andere Konten nicht; Sperre nach 5 Fehlversuchen', async () => {
  assert.equal((await direct('GET', '/api/status')).status, 401);
  for (const [email, why] of [['team@schule.de', 'Druck-Team'], ['alt@schule.de', 'deaktiviert'], ['demo@schule.de', 'Demo-Konto (nicht erlaubt)'], ['niemand@schule.de', 'unbekannt']]) {
    assert.equal((await login(email, PW)).status, 401, why);
  }
  const ok = await login('CHEF@schule.de ', PW);
  assert.equal(ok.status, 200, ok.text);
  assert.match(ok.headers['set-cookie'][0], /HttpOnly; SameSite=Strict; Path=\//);
  assert.equal((await direct('GET', '/api/status', { headers: { Cookie: sid(ok) } })).status, 200);
  assert.equal((await viaPortal('GET', '/api/status', { headers: { Cookie: sid(ok) } })).status, 403, 'Manager-Sitzung gilt nicht über das Netz');

  for (let i = 0; i < 5; i++) assert.equal((await login('chef@schule.de', 'falsch-falsch')).status, 401);
  const locked = await login('chef@schule.de', PW);
  assert.equal(locked.status, 429, 'gesperrt, auch mit richtigem Passwort');
  assert.match(locked.json.error, /warten/);
});
