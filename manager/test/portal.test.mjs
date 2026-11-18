// Portal (Weiterleitung auf die App unter /mosaik3lab), HTTPS-Zertifikat, belegte Ports, Basis-Pfad der echten App.
// Alles auf localhost mit freien Ports (statt 80/443); das Zertifikat entsteht nur als Datei (Windows: kurz im Benutzer-
// Zertifikatspeicher und sofort wieder entfernt – der Test prüft, dass nichts zurückbleibt). Testdaten:
// C:\Entwicklung\_testdaten\server-manager\ (nicht im Temp-Verzeichnis).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const TESTROOT = path.resolve(ROOT, '..', '_testdaten', 'server-manager');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'portal-')));
const startFile = path.join(tmp, 'mosaik3lab.json');
fs.writeFileSync(startFile, JSON.stringify({ dataDir: path.join(tmp, 'storage'), managerPort: 5193 }));
process.env.MANAGER_CONFIG = startFile;
process.env.MOSAIK3LAB_QUIET = '1';

const cfg = await import('../lib/config.mjs');
const setup = await import('../lib/setup.mjs');
const { startPortal } = await import('../lib/portalserver.mjs');
const pc = await import('../lib/portalcert.mjs');
const { platform } = await import('../platform/index.mjs');
const { freePort, retryConnect } = await import('./helpers/net.mjs');

const children = [];
// Erst warten, bis die gestarteten Apps wirklich beendet sind – Windows sperrt die Datenbank sonst noch (EPERM beim Löschen)
after(async () => {
  await Promise.all(children.filter((c) => c.exitCode === null && c.signalCode === null).map((c) => new Promise((r) => (c.once('exit', r), c.kill()))));
  for (let i = 0; ; i++) {
    try {
      return setup.removeTree(tmp);
    } catch (err) {
      if (i >= 20 || !['EPERM', 'EBUSY'].includes(err.code)) throw err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
});
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** HTTP(S)-Anfrage, ohne Weiterleitungen, Zertifikat wird nicht geprüft (selbstsigniert). */
const req = (url, opts) => retryConnect(() => req1(url, opts));
function req1(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const r = lib.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers, rejectUnauthorized: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    r.on('error', reject);
    if (body) r.end(body);
    else r.end();
  });
}

// ---------- Weiterleitung (mit einer Attrappe als App) ----------
const upstreamPort = await freePort();
const upstream = http.createServer((q, s) => {
  const p = new URL(q.url, 'http://x').pathname;
  if (p === '/mosaik3lab/echo') {
    s.setHeader('Content-Type', 'application/json');
    return s.end(JSON.stringify({ headers: q.headers, url: q.url }));
  }
  if (p === '/mosaik3lab/upload') {
    const h = crypto.createHash('sha256');
    let n = 0;
    q.on('data', (c) => (h.update(c), (n += c.length)));
    return q.on('end', () => s.end(JSON.stringify({ bytes: n, sha: h.digest('hex') })));
  }
  if (p === '/mosaik3lab/download') {
    s.setHeader('Content-Type', 'application/octet-stream');
    for (let i = 0; i < 20; i++) s.write(Buffer.alloc(1024 * 1024, i));
    return s.end();
  }
  s.statusCode = 404;
  s.end('nix');
});
await new Promise((r) => upstream.listen(upstreamPort, '127.0.0.1', r));
after(() => upstream.close());

test('Portal leitet /mosaik3lab weiter, / zur App, alles andere → 404; Forwarded-Angaben kommen vom Portal, nicht von außen', async () => {
  const httpPort = await freePort();
  const p = await startPortal({ host: '127.0.0.1', httpPort, httpsPort: 0, tls: null, basePath: '/mosaik3lab', appPort: upstreamPort, certInfo: null });
  try {
    const root = await req(`http://127.0.0.1:${httpPort}/?x=1`);
    assert.equal(root.status, 302);
    assert.equal(root.headers.location, '/mosaik3lab/?x=1');
    const nope = await req(`http://127.0.0.1:${httpPort}/andere-seite`);
    assert.equal(nope.status, 404);
    assert.match(nope.body.toString(), /Diese Adresse gibt es hier nicht/);
    const echo = JSON.parse((await req(`http://127.0.0.1:${httpPort}/mosaik3lab/echo?a=1`, { headers: { 'X-Forwarded-For': '6.6.6.6', 'X-Forwarded-Proto': 'https', Forwarded: 'for=6.6.6.6' } })).body.toString());
    assert.equal(echo.url, '/mosaik3lab/echo?a=1', 'Pfad und Abfrage unverändert');
    assert.equal(echo.headers['x-forwarded-for'], '127.0.0.1', 'gefälschte Angaben von außen werden nie geglaubt');
    assert.equal(echo.headers['x-forwarded-proto'], 'http');
    assert.equal(echo.headers['x-forwarded-host'], `127.0.0.1:${httpPort}`);
    assert.equal(echo.headers.forwarded, undefined);
  } finally {
    await p.close();
  }
});

test('Große Uploads und Downloads laufen als Strom durch (Prüfsummen gleich); ohne App: freundliche Fehlerseite 502', async () => {
  const httpPort = await freePort();
  const p = await startPortal({ host: '127.0.0.1', httpPort, httpsPort: 0, tls: null, basePath: '/mosaik3lab', appPort: upstreamPort, certInfo: null });
  try {
    const big = crypto.randomBytes(40 * 1024 * 1024);
    const up = await req(`http://127.0.0.1:${httpPort}/mosaik3lab/upload`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': big.length }, body: big });
    assert.deepEqual(JSON.parse(up.body.toString()), { bytes: big.length, sha: sha(big) });
    const down = await req(`http://127.0.0.1:${httpPort}/mosaik3lab/download`);
    assert.equal(down.body.length, 20 * 1024 * 1024);
    assert.equal(sha(down.body), sha(Buffer.concat(Array.from({ length: 20 }, (_, i) => Buffer.alloc(1024 * 1024, i)))));
  } finally {
    await p.close();
  }
  const deadPort = await freePort();
  const httpPort2 = await freePort();
  const q = await startPortal({ host: '127.0.0.1', httpPort: httpPort2, httpsPort: 0, tls: null, basePath: '/mosaik3lab', appPort: deadPort, certInfo: null });
  try {
    const r = await req(`http://127.0.0.1:${httpPort2}/mosaik3lab/`);
    assert.equal(r.status, 502);
    assert.match(r.body.toString(), /antwortet gerade nicht/);
  } finally {
    await q.close();
  }
});

test('Belegter Port wird erkannt: Fehler mit Portnummer (z. B. IIS auf 80)', async () => {
  const blocker = net.createServer();
  const port = await new Promise((resolve) => blocker.listen(0, '127.0.0.1', () => resolve(blocker.address().port)));
  try {
    await assert.rejects(() => startPortal({ host: '127.0.0.1', httpPort: port, httpsPort: 0, tls: null, basePath: '', appPort: upstreamPort, certInfo: null }), (err) => err.code === 'EADDRINUSE' && err.port === port);
    const owner = await platform.portOwner(port);
    assert.ok(owner?.pid, 'der Manager kann sagen, wer den Port belegt');
  } finally {
    blocker.close();
  }
});

test('Ohne Basis-Pfad: alles geht an die App', async () => {
  const httpPort = await freePort();
  const p = await startPortal({ host: '127.0.0.1', httpPort, httpsPort: 0, tls: null, basePath: '', appPort: upstreamPort, certInfo: null });
  try {
    assert.equal((await req(`http://127.0.0.1:${httpPort}/irgendwas`)).status, 404); // 404 der Attrappe, nicht des Portals
    assert.equal((await req(`http://127.0.0.1:${httpPort}/irgendwas`)).body.toString(), 'nix');
  } finally {
    await p.close();
  }
});

// ---------- HTTPS-Zertifikat ----------
// Nur nach DIESEM Zertifikat suchen (Fingerabdruck) – ein paralleler Lauf in einer anderen Arbeitskopie legt kurz sein eigenes an.
const inStore = (x) => process.platform === 'win32'
  && spawnSync('powershell.exe', ['-NoProfile', '-Command', `Test-Path Cert:\\CurrentUser\\My\\${x.fingerprint.replace(/:/g, '')}`], { encoding: 'utf8' }).stdout.trim() === 'True';

test('Zertifikat erzeugen: Rechnername + IPs, 5 Jahre, nichts bleibt im Zertifikatspeicher; Prüfung meldet Namen/Ablauf', async () => {
  const info = await pc.generateCert();
  assert.equal(inStore(new crypto.X509Certificate((await pc.publicCert()).der)), false, 'nichts bleibt im Zertifikatspeicher');
  assert.equal(info.valid, true, JSON.stringify(info.problems));
  assert.ok(info.daysLeft >= 5 * 365 - 2 && info.daysLeft <= 5 * 365, `5 Jahre gültig (${info.daysLeft})`);
  const id = pc.hostIdentity();
  assert.ok(info.san.some((s) => s.toLowerCase().includes(id.hostname.toLowerCase())), info.san.join());
  for (const ip of id.ips) assert.ok(info.san.some((s) => s.includes(ip)), `IP ${ip} im Zertifikat`);
  assert.deepEqual(info.warnings, []);
  // Hostname/IP passen nicht → Hinweis; bald ablaufend → Hinweis
  const other = await pc.inspectCert(pc.loadCert(), { hostname: 'ganz-anderer-rechner', ips: ['10.77.77.77'] });
  assert.match(other.warnings.join(' '), /gilt nicht für diesen Rechner/);
  const kurz = await pc.generateCert({ days: 10 });
  assert.ok(kurz.warnings.some((w) => /läuft in \d+ Tag/.test(w)), 'Ablauf-Warnung (≤ 30 Tage)');
  await pc.generateCert(); // wieder ein langes
});

test('Zertifikat hinterlegen: Passwort/Schlüssel werden geprüft; Zertifikat steht in der Datenbank (also im Backup)', async () => {
  const stored = pc.loadCert();
  assert.equal(stored.type, process.platform === 'win32' ? 'pfx' : 'pem');
  const db = (await import('../lib/settingsdb.mjs')).readBereich(cfg.resolvePaths().dbFile, 'betrieb');
  assert.ok(db['portal.cert'], 'in der Datenbank');
  if (stored.type === 'pfx') {
    await assert.rejects(() => pc.saveCert({ pfx: stored.pfx, passphrase: 'falsch' }), /Passwort falsch|PFX/);
    assert.equal((await pc.saveCert({ pfx: stored.pfx, passphrase: stored.passphrase })).valid, true);
  }
  await assert.rejects(() => pc.saveCert({ cert: 'kein pem', key: 'kein pem' }), /PEM-Format/);
  await assert.rejects(() => pc.saveCert({}), /PFX-Datei mit Passwort oder Zertifikat und Schlüssel/);
  // PEM mit fremdem Schlüssel
  const pub = await pc.publicCert();
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  await assert.rejects(() => pc.saveCert({ cert: pub.pem, key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }), /gehört nicht zu diesem Zertifikat/);
});

test('HTTPS: Portal spricht TLS, HTTP leitet um, /zertifikat bleibt per HTTP erreichbar, App sieht https + echte Client-IP', async () => {
  const cert = pc.loadCert();
  const pub = await pc.publicCert(cert);
  const httpPort = await freePort();
  const httpsPort = await freePort();
  const p = await startPortal({ host: '127.0.0.1', httpPort, httpsPort, tls: pc.tlsOptions(cert), basePath: '/mosaik3lab', appPort: upstreamPort, certInfo: () => pub });
  try {
    const echo = JSON.parse((await req(`https://127.0.0.1:${httpsPort}/mosaik3lab/echo`)).body.toString());
    assert.equal(echo.headers['x-forwarded-proto'], 'https');
    assert.equal(echo.headers['x-forwarded-for'], '127.0.0.1');
    const redirect = await req(`http://127.0.0.1:${httpPort}/mosaik3lab/seite?a=b`);
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.location, `https://127.0.0.1:${httpsPort}/mosaik3lab/seite?a=b`);
    const help = await req(`http://127.0.0.1:${httpPort}/zertifikat`);
    assert.equal(help.status, 200, 'Anleitung ohne Umleitung (sonst Warnseite vor dem Vertrauen)');
    assert.match(help.body.toString(), /Zertifikat installieren/);
    const file = await req(`http://127.0.0.1:${httpPort}/zertifikat.cer`);
    assert.equal(file.status, 200);
    assert.equal(new crypto.X509Certificate(file.body).fingerprint256, new crypto.X509Certificate(pub.der).fingerprint256, 'dasselbe Zertifikat wie auf dem Server (ohne Schlüssel)');
    assert.ok(!file.body.includes('PRIVATE'), 'kein Schlüssel im Download');
  } finally {
    await p.close();
  }
});

// ---------- die echte App hinter dem Portal ----------
test('Echte App unter /mosaik3lab hinter dem Portal: Seite, Anmeldung (Cookie-Pfad), Bild-Upload und -Abruf; HTTPS → Secure-Cookie', async () => {
  const appPort = await freePort();
  fs.mkdirSync(path.join(tmp, 'app'), { recursive: true });
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: path.join(ROOT, 'server'),
    env: { ...process.env, API_PORT: String(appPort), HOST: '127.0.0.1', STORAGE_DIR: path.join(tmp, 'app'), ABLAGE_DIR: path.join(tmp, 'app', 'ablage'), BASE_PATH: '/mosaik3lab', PUBLIC_HTTPS: 'true', NODE_ENV: 'development', SEED_DEMO_DATA: 'true', DISABLE_DEMO_ACCOUNTS: 'false' },
    stdio: 'ignore',
    windowsHide: true,
  });
  children.push(child);
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    await sleep(500);
    ok = await req(`http://127.0.0.1:${appPort}/mosaik3lab/api/health`).then((r) => r.status === 200, () => false);
  }
  assert.ok(ok, 'App gestartet');
  const cert = pc.loadCert();
  const httpPort = await freePort();
  const httpsPort = await freePort();
  const p = await startPortal({ host: '127.0.0.1', httpPort, httpsPort, tls: pc.tlsOptions(cert), basePath: '/mosaik3lab', appPort, certInfo: null });
  try {
    const base = `https://127.0.0.1:${httpsPort}/mosaik3lab`;
    const json = { 'Content-Type': 'application/json', 'X-Requested-With': 'mosaik3lab' };
    // Anmeldung über das Portal: Cookie nur unter /mosaik3lab und „Secure“ (App merkt HTTPS am X-Forwarded-Proto des Portals)
    const login = await req(`${base}/api/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: 'demo.druckteam@schule.example', password: 'Mosaik-Druck-2026' }) });
    assert.equal(login.status, 200, login.body.toString());
    const setCookie = login.headers['set-cookie'][0];
    assert.match(setCookie, /Path=\/mosaik3lab/);
    assert.match(setCookie, /;\s*Secure/i);
    assert.match(setCookie, /HttpOnly/i);
    const cookie = setCookie.split(';')[0];
    const items = JSON.parse((await req(`${base}/api/items`, { headers: { Cookie: cookie, 'X-Requested-With': 'mosaik3lab' } })).body.toString());
    assert.ok(items.length > 3);
    // Bild hochladen und über das Portal wieder abrufen
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const boundary = '----m3l';
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="t.png"\r\nContent-Type: image/png\r\n\r\n`), png, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const up = await req(`${base}/api/items/${items[0].id}/images`, { method: 'POST', headers: { Cookie: cookie, 'X-Requested-With': 'mosaik3lab', 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length }, body });
    assert.equal(up.status, 201, up.body.toString());
    const file = JSON.parse(up.body.toString()).images.at(-1);
    const img = await req(`${base}/api/files/images/${file}`, { headers: { Cookie: cookie } });
    assert.equal(img.status, 200);
    assert.equal(sha(img.body), sha(png), 'Bild kommt unverändert zurück');
    // über HTTP: Umleitung auf HTTPS
    assert.equal((await req(`http://127.0.0.1:${httpPort}/mosaik3lab/`)).status, 301);
  } finally {
    await p.close();
    child.kill();
  }
});
