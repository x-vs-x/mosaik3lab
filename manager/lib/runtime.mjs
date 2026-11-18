// Laufzeit: Node.js und Dienst-Wrapper (WinSW) aus dem Manager prüfen und aktualisieren – nie automatisch,
// nur auf Knopfdruck (oder `runtime update <node|wrapper>`).
// Ablauf immer: Sicherung → Dienste stoppen → aktualisieren (Windows: winget per UAC, Linux: apt per sudo) →
// Dienste starten → Health-Check. Scheitert etwas, gibt es eine klare Meldung und den Befehl zum Zurückgehen.
// npm-Pakete der App aktualisiert das App-Update (npm ci aus der Lock-Datei); hier nur die Info aus `npm audit`.
import fs from 'node:fs';
import path from 'node:path';
import { platform } from '../platform/index.mjs';
import { run, runShell, psQuote, SERVICE_IDS } from '../platform/common.mjs';
import { INSTALL, resolvePaths, requireValidConfig, isInside, InputError } from './config.mjs';
import { nodeOk, ensureWrapper } from './setup.mjs';
import { logger } from './log.mjs';

export const WHAT = ['node', 'wrapper'];
const TITLES = { node: 'Node.js', wrapper: 'Dienst-Wrapper (WinSW)' };
const log = () => logger('manager');

/** "v24.1.0" / "2.47.1" → [24, 1, 0] */
const parts = (v) => String(v ?? '').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
export function compareVersions(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

const fetchJson = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'mosaik3lab-manager', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

/** Aktuelle Node-LTS laut nodejs.org; null bei Offline. */
export async function latestNodeLts(get = fetchJson) {
  try {
    const list = await get('https://nodejs.org/dist/index.json');
    const e = list.find((x) => x.lts);
    return e ? e.version.replace(/^v/, '') : null;
  } catch {
    return null;
  }
}

/** Installierte WinSW-Version: höchste Datei WinSW-<version>.exe im Werkzeugordner der Installation. */
function installedWrapper() {
  if (!INSTALL) return null;
  const dir = path.join(INSTALL.managerDir, 'werkzeuge');
  try {
    return fs.readdirSync(dir).map((f) => /^WinSW-(.+)\.exe$/.exec(f)?.[1]).filter(Boolean).sort(compareVersions).pop() ?? null;
  } catch {
    return null;
  }
}

/** Von den Programmen selbst gemeldete Version (nach einem Update ist es die neue, nicht die des laufenden Prozesses). */
async function installedVersion(what) {
  if (what === 'node') {
    const r = await run(process.execPath, ['--version'], { timeout: 8000 });
    return r.code === 0 ? r.stdout.replace(/^v/, '') : process.versions.node;
  }
  return installedWrapper();
}

/** Installation aus dem Installer-Paket: node.exe liegt im Programmordner – Node und Updates kommen mit einem neuen Paket. */
export const bundledNode = () => !!INSTALL && isInside(process.execPath, INSTALL.programRoot);
const PAKET_HINWEIS = `kommt mit dem Mosaik³LAB-Paket – Update über ein neues Paket (${platform.id === 'windows' ? 'Installieren.cmd' : 'sudo ./installieren.sh'})`;

/** Eine Zeile je Laufzeit: Ampel, Version, Knopf. Offline: „aktuelle Version unbekannt“, nie ein Fehler. */
export async function runtimeStatus(ctx = {}) {
  const get = ctx.fetchJson ?? fetchJson;
  const rows = [];
  const row = (id, installed, latest, light, label, action = 'update', hint = '') => rows.push({ id, title: TITLES[id], installed, latest, light, label, action, hint });

  // Paket-Installation: Node.js kommt mit dem Paket, Updates kommen als Paket
  const paket = ctx.paket ?? bundledNode();
  const node = await installedVersion('node');
  const nodeLatest = await latestNodeLts(get);
  if (paket) row('node', node, nodeLatest, 'ok', `${node} – ${PAKET_HINWEIS}`, null);
  else if (!nodeOk()) row('node', node, nodeLatest, 'error', `Node.js ${node} ist zu alt`, 'update', platform.nodeInstall);
  else if (nodeLatest && compareVersions(nodeLatest, node) > 0) row('node', node, nodeLatest, 'warn', `${node} – neuere LTS ${nodeLatest} verfügbar`);
  else if (!nodeLatest) row('node', node, null, 'info', `${node} – aktuelle Version unbekannt (offline?)`);
  else row('node', node, nodeLatest, 'ok', `${node} – aktuell`);

  if (platform.wrapper) {
    const have = installedWrapper();
    const want = platform.wrapper.version;
    if (!have) row('wrapper', null, want, 'info', 'noch nicht eingerichtet (kommt mit „Einrichten“)', null);
    else if (compareVersions(want, have) > 0) row('wrapper', have, want, 'warn', `${have} – ${want} verfügbar`);
    else row('wrapper', have, want, 'ok', `${have} – aktuell`, null);
  }
  return { rows, checkedAt: new Date().toISOString(), platform: platform.label };
}

/** Sicherheitsinfo zu den npm-Paketen der App (nur Information, ändert nichts). */
export async function npmAudit(dir = resolvePaths().programDir) {
  // Paket-Installation: fertig gebündelt, ohne npm-Projekt – Korrekturen kommen mit dem nächsten Paket
  if (bundledNode()) return { ok: false, light: 'info', counts: null, label: 'bei einer Paket-Installation nicht nötig – Sicherheitskorrekturen kommen mit dem nächsten Mosaik³LAB-Paket' };
  const r = await runShell('npm audit --omit=dev --json', { cwd: dir, timeout: 120_000 });
  try {
    const v = JSON.parse(r.stdout).metadata?.vulnerabilities;
    if (!v) throw new Error('keine Angaben');
    const light = v.critical || v.high ? 'error' : v.total ? 'warn' : 'ok';
    return { ok: true, light, counts: v, label: v.total ? `${v.total} bekannte Schwachstelle(n): ${v.critical} kritisch, ${v.high} hoch, ${v.moderate} mittel, ${v.low} niedrig – Einzelheiten: „npm audit --omit=dev“ im Programmordner; Korrekturen kommen mit einem App-Update (npm ci)` : 'keine bekannten Schwachstellen' };
  } catch {
    return { ok: false, light: 'info', counts: null, label: 'nicht prüfbar (offline?)' };
  }
}

/**
 * WinSW in allen eingerichteten Diensten ersetzen (Web-App, Backup, Portal, Manager, Update-Helfer – nur die, deren .exe
 * es gibt). Eine laufende .exe lässt sich umbenennen, aber nicht überschreiben → erst beiseite schieben, dann neu kopieren;
 * ein laufender Dienst arbeitet bis zu seinem Neustart mit der alten Datei weiter.
 */
export function wrapperScript(managerDir, version) {
  const exe = path.join(managerDir, 'werkzeuge', `WinSW-${version}.exe`);
  const dir = path.join(managerDir, 'dienste');
  return Object.values(SERVICE_IDS).map((id) => {
    const f = path.join(dir, `${id}.exe`);
    return `if (Test-Path ${psQuote(f)}) { Remove-Item -Force ${psQuote(`${f}.alt`)} -ErrorAction SilentlyContinue; Move-Item -Force ${psQuote(f)} ${psQuote(`${f}.alt`)}; Copy-Item -Force ${psQuote(exe)} ${psQuote(f)} }`;
  }).join('\n');
}

/** Standard-Umgebung; Tests ersetzen einzelne Teile. */
async function defaultContext() {
  return {
    platform,
    installedVersion,
    services: {
      async stopAll() {
        const s = await import('./services.mjs');
        const running = [];
        for (const key of s.KEYS) {
          if (!(await s.serviceStatus(key)).running) continue;
          running.push(key);
          await s.stopService(key);
        }
        return running;
      },
      async startAll(keys) {
        const s = await import('./services.mjs');
        for (const key of keys) await s.startService(key);
      },
      async healthy(ms) {
        const s = await import('./services.mjs');
        for (const until = Date.now() + ms; Date.now() < until; await new Promise((r) => setTimeout(r, 1500))) if (await s.checkHealth()) return true;
        return false;
      },
    },
    async backup() {
      return (await import('./backup.mjs')).createBackup('vor Laufzeit-Update');
    },
    async admin(script, title) {
      return (await import('./services.mjs')).admin(script, title);
    },
    async prepareWrapper() {
      return ensureWrapper(path.join(INSTALL.managerDir, 'werkzeuge', `WinSW-${platform.wrapper.version}.exe`), true);
    },
    wrapperScript() {
      return wrapperScript(INSTALL.managerDir, platform.wrapper.version);
    },
    requestManagerRestart() {
      if (INSTALL) fs.writeFileSync(path.join(resolvePaths().logDir, 'manager.restart'), '1');
    },
  };
}

/**
 * Laufzeit aktualisieren. override: Testumgebung (platform, services, backup, admin, installedVersion …).
 * report(step, status, detail) meldet den Fortschritt. dryRun: nur anzeigen, was passieren würde.
 */
export async function updateRuntime(what, { dryRun = false, ...override } = {}, report = () => {}) {
  if (!WHAT.includes(what)) throw new InputError(`Unbekannte Laufzeit „${what}“ – möglich: ${WHAT.join(', ')}.`);
  const c = { ...(await defaultContext()), ...override };
  const pf = c.platform;
  if (what === 'wrapper' ? !pf.wrapper : !pf.runtime) throw new InputError(what === 'wrapper' ? 'Den Dienst-Wrapper gibt es nur unter Windows.' : 'Für diese Plattform ist keine Aktualisierung hinterlegt.');
  if (what === 'node' && !override.platform && bundledNode()) throw new InputError(`Node.js ${PAKET_HINWEIS}.`);
  const before = await c.installedVersion(what);
  let script;
  if (what === 'wrapper') {
    if (!INSTALL && !c.wrapperScript) throw new InputError('Den Dienst-Wrapper gibt es nur in einer eingerichteten Installation.');
    script = c.wrapperScript();
  } else {
    script = (before ? pf.runtime.upgradeScript : pf.runtime.installScript)(what);
  }
  const plan = { what, from: before, command: script, steps: ['Sicherung', 'Dienste stoppen', `${TITLES[what]} ${before ? 'aktualisieren' : 'installieren'}`, 'Dienste starten', 'Health-Check'] };
  if (dryRun) return { dryRun: true, ...plan };
  if (!override.backup) requireValidConfig();

  const step = async (id, fn) => {
    report(id, 'läuft');
    try {
      const r = await fn();
      report(id, 'fertig', typeof r === 'string' ? r : undefined);
      return r;
    } catch (err) {
      report(id, 'fehler', err.message);
      throw err;
    }
  };
  const back = before ? ` Zurückgehen: ${pf.runtime?.backScript?.(what, before) ?? 'ältere Version von Hand installieren'}` : '';
  const backup = await step('backup', async () => (await c.backup())?.id ?? 'übersprungen');
  if (what === 'wrapper') await step('download', async () => (await c.prepareWrapper?.(), 'bereit'));
  const running = await step('stop', () => c.services.stopAll());
  let failure = null;
  try {
    await step('update', async () => {
      await c.admin(script, `${TITLES[what]} ${before ? 'aktualisieren' : 'installieren'}`);
      return `${before ?? '–'} → ${(await c.installedVersion(what)) ?? '?'}`;
    });
  } catch (err) {
    failure = err;
  }
  let healthy = true;
  try {
    await step('start', () => c.services.startAll(['webapp', ...running.filter((k) => k !== 'webapp')]));
    healthy = await step('health', async () => {
      if (!(await c.services.healthy(c.healthMs ?? 90_000))) throw new Error('Die Web-App antwortet nach dem Start nicht auf /api/health.');
      return true;
    });
  } catch (err) {
    healthy = false;
    failure ??= err;
  }
  if (!running.includes('webapp')) await c.services.stopAll(); // war vorher aus → wieder aus
  const after = await c.installedVersion(what);
  if (failure) {
    log().error(`Laufzeit-Update ${what} fehlgeschlagen: ${failure.message}`);
    return { ok: false, what, from: before, to: after, backup, message: `${TITLES[what]}: ${failure.message}`, hint: `Die Daten sind unverändert, Sicherung: ${backup}.${back}` };
  }
  c.requestManagerRestart?.();
  log().info(`Laufzeit aktualisiert: ${what} ${before} → ${after}`);
  return { ok: true, what, from: before, to: after, backup, healthy, message: before === after ? `${TITLES[what]} war bereits aktuell (${after}).` : `${TITLES[what]} ${before ?? '–'} → ${after}.` };
}
