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
import { writeBereich } from '../lib/settingsdb.mjs';
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
  if ((q.headers.cookie ?? '').includes('app=stoerung')) {
    s.statusCode = 503; // App startet gerade (z. B. Datenbank noch gesperrt)
    return s.end('{}');
  }
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
  add.run('1', 'chef@schule.example', hash, 'admin', 1, 0);
  add.run('2', 'team@schule.example', hash, 'druckteam', 1, 0);
  add.run('3', 'alt@schule.example', hash, 'admin', 0, 0);
  add.run('4', 'demo@schule.example', hash, 'admin', 1, 1);
  db.close();
}

before(async () => {
  [appPort, managerPort, portalPort] = [await freePort(), await freePort(), await freePort()];
  await new Promise((r) => app.listen(appPort, '127.0.0.1', r));
  seedUsers();
  const configFile = path.join(tmp, 'mosaik3lab.json');
  fs.writeFileSync(configFile, JSON.stringify({ dataDir: path.join(tmp, 'storage'), managerPort }));
  writeBereich(DB, 'betrieb', { 'app.port': appPort, 'portal.enabled': true, 'portal.basePath': '/mosaik3lab', 'portal.httpPort': portalPort, 'portal.httpsPort': await freePort(), 'paths.backupDir': path.join(tmp, 'backups'), 'paths.logDir': path.join(tmp, 'logs') });
  proc = spawn(process.execPath, [path.join(MANAGER, 'server.mjs')], { env: { ...process.env, MANAGER_CONFIG: configFile, MOSAIK3LAB_QUIET: '1', MOSAIK3LAB_NO_AUTOMATION: '1', DISABLE_DEMO_ACCOUNTS: 'true', MOSAIK3LAB_SYSTEM_DRY_RUN: path.join(tmp, 'system.json') }, stdio: 'ignore', windowsHide: true });
  // Start dauert auf langsamen Rechnern (Windows-Runner) teils über 10 s: bis zu 60 s warten, sofort weiter, sobald er antwortet
  for (const ende = Date.now() + 60_000; !token && Date.now() < ende && proc.exitCode === null; ) {
    await sleep(250);
    token = await direct('GET', '/').then((r) => /name="csrf-token" content="([a-f0-9]+)"/.exec(r.text)?.[1], () => null);
  }
  assert.ok(token, `Manager gestartet${proc.exitCode === null ? '' : ` (beendet mit Code ${proc.exitCode})`}`);
  portal = await startPortal({ host: '127.0.0.1', httpPort: portalPort, httpsPort: 0, tls: null, basePath: '/mosaik3lab', appPort, managerPort, certInfo: null });
});

after(async () => {
  await portal?.close();
  proc?.kill();
  app.close();
  await sleep(500);
  fs.rmSync(tmp, { recursive: true, force: true });
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
  assert.equal((await remotePost('/api/auth/login', { email: 'chef@schule.example', password: PW }, cookie)).status, 400, 'keine eigene Anmeldung über das Netz');
  // CSRF: Token und Origin
  assert.equal((await remotePost('/api/backup/password', {}, cookie, { 'X-Manager-Token': 'falsch' })).status, 403);
  assert.equal((await remotePost('/api/backup/password', {}, cookie, { Origin: 'http://evil.example' })).status, 403);
  // App-Sitzung weg → sofort kein Zugang mehr
  assert.equal((await viaPortal('GET', '/api/status')).status, 403);
});

test('Kaputte Adresse („//“) und zu große Anfrage beenden den Manager nicht und werden verständlich abgelehnt', async () => {
  // „//“ ist keine gültige Adresse – früher endete der Manager daran (unbehandelter Fehler vor jeder Prüfung)
  for (const p of ['//', '//[', '//?x=1']) assert.equal((await direct('GET', p)).status, 400, p);
  assert.equal((await direct('GET', '/api/auth')).status, 200, 'Manager läuft weiter');
  // Pfad-Tricks bei den Dateien der Oberfläche: nur die feste Liste wird ausgeliefert
  for (const p of ['/../server.mjs', '/%2e%2e/server.mjs', '/..%2fserver.mjs', '/app.js/../../server.mjs', '/lib/auth.mjs']) {
    const r = await direct('GET', p);
    assert.equal(r.status, 404, p);
    assert.ok(!r.text.includes('Hintergrundaufträge'), `${p}: kein Quelltext des Servers`);
  }
  // Zu groß (> 400 KB): saubere Antwort 413 statt gekappter Verbindung („Manager antwortet nicht“)
  const big = await direct('POST', '/api/auth/login', { body: { email: 'x'.repeat(500 * 1024) }, headers: { 'X-Manager-Token': token } });
  assert.equal(big.status, 413);
  assert.match(big.json.error, /zu groß/);
  assert.equal((await direct('GET', '/api/auth')).status, 200);
});

test('Sichern/Wiederherstellen nie doppelt: zweiter Aufruf während eines laufenden → 409, danach wieder frei', async () => {
  const cookie = 'app=admin';
  // zwei Fenster / Doppelklick: beide Anfragen fast gleichzeitig – genau eine läuft, die andere wird klar abgelehnt
  const [a, b] = await Promise.all([remotePost('/api/backup', {}, cookie), remotePost('/api/backup', {}, cookie)]);
  const abgelehnt = [a, b].filter((r) => r.status === 409);
  assert.equal(abgelehnt.length, 1, `${a.status} ${a.text} / ${b.status} ${b.text}`);
  assert.match(abgelehnt[0].json.error, /läuft schon eine Sicherung/);
  // auch eine Wiederherstellung startet währenddessen nicht – geprüft wird die Sperre vor allem anderen
  const frei = await remotePost('/api/backup/restore', { id: 'gibt-es-nicht', confirm: 'gibt-es-nicht' }, cookie);
  assert.notEqual(frei.status, 409, 'nach dem Ende wieder frei');
  assert.equal((await viaPortal('GET', '/api/status', { headers: { Cookie: cookie } })).json.dataJob, null);
});

test('Über die App-Adresse, die Web-App antwortet nicht (gestoppt, startet neu): 503 „app-down“ statt „Nur für Administratoren“', async () => {
  // Serverfehler der App: Anmeldung nicht prüfbar – kein Zugang, aber als „antwortet gerade nicht“ erkennbar
  const api = await viaPortal('GET', '/api/status', { headers: { Cookie: 'app=admin; app=stoerung' } });
  assert.equal(api.status, 503);
  assert.equal(api.json.code, 'app-down');
  assert.ok(!api.json.summary, 'kein Inhalt ohne geprüfte Anmeldung');
  assert.ok(api.json.hint.includes(`127.0.0.1:${managerPort}`), 'nennt den Notzugang');
  const post = await remotePost('/api/backup/password', { generate: true }, 'app=admin; app=stoerung');
  assert.equal(post.status, 503, 'auch Aktionen: nichts ohne geprüfte Anmeldung');
  const page = await viaPortal('GET', '/', { headers: { Cookie: 'app=admin; app=stoerung' } });
  assert.equal(page.status, 503);
  assert.match(page.text, /antwortet gerade nicht/);
  assert.match(page.text, /http-equiv="refresh"/, 'Seite versucht es von selbst wieder');
  assert.ok(!page.text.includes('csrf-token'), 'keine Manager-Seite');
  // ohne Cookie bleibt es bei „nicht angemeldet“ (dafür wird die App gar nicht gefragt)
  assert.equal((await viaPortal('GET', '/api/status')).json.code, 'app-admin');
});

test('Direkt am Server: Anmeldung mit dem Admin-Konto der App; andere Konten nicht; Sperre nach 5 Fehlversuchen', async () => {
  assert.equal((await direct('GET', '/api/status')).status, 401);
  for (const [email, why] of [['team@schule.example', 'Druck-Team'], ['alt@schule.example', 'deaktiviert'], ['demo@schule.example', 'Demo-Konto (nicht erlaubt)'], ['niemand@schule.example', 'unbekannt']]) {
    assert.equal((await login(email, PW)).status, 401, why);
  }
  const ok = await login('CHEF@schule.example ', PW);
  assert.equal(ok.status, 200, ok.text);
  assert.match(ok.headers['set-cookie'][0], /HttpOnly; SameSite=Strict; Path=\//);
  assert.equal((await direct('GET', '/api/status', { headers: { Cookie: sid(ok) } })).status, 200);
  assert.equal((await viaPortal('GET', '/api/status', { headers: { Cookie: sid(ok) } })).status, 403, 'Manager-Sitzung gilt nicht über das Netz');

  for (let i = 0; i < 5; i++) assert.equal((await login('chef@schule.example', 'falsch-falsch')).status, 401);
  const locked = await login('chef@schule.example', PW);
  assert.equal(locked.status, 429, 'gesperrt, auch mit richtigem Passwort');
  assert.match(locked.json.error, /warten/);
});

test('Über die App-Adresse bei gestoppter Web-App (nichts hört auf dem Port): ebenfalls 503 „app-down“', async () => {
  app.closeAllConnections?.();
  await new Promise((r) => app.close(r));
  const r = await viaPortal('GET', '/api/status', { headers: { Cookie: 'app=admin' } });
  assert.equal(r.status, 503);
  assert.equal(r.json.code, 'app-down');
  assert.equal((await viaPortal('GET', '/api/status', { headers: { Cookie: 'app=team' } })).status, 503, 'auch hier kein Zugang');
});
