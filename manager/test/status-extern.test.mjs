// Status, wenn die App nicht vom Manager gestartet wurde (Entwicklung: npm run dev:lan), und Tempo des Status.
// Probelauf (MOSAIK3LAB_SYSTEM_DRY_RUN); die Port-Belegung wird vorgegeben statt per netstat ermittelt.
// Testdaten: C:\Entwicklung\_testdaten\server-manager\ (nicht im Temp-Verzeichnis).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const TESTROOT = path.resolve(import.meta.dirname, '..', '..', '..', '_testdaten', 'server-manager');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'extern-')));
fs.mkdirSync(path.join(tmp, 'daten'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'mosaik3lab.json'), JSON.stringify({ dataDir: path.join(tmp, 'daten'), managerPort: 5197 }));
Object.assign(process.env, { MANAGER_CONFIG: path.join(tmp, 'mosaik3lab.json'), MOSAIK3LAB_ROOT: tmp, MOSAIK3LAB_SYSTEM_DRY_RUN: path.join(tmp, 'probelauf.json'), MOSAIK3LAB_QUIET: '1' });

const cfg = await import('../lib/config.mjs');
const { platform } = await import('../platform/index.mjs');
const services = await import('../lib/services.mjs');
const { pageStatus } = await import('../lib/status.mjs');
const setup = await import('../lib/setup.mjs');

// Kleine „App“: antwortet unter /mosaik3lab/api/health wie die echte – oder wie ein fremdes Programm (404).
let mode = 'app';
const srv = http.createServer((req, res) => {
  if (mode === 'app' && req.url === '/mosaik3lab/api/health') return res.setHeader('Content-Type', 'application/json').end(JSON.stringify({ ok: true, db: { vorhanden: true, schemaVersion: 9, groesseBytes: 1024 } }));
  res.statusCode = 404;
  res.end('nicht gefunden');
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
// Wie beim Nutzer: Pfad in den Einstellungen leer, die Entwicklung läuft trotzdem unter /mosaik3lab.
cfg.updateConfig({ app: { port, network: false }, paths: { logDir: path.join(tmp, 'logs'), backupDir: path.join(tmp, 'backups') }, portal: { enabled: false, basePath: '', httpPort: 8089, httpsPort: 8449 } });

// Belegung vorgeben, langsam wie netstat + tasklist auf dem Rechner des Nutzers; Aufrufe zählen.
let calls = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
platform.portOwner = async (p) => {
  calls++;
  await sleep(400);
  return p === port ? { pid: mode === 'fremd' ? 515151 : 424242, process: 'node', address: '127.0.0.1' } : null;
};
const fresh = (m) => {
  mode = m;
  services.clearSystemCache();
};

after(() => {
  srv.close();
  setup.removeTree(tmp);
});

test('App außerhalb des Managers gestartet: kein Alarm, kein „Starten“', async () => {
  fresh('app');
  const s = await pageStatus();
  const web = s.services.find((v) => v.key === 'webapp');
  assert.deepEqual([web.external, web.running, web.light], [true, false, 'ok']);
  assert.match(web.label, /außerhalb des Managers gestartet/);
  assert.equal(s.conflict, null, 'Port gehört der App – kein Konflikt');
  assert.ok(!s.notes.some((n) => n.light === 'error'), JSON.stringify(s.notes));
  assert.ok(!s.notes.some((n) => n.fix === 'start:webapp'), 'kein Knopf „Web-App starten“');
  assert.ok(s.notes.some((n) => n.light === 'info' && /außerhalb des Managers/.test(n.text)), 'kurzer neutraler Hinweis');
  assert.equal(s.database.schemaVersion, 9, 'Datenbank-Zustand aus /api/health');
  assert.equal(s.addresses.local, `http://127.0.0.1:${port}/mosaik3lab/`, 'öffnen mit dem Pfad, unter dem die App antwortet');
});

test('Fremdes Programm auf dem Port: Alarm bleibt', async () => {
  fresh('fremd');
  const s = await pageStatus();
  assert.equal(s.conflict?.message, `Port ${port} ist belegt durch node (PID 515151).`);
  assert.equal(s.summary.light, 'error');
  assert.ok(!s.services.find((v) => v.key === 'webapp').external);
});

test('Antwortet die bekannte App einmal nicht rechtzeitig: kein Fehlalarm', async () => {
  fresh('app');
  await pageStatus(); // App erkannt (PID 424242)
  fresh('stumm'); // gleiche PID, /api/health antwortet diesmal nicht
  const s = await pageStatus();
  assert.equal(s.conflict, null);
  assert.ok(s.services.find((v) => v.key === 'webapp').external);
});

test('Status bleibt schnell: langsame Systemabfragen laufen parallel und werden gemerkt', async () => {
  fresh('app');
  calls = 0;
  let t = Date.now();
  await pageStatus();
  assert.ok(Date.now() - t < 1000, `erster Status ${Date.now() - t} ms (Ziel < 1 s)`);
  const first = calls;
  t = Date.now();
  await pageStatus();
  assert.ok(Date.now() - t < 300, `zweiter Status ${Date.now() - t} ms`);
  assert.equal(calls, first, 'keine neue Systemabfrage innerhalb der Merkzeit');
});

test('Entwicklung auf dem Portal-Port: Adresse ohne App-Port, kein Portal-Alarm', async () => {
  cfg.updateConfig({ app: { port: 3029 }, portal: { enabled: true, basePath: '/mosaik3lab', httpPort: port } });
  fresh('app');
  const s = await pageStatus();
  const url = `http://127.0.0.1:${port}/mosaik3lab/`;
  assert.equal(s.portal.openUrl, url);
  assert.equal(s.addresses.local, url, '„Mosaik³LAB öffnen“ zeigt die echte Adresse');
  assert.ok(s.addresses.network.every((u) => u.endsWith(`:${port}/mosaik3lab/`)));
  const portal = s.services.find((v) => v.key === 'portal');
  assert.deepEqual([portal.external, portal.light], [true, 'ok']);
  assert.ok(!s.notes.some((n) => /Portal|belegt/.test(n.text) && n.light === 'error'), JSON.stringify(s.notes));
});
