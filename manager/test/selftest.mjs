// Selbsttest über die echte HTTP-API: startet den Manager auf einem freien Port mit Temp-Konfiguration und prüft
// Host-/CSRF-Schutz, ersten Administrator, Anmeldung mit dem Admin-Konto der App, Login-Bremse, Status, Einstellungen, Start/Stopp der Web-App
// (freier Port, Temp-Datenordner), Backup + Wiederherstellen. Räumt alles selbst auf.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { freePort, retryConnect } from './helpers/net.mjs';
import { einrichten } from './helpers/einrichtung.mjs';

// Testdaten liegen fest unter C:\Entwicklung\_testdaten\server-manager (nicht im Temp-Verzeichnis).
const TESTROOT = path.resolve(import.meta.dirname, '..', '..', '..', '_testdaten', 'server-manager');

const MANAGER = path.resolve(import.meta.dirname, '..');
const APP_PORT = await freePort(); // nie fest (parallele Läufe in anderen Arbeitskopien)
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'selftest-')));
let port, proc, token;
let cookie = '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const portFree = (p) => new Promise((resolve) => {
  const s = net.createServer().once('error', () => resolve(false)).listen(p, '127.0.0.1', () => s.close(() => resolve(true)));
});
/** HTTP-Anfrage mit frei wählbarem Host-Header (fetch erlaubt das nicht). */
const request = (...args) => retryConnect(() => request1(...args));
function request1(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers: { Host: `127.0.0.1:${port}`, ...(cookie && { Cookie: cookie }), ...(data && { 'Content-Type': 'application/json', 'X-Manager-Token': token }), ...headers } }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => {
        const set = res.headers['set-cookie']?.[0];
        if (set && !set.includes('Max-Age=0')) cookie = set.split(';')[0];
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          /* HTML */
        }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on('error', reject);
    req.end(data);
  });
}
const get = (p, h) => request('GET', p, undefined, h);
const post = (p, b = {}, h) => request('POST', p, b, h);

before(async () => {
  assert.ok(await portFree(APP_PORT), `Port ${APP_PORT} muss frei sein.`);
  port = await freePort();
  fs.mkdirSync(path.join(tmp, 'storage', 'data'), { recursive: true });
  const configFile = path.join(tmp, 'manager.config.json');
  // ohne Portal: die App läuft direkt auf APP_PORT (kein Port 80 auf dem Testrechner)
  einrichten(configFile, { manager: { port }, app: { port: APP_PORT, demoAccounts: true }, portal: { enabled: false, basePath: '' }, paths: { dataDir: path.join(tmp, 'storage'), backupDir: path.join(tmp, 'backups'), logDir: path.join(tmp, 'logs') } });
  proc = spawn(process.execPath, [path.join(MANAGER, 'server.mjs')], { env: { ...process.env, MANAGER_CONFIG: configFile, MOSAIK3LAB_QUIET: '1' }, stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 40 && !token; i++) {
    await sleep(250);
    token = await get('/').then((r) => /name="csrf-token" content="([a-f0-9]+)"/.exec(r.text)?.[1], () => null);
  }
  assert.ok(token, 'Manager gestartet');
});

after(async () => {
  for (const k of ['webapp', 'backup']) await post(`/api/services/${k}/stop`).catch(() => {});
  proc?.kill();
  await sleep(500);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('Schutz: Host-Header, Anmeldung, CSRF-Token', async () => {
  assert.equal((await get('/api/status', { Host: `evil.example:${port}` })).status, 403);
  assert.equal((await get('/api/status')).status, 401);
  assert.equal((await post('/api/auth/login', { email: 'x@y.de', password: 'x' }, { 'X-Manager-Token': 'falsch' })).status, 403);
});

test('Noch kein Administrator: direkt am Server anlegen, danach Anmeldung mit diesem Konto, Login-Bremse', async () => {
  const ADMIN = { email: 'chef@schule.example', name: 'Chef', password: 'Selbsttest-2026' };
  assert.equal((await get('/api/auth')).json.needsAdmin, true);
  assert.equal((await get('/api/settings')).status, 401, 'ohne Anmeldung nichts');
  assert.equal((await post('/api/auth/first', { ...ADMIN, password: 'kurz' })).status, 400);
  const first = await post('/api/auth/first', ADMIN);
  assert.equal(first.status, 200, first.text);
  assert.equal((await get('/api/settings')).status, 200, 'gleich angemeldet');
  assert.equal((await post('/api/auth/first', { ...ADMIN, email: 'zwei@schule.example' })).status, 400, 'nur solange es keinen gibt');
  assert.equal((await get('/api/auth')).json.needsAdmin, false);
  const saved = cookie;
  cookie = '';
  assert.equal((await post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password })).status, 200, 'Login mit dem Admin-Konto der App');
  cookie = '';
  for (let i = 0; i < 5; i++) assert.equal((await post('/api/auth/login', { email: ADMIN.email, password: 'falsch-falsch' })).status, 401);
  assert.equal((await post('/api/auth/login', ADMIN)).status, 429, 'gesperrt nach 5 Fehlversuchen');
  cookie = saved;
});

test('Status und Einstellungen', async () => {
  const s = (await get('/api/status')).json;
  assert.deepEqual(s.services.map((x) => x.key), ['webapp', 'backup', 'portal']);
  assert.ok(['ok', 'warn', 'error'].includes(s.light));
  assert.equal((await post('/api/settings', { backupDir: 'relativ' })).status, 400);
  assert.equal((await post('/api/settings', { appPort: 80 })).status, 400);
  assert.equal((await post('/api/settings', { backupTime: '03:30', backupKeep: 7 })).status, 200);
  assert.equal((await get('/api/settings')).json.backupTime, '03:30');
  assert.ok((await get('/api')).json.length > 15);
});

test('Web-App starten, prüfen, stoppen', async () => {
  assert.equal((await post('/api/services/webapp/start')).status, 200);
  let w;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    w = (await get('/api/status')).json.services[0];
    if (w.light === 'ok') break;
  }
  assert.equal(w.label, 'läuft', w.lastError ?? '');
  assert.equal((await post('/api/services/webapp/start')).status, 400, 'kein Doppelstart');
  const r = await post('/api/backup/restore', { id: 'x', confirm: 'x' });
  assert.match(r.json.error, /stoppen/, 'Wiederherstellen nur bei gestoppter App');
  const health = (await get('/api/status')).json.database;
  assert.equal(health.present, true, 'App legt die Datenbank an');
  assert.match(health.label, /Schema \d+/); // Versionsnummer wächst mit jeder Migration der App
  const neu = path.join(tmp, 'ablage-neu');
  const busy = await post('/api/settings', { ablageDir: neu });
  assert.equal(busy.status, 400);
  assert.match(busy.json.error, /Ablageordner.*gestoppter/, 'Ablage nur bei gestoppter App änderbar');
  assert.equal((await post('/api/services/webapp/stop')).status, 200);
  assert.equal((await get('/api/status')).json.services[0].label, 'gestoppt');
  assert.ok(await portFree(APP_PORT));
  assert.ok(!fs.existsSync(path.join(tmp, 'storage', 'data', '.lock')), 'sauber beendet');
  const alt = (await get('/api/settings')).json.ablageDir;
  fs.mkdirSync(path.join(alt, 'artikel', 'x', 'bild'), { recursive: true });
  fs.writeFileSync(path.join(alt, 'artikel', 'x', 'bild', 'a.png'), 'bild');
  const moved = await post('/api/settings', { ablageDir: neu, moveAblage: true });
  assert.equal(moved.status, 200, JSON.stringify(moved.json));
  assert.match(moved.json.ablageNote, /1 Datei\(en\) nach .* kopiert/);
  assert.equal(fs.readFileSync(path.join(neu, 'artikel', 'x', 'bild', 'a.png'), 'utf8'), 'bild');
  assert.ok(fs.existsSync(path.join(alt, 'artikel', 'x', 'bild', 'a.png')), 'alter Ordner bleibt als Sicherung');
  assert.equal((await get('/api/settings')).json.ablageDir, neu);
  assert.equal((await post('/api/settings', { ablageDir: alt })).json.ablageNote.startsWith('Achtung'), true, 'Hinweis, wenn Dateien zurückbleiben');
});

test('Mail-Einstellungen: Passwort nie in der Antwort, Datei für die App', async () => {
  const r = await post('/api/mail', { enabled: true, host: 'smtp.schule.example', port: 587, user: 'lab', password: 'geheim-123', from: 'lab@schule.example', recipients: 'werkstatt@schule.example', appBaseUrl: `http://127.0.0.1:${APP_PORT}` });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(!r.text.includes('geheim-123'));
  assert.ok(!(await get('/api/mail')).text.includes('geheim-123'));
  assert.equal((await get('/api/status')).json.mail.configured, true);
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path.join(tmp, 'storage', 'mosaik3lab.db'), { readOnly: true });
  const row = db.prepare("SELECT wert, geheim FROM betrieb_einstellung WHERE bereich = 'mail' AND schluessel = 'smtp'").get();
  db.close();
  assert.equal(JSON.parse(row.wert).pass, 'geheim-123');
  assert.equal(row.geheim, 1, 'als geheim markiert');
  assert.equal((await post('/api/mail', { enabled: true, host: 'smtp.schule.example', from: 'x', recipients: 'a@b.de' })).status, 400);
});

test('Backup und Wiederherstellen', async () => {
  const b = await post('/api/backup');
  assert.equal(b.status, 200, JSON.stringify(b.json));
  assert.equal(b.json.verified, true);
  assert.equal((await post('/api/backup/restore', { id: b.json.id })).status, 400, 'ohne Bestätigung');
  const r = await post('/api/backup/restore', { id: b.json.id, confirm: b.json.id });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(r.json.safetyBackup);
});

test('Datenordner ändern: Datenbank und Dateien werden übertragen, Anzahlen stimmen (K4)', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const counts = (file) => {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({ name }) => [name, db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n]));
    } finally {
      db.close();
    }
  };
  const old = path.join(tmp, 'storage');
  const neu = path.join(tmp, 'storage-neu');
  fs.mkdirSync(path.join(old, 'data'), { recursive: true });
  fs.writeFileSync(path.join(old, 'data', 'items.json'), '["alt"]');
  const before = counts(path.join(old, 'mosaik3lab.db'));
  assert.ok(Object.keys(before).length > 5, 'echte App-Datenbank');
  assert.equal((await get('/api/status')).json.services[0].running, false, 'Web-App gestoppt');
  const r = await post('/api/settings', { dataDir: neu });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(fs.existsSync(path.join(neu, 'mosaik3lab.db')), 'Datenbank übertragen (nicht nur data/ und uploads/)');
  assert.deepEqual(counts(path.join(neu, 'mosaik3lab.db')), before, 'Zeilen je Tabelle identisch');
  assert.equal(fs.readFileSync(path.join(neu, 'data', 'items.json'), 'utf8'), '["alt"]');
  assert.equal((await get('/api/settings')).json.dataDir, neu);
  assert.ok(fs.existsSync(path.join(old, 'mosaik3lab.db')), 'alter Ordner bleibt als Sicherung');
  // Ziel mit vorhandener Datenbank wird nie überschrieben
  const again = await post('/api/settings', { dataDir: old });
  assert.equal(again.status, 200, 'zurückwechseln auf einen Ordner mit Daten kopiert nichts (und überschreibt nichts)');
});

test('Wiederherstellen bei laufender Web-App: Manager stoppt und startet sie selbst (autoStop)', async () => {
  assert.equal((await post('/api/services/webapp/start')).status, 200);
  for (let i = 0; i < 60 && (await get('/api/status')).json.services[0].light !== 'ok'; i++) await sleep(1000);
  const s = (await get('/api/status')).json;
  assert.equal(s.services[0].label, 'läuft');
  assert.match(s.summary.text, /^(Alles in Ordnung\.|\d Punkte? brauch)/, 'ein Satz oben');
  const b = await post('/api/backup');
  const r = await post('/api/backup/restore', { id: b.json.id, confirm: b.json.id, autoStop: true });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.restarted, true);
  assert.equal((await get('/api/status')).json.services[0].running, true, 'Web-App läuft danach wieder');
  assert.equal((await post('/api/services/webapp/stop')).status, 200);
});
