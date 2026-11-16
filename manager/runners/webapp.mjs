// Dienst „Web-App“: startet Mosaik³LAB im Produktivmodus, prüft alle 15 s /api/health (Watchdog),
// startet nach Absturz mit wachsender Wartezeit neu und fährt sauber herunter.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRunner } from './runner.mjs';
import { getConfig, resolvePaths } from '../lib/config.mjs';
import { append, logFile, timestamp } from '../lib/log.mjs';
import { checkHealth, isAlive, appHost } from '../lib/services.mjs';
import { loadCert } from '../lib/portalcert.mjs';
import { platform } from '../platform/index.mjs';
import { runShell } from '../platform/common.mjs';

const runner = createRunner('webapp', 'app');
const { log, update } = runner;
const cfg = getConfig();
const dir = fs.realpathSync(resolvePaths().programDir); // echter Ordner statt Verweis „current“ (Vite/tsx mögen keine Junctions)
const out = (t) => append(logFile('app'), t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let child = null;
let restarts = 0;
let startedAt = 0;

async function start() {
  try {
    if (!fs.existsSync(path.join(dir, 'node_modules', 'tsx'))) throw new Error(`Abhängigkeiten fehlen in ${dir} – „npm ci“ ausführen bzw. „Einrichten“.`);
    if (!fs.existsSync(path.join(dir, 'client', 'dist', 'index.html'))) {
      update({ phase: 'building' });
      out(`\n==== ${timestamp()} Oberfläche wird gebaut ====\n`);
      const r = await runShell('npm run build -w client', { cwd: dir, onOutput: out });
      if (r.code !== 0) throw new Error('Build der Oberfläche fehlgeschlagen – siehe Protokoll.');
    }
    const env = { ...process.env, NODE_ENV: 'production', API_PORT: String(cfg.app.port), HOST: appHost(), STORAGE_DIR: resolvePaths().dataDir, DISABLE_DEMO_ACCOUNTS: String(!cfg.app.demoAccounts), SEED_DEMO_DATA: String(cfg.app.demoAccounts) };
    delete env.MANAGER_CONFIG;
    // Mail-Einstellungen und Session-Geheimnis liest die App selbst aus der Datenbank (betrieb_einstellung).
    env.ABLAGE_DIR = resolvePaths().ablageDir; // Dateiablage der App (Bilder, Druckdateien, Videos) – nur hier eingestellt
    delete env.SESSION_SECRET;
    env.BASE_PATH = cfg.portal.basePath; // Basis-Pfad der App (z. B. /mosaik3lab) – das Portal leitet genau diesen Pfad weiter
    if (cfg.portal.enabled && cfg.portal.https && loadCert()) env.PUBLIC_HTTPS = 'true'; // sichere Cookies, HSTS
    out(`\n==== ${timestamp()} Start: http://${appHost()}:${cfg.app.port}, Daten ${resolvePaths().dataDir} ====\n`);
    const preload = pathToFileURL(path.join(import.meta.dirname, 'app-preload.mjs')).href;
    child = spawn(process.execPath, ['--import', 'tsx', '--import', preload, 'src/index.ts'], { cwd: path.join(dir, 'server'), env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
    child.stdout.on('data', out);
    child.stderr.on('data', out);
    startedAt = Date.now();
    update({ phase: 'starting', appPid: child.pid, port: cfg.app.port });
    const me = child;
    child.on('exit', (code) => {
      out(`==== ${timestamp()} beendet (Code ${code}) ====\n`);
      if (child === me) child = null;
      if (!runner.stopping()) void crashed(`Web-App unerwartet beendet (Code ${code}).`);
    });
  } catch (err) {
    await crashed(err.message);
  }
}

async function crashed(message) {
  log.error(message);
  if (Date.now() - startedAt > 5 * 60_000) restarts = 0; // lief stabil → Zähler zurück
  const wait = Math.min(60_000, 2000 * 2 ** restarts++);
  update({ phase: 'restarting', lastError: message, restarts });
  await sleep(wait);
  if (!runner.stopping()) await start();
}

async function stopApp() {
  const c = child;
  child = null;
  if (!c) return;
  if (c.connected) c.send('shutdown'); // → sauberes Herunterfahren (runners/app-preload.mjs)
  for (let i = 0; i < 80 && c.exitCode === null; i++) await sleep(250);
  if (c.exitCode === null && isAlive(c.pid)) await platform.killTree(c.pid);
}
runner.onStop(stopApp);

let fails = 0;
setInterval(async () => {
  if (!child || runner.stopping()) return;
  const ok = await checkHealth(cfg.app.port);
  if (ok) {
    fails = 0;
    if (runner.state().phase !== 'running') update({ phase: 'running', lastError: null });
  } else if (Date.now() - startedAt > 60_000 && ++fails >= 4) {
    fails = 0;
    log.error('Watchdog: keine Antwort auf /api/health – Neustart.');
    await stopApp();
    void crashed('Watchdog: keine Antwort auf /api/health.');
  }
}, 15_000);

await start();
for (let i = 0; i < 60 && child && runner.state().phase !== 'running'; i++) {
  await sleep(1000);
  if (await checkHealth(cfg.app.port)) update({ phase: 'running', lastError: null });
}
