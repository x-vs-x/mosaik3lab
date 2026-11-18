// Dienste „Web-App“ und „Backup“: Zustand, Start/Stopp, Firewall-Freigabe.
// Nach der Einrichtung laufen sie als Betriebssystem-Dienste (WinSW/systemd), vorher als Hintergrundprozesse.
// Beide Wege schreiben denselben Zustand nach <logDir>/<dienst>.state.json (siehe runners/).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getConfig, resolvePaths, updateConfig, requireValidConfig, CONFIG_FILE, MANAGER_DIR, InputError, DEFAULTS } from './config.mjs';
import { logger } from './log.mjs';
import { recordManifest } from './manifest.mjs';
import { platform, SERVICE_TITLES, FIREWALL_RULE } from '../platform/index.mjs';

export const KEYS = ['webapp', 'backup', 'portal'];
const log = () => logger('manager');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const stateFile = (key) => path.join(resolvePaths().logDir, `${key}.state.json`);
export const stopFile = (key) => path.join(resolvePaths().logDir, `${key}.stop`);
/** Mit Portal hört die App nur auf 127.0.0.1 – von außen kommt man nur über das Portal (Port 80/443). */
export const appHost = () => (!getConfig().portal.enabled && getConfig().app.network ? '0.0.0.0' : '127.0.0.1');
/** Adresse der App auf diesem Rechner (über das Portal, sonst direkt) – für „Öffnen“. */
export function localAppUrl(c = getConfig()) {
  const proto = c.portal.enabled && c.portal.https ? 'https' : 'http';
  const port = c.portal.enabled ? (proto === 'https' ? c.portal.httpsPort : c.portal.httpPort) : c.app.port;
  const std = (proto === 'https' && port === 443) || (proto === 'http' && port === 80);
  return `${proto}://${c.portal.enabled && c.portal.https ? 'localhost' : '127.0.0.1'}${std ? '' : `:${port}`}${c.portal.basePath}/`;
}
export const portalHost = () => (getConfig().app.network ? '0.0.0.0' : '127.0.0.1');
/** Ports, die in der Firewall freigegeben sein sollen (nur bei „Im Netzwerk freigeben“): Portal-Ports, sonst der Port der App. */
export const wantedFirewallPorts = (c = getConfig()) => (c.portal.enabled ? [c.portal.httpPort, ...(c.portal.https ? [c.portal.httpsPort] : [])] : [c.app.port]);
export const candidateFirewallPorts = (c = getConfig()) => [...new Set([c.app.port, c.portal.httpPort, c.portal.httpsPort])];

export function readState(key) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(key), 'utf8'));
  } catch {
    return null;
  }
}

import { lebt as isAlive } from './hilfen.mjs';

export { isAlive };

/** Antwort von /api/health (oder null). Die App meldet dort künftig auch den Datenbank-Zustand. */
export async function fetchHealth(port = getConfig().app.port, basePath = getConfig().portal.basePath) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${basePath}/api/health`, { signal: AbortSignal.timeout(1500) });
    const body = await res.json();
    return res.ok && body.ok === true ? body : null;
  } catch {
    return null;
  }
}
export const checkHealth = async (port, basePath) => !!(await fetchHealth(port, basePath));

// ---------- Langsame Systemabfragen kurz merken ----------
// Gemessen (Windows): netstat ~0,4 s, tasklist ~0,15 s, Get-NetFirewallRule (PowerShell) ~2,5 s – die Seite fragt alle 5 s.
const cache = new Map();
function cached(key, ms, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.value;
  const value = Promise.resolve().then(fn);
  value.catch(() => cache.delete(key));
  cache.set(key, { at: Date.now(), value });
  return value;
}
/** Gemerktes verwerfen – nach Start/Stopp eines Dienstes und nach Firewall-Änderungen. */
export const clearSystemCache = () => cache.clear();
export const portOwner = (port) => cached(`port:${port}`, 10_000, () => platform.portOwner(port));
export const firewallExists = (port) => cached(`fw:${port}`, 30_000, () => platform.firewall.exists(port));
/** Ist eine Firewall aktiv? (Windows: immer; Linux: ufw/firewalld eingeschaltet) – ohne gibt es nichts freizugeben. */
export const firewallActive = () => cached('fw:active', 30_000, async () => (platform.firewall.active ? platform.firewall.active().catch(() => true) : true));
export const publicNetwork = () => cached('fw:public', 60_000, () => platform.firewall.publicNetwork?.() ?? false);
export const PUBLIC_NETWORK_HINT = 'Das Netzwerk dieses Rechners ist in Windows als „Öffentlich“ eingestuft – die Freigabe gilt nur für „Privat“ und „Domäne“, im Schulnetz ist die App so nicht erreichbar. Abhilfe: Windows-Einstellungen → Netzwerk und Internet → Eigenschaften → Netzwerkprofil „Privat“.';
const appPids = new Map(); // PID → Pfad, unter dem dort eine außerhalb gestartete App geantwortet hat

/**
 * Belegt ein anderes Programm (nicht pids) den Port? → { pid, process, address, app } oder null. app: dort antwortet eine
 * Mosaik³LAB-App, die nicht der Manager gestartet hat (z. B. Entwicklung mit „npm run dev“) – dann ist das kein Konflikt.
 * Geprüft wird der eingestellte Pfad und der Standardpfad /mosaik3lab (die Entwicklung läuft immer darunter).
 */
export const foreignOwner = (port, pids = []) => cached(`owner:${port}:${pids.join()}`, 2000, async () => {
  const owner = await portOwner(port).catch(() => null);
  if (!owner || pids.includes(owner.pid)) return null;
  // Ein Prozess, der schon einmal als Mosaik³LAB geantwortet hat, bleibt es – eine einzelne langsame Antwort (z. B. viele
  // offene Verbindungen auf dem Rechner) macht so keinen Fehlalarm.
  if (appPids.has(owner.pid)) return { ...owner, app: true, basePath: appPids.get(owner.pid) };
  const paths = [...new Set([getConfig().portal.basePath, DEFAULTS.portal.basePath])];
  const found = (await Promise.all(paths.map(async (p) => ((await checkHealth(port, p)) ? p : null)))).find((p) => p !== null);
  if (found !== undefined) appPids.set(owner.pid, found);
  return { ...owner, app: found !== undefined, basePath: found ?? null };
});
const EXTERNAL = 'läuft (außerhalb des Managers gestartet, z. B. Entwicklung)';

/** Zustand eines Dienstes inkl. Ampel und Klartext (für Oberfläche, CLI, Tests). */
export async function serviceStatus(key) {
  const sys = await platform.services.status(key).catch(() => ({ installed: false, running: false }));
  const st = readState(key) ?? {};
  const running = sys.installed ? sys.running && isAlive(st.pid) : isAlive(st.pid) && st.phase !== 'stopped';
  const out = { key, title: SERVICE_TITLES[key], installed: sys.installed, running, pid: running ? st.pid : null, since: running ? st.startedAt : null, lastError: st.lastError ?? null };
  if (key === 'webapp') {
    out.port = getConfig().app.port;
    out.url = localAppUrl();
    out.healthy = running && (await checkHealth(out.port));
    out.phase = running ? st.phase : null;
    const ext = running ? null : await foreignOwner(out.port, [st.pid, st.appPid]);
    if (ext?.app) Object.assign(out, { external: true, healthy: true, basePath: ext.basePath });
  } else if (key === 'portal') {
    out.ports = st.ports ?? [];
    out.phase = running ? st.phase : null;
    if (!running && getConfig().portal.enabled) out.external = !!(await foreignOwner(getConfig().portal.httpPort, [st.pid]))?.app;
  } else {
    out.nextRun = running ? st.nextRun : null;
    out.lastRun = st.lastRun ?? null;
  }
  if (out.external) Object.assign(out, { light: 'ok', label: EXTERNAL, lastError: null });
  else if (!running) Object.assign(out, { light: st.phase === 'crashed' || (st.lastError && st.phase !== 'stopped') ? 'error' : 'off', label: 'gestoppt' });
  else if (key === 'webapp' && !out.healthy) Object.assign(out, { light: 'warn', label: { building: 'baut Oberfläche', restarting: 'startet neu' }[st.phase] ?? 'startet' });
  else if (key === 'portal' && st.phase === 'error') Object.assign(out, { light: 'error', label: 'Port belegt' });
  else Object.assign(out, { light: 'ok', label: 'läuft' });
  return out;
}

export const allServices = () => Promise.all(KEYS.map(serviceStatus));
export const isAppRunning = async () => (await serviceStatus('webapp')).running;

/** Wer belegt den Port der Web-App, wenn nicht sie selbst oder eine außerhalb gestartete Mosaik³LAB-App? */
export async function portConflict() {
  const st = readState('webapp');
  const owner = await foreignOwner(getConfig().app.port, [st?.pid, st?.appPid]);
  if (!owner || owner.app) return null;
  return { port: getConfig().app.port, ...owner, message: `Port ${getConfig().app.port} ist belegt durch ${owner.process ?? 'ein anderes Programm'} (PID ${owner.pid}).` };
}

/** Portal-Ports (80/443), die ein anderes Programm belegt (z. B. IIS, nginx, Skype) – mit Hinweisen, was man tun kann. */
export async function portalConflict() {
  const c = getConfig();
  const st = readState('portal');
  const ports = wantedFirewallPorts(c).filter((p) => c.portal.enabled && p !== c.app.port);
  const owners = await Promise.all(ports.map((port) => foreignOwner(port, [st?.pid])));
  return owners.flatMap((owner, i) => (owner && !owner.app ? [{ port: ports[i], ...owner, message: `Port ${ports[i]} ist belegt durch ${owner.process ?? 'ein anderes Programm'} (PID ${owner.pid}).` }] : []));
}

/**
 * Adresse einer außerhalb des Managers gestarteten App auf dem Portal-Port (Entwicklung: Vite auf Port 80 mit /mosaik3lab)
 * – für „Mosaik³LAB öffnen“ statt http://127.0.0.1:<App-Port>. null, wenn das eigene Portal läuft oder dort nichts antwortet.
 */
export async function externalPortalUrl(c = getConfig()) {
  const st = readState('portal');
  if (isAlive(st?.pid) && st.phase !== 'stopped') return null;
  const port = c.portal.httpPort;
  if (port === c.app.port) return null;
  const owner = await foreignOwner(port, [st?.pid]);
  return owner?.app ? `http://127.0.0.1${port === 80 ? '' : `:${port}`}${owner.basePath}/` : null;
}
/** Freier Ausweich-Port für das Portal, wenn 80 belegt ist (oder null). owner(port) → Belegung oder null. */
export async function suggestPortalPort(owner = portOwner) {
  const c = getConfig();
  const ports = [8080, 8081, 8000, 8888].filter((p) => p !== c.app.port && p !== c.portal.httpsPort);
  const busy = await Promise.all(ports.map((p) => owner(p).catch(() => null)));
  return ports.find((_, i) => !busy[i]) ?? null;
}
export const PORTAL_HINT = 'Das andere Programm (z. B. IIS, nginx) beenden oder einen anderen Portal-Port einstellen (z. B. 8080/8443) – oder IIS/nginx als Vorschaltdienst nutzen und die App unter einem Pfad weiterleiten (Beispiele in manager/README.md).';

export async function startService(key) {
  requireValidConfig();
  clearSystemCache(); // vor dem Start die Ports frisch prüfen, danach gehören sie dem Dienst
  if ((await serviceStatus(key)).running) throw new InputError(`${SERVICE_TITLES[key]} läuft bereits.`);
  if (key === 'portal') {
    if (!getConfig().portal.enabled) throw new InputError('Das Portal ist ausgeschaltet.', 'Unter „Netzwerk“ → „Ports“ → „Portal verwenden“ einschalten.');
    const busy = await portalConflict();
    if (busy.length) throw new InputError(busy.map((b) => b.message).join(' '), PORTAL_HINT);
  }
  if (key === 'webapp') {
    const c = await portConflict();
    if (c) throw new InputError(c.message, 'Das andere Programm beenden oder in den Einstellungen einen anderen Port wählen.');
  }
  const sys = await platform.services.status(key).catch(() => ({ installed: false }));
  if (sys.installed) {
    if (!(await platform.services.control(key, 'start'))) await admin(platform.services.controlScript(key, 'start'), `${SERVICE_TITLES[key]} starten`);
  } else {
    // Hintergrundprozess: läuft weiter, auch wenn das Manager-Fenster geschlossen wird.
    fs.mkdirSync(resolvePaths().logDir, { recursive: true });
    const child = spawn(process.execPath, [path.join(MANAGER_DIR, 'runners', `${key}.mjs`), '--config', CONFIG_FILE], { cwd: resolvePaths().programDir, detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, MOSAIK3LAB_SERVICE: '' } });
    child.unref();
    for (let i = 0; i < 20 && readState(key)?.pid !== child.pid; i++) await sleep(250);
  }
  clearSystemCache();
  log().info(`${SERVICE_TITLES[key]} gestartet.`);
  return { started: true };
}

export async function stopService(key) {
  const st = readState(key);
  const sys = await platform.services.status(key).catch(() => ({ installed: false }));
  if (sys.installed) {
    if (!(await platform.services.control(key, 'stop'))) await admin(platform.services.controlScript(key, 'stop'), `${SERVICE_TITLES[key]} stoppen`);
  } else if (isAlive(st?.pid)) {
    fs.writeFileSync(stopFile(key), 'stop'); // der Runner fährt daraufhin sauber herunter
    for (let i = 0; i < 120 && isAlive(st.pid); i++) await sleep(250);
    if (isAlive(st.pid)) {
      await platform.killTree(st.pid);
      if (isAlive(st.appPid)) await platform.killTree(st.appPid);
    }
  }
  for (let i = 0; i < 40 && isAlive(readState(key)?.pid) && readState(key)?.phase !== 'stopped'; i++) await sleep(250);
  clearSystemCache();
  log().info(`${SERVICE_TITLES[key]} gestoppt.`);
  return { stopped: true };
}

export async function restartService(key) {
  if ((await serviceStatus(key)).running) await stopService(key);
  return startService(key);
}

/** Admin-Befehl mit Windows-Bestätigung / sudo; ohne Rechte → Fehler mit Befehl zum Kopieren. */
export async function admin(script, title) {
  log().info(`Admin-Aktion: ${title}`);
  const r = await platform.elevate(script);
  clearSystemCache(); // z. B. Firewall-Regel geändert
  if (!r.ok) {
    const err = new InputError(r.message ?? `${title} ist fehlgeschlagen (Code ${r.code}).`, 'Notfalls den Befehl selbst als Administrator ausführen.');
    err.command = script;
    err.code = r.code;
    err.manual = !!r.manual; // keine Rechte (Dienst, kein sudo) – nicht: Bestätigung abgelehnt
    throw err;
  }
  return r;
}

// ---------- Firewall: ein Schalter „Im Netzwerk freigeben“ ----------
export async function firewallStatus() {
  const c = getConfig();
  const ports = wantedFirewallPorts(c);
  const exists = await Promise.all(ports.map((p) => firewallExists(p).catch(() => null)));
  const known = exists.every((e) => e !== null);
  return {
    active: await firewallActive(),
    network: c.app.network,
    port: ports[0],
    ports,
    rule: FIREWALL_RULE(ports[0]),
    rules: ports.map((p) => FIREWALL_RULE(p)),
    ruleExists: known ? exists.every(Boolean) : null,
    missingPorts: known ? ports.filter((_, i) => !exists[i]) : [],
    profiles: 'Privat, Domäne',
    publicNetwork: await publicNetwork().catch(() => false),
    protocol: 'TCP',
  };
}

/**
 * Freigabe ein/aus: Regeln für die Portal-Ports (ohne Portal: für den Port der App) anlegen/entfernen (ein Klick +
 * Windows-Bestätigung); übrige Regeln von früher (z. B. der alte App-Port) werden entfernt. Läuft die Web-App, wird sie
 * neu gestartet (Host). dryRun zeigt nur den Befehl.
 */
export async function setNetwork(enabled, { dryRun = false } = {}) {
  requireValidConfig();
  const c = getConfig();
  const want = wantedFirewallPorts(c);
  const stale = [];
  for (const p of candidateFirewallPorts(c)) if ((!enabled || !want.includes(p)) && (dryRun || (await firewallExists(p).catch(() => false)))) stale.push(p);
  // Schon vorhandene Regeln nicht noch einmal anlegen: sonst bräuchte jedes Einschalten Adminrechte – auch nachdem die IT
  // die Regel von Hand angelegt hat (der Manager-Dienst hat keine Adminrechte).
  const exists = dryRun || !enabled ? [] : await Promise.all(want.map((p) => firewallExists(p).catch(() => null)));
  const add = enabled ? want.filter((_, i) => exists[i] !== true) : [];
  const script = [...stale.map((p) => platform.firewall.removeScript(p)), ...add.map((p) => platform.firewall.allowScript(p))].join('\n');
  if (dryRun) return { dryRun: true, command: script };
  // Keine aktive Firewall (z. B. Raspberry Pi OS): Ports sind ohnehin offen – nur die Einstellung merken, keine Adminrechte nötig.
  let manual = null;
  if (script && (await firewallActive())) {
    try {
      await admin(script, enabled ? `Firewall: Port ${want.join(', ')} freigeben` : 'Firewall: Freigabe entfernen');
    } catch (err) {
      // Ohne Adminrechte (Manager als Dienst, Linux ohne sudo): Einstellung trotzdem übernehmen und den Befehl für die IT
      // zeigen – sonst ließe sich der Schalter nie umlegen, auch nicht, nachdem die Regel von Hand angelegt wurde.
      // Hat jemand die Windows-Bestätigung abgelehnt, bleibt alles wie es war.
      if (!err.manual) throw err;
      manual = err;
    }
  }
  if (!manual) for (const p of stale) recordManifest({ type: 'firewall', name: FIREWALL_RULE(p), port: p }, false);
  if (enabled) for (const p of want) recordManifest({ type: 'firewall', name: FIREWALL_RULE(p), port: p }); // Deinstallieren entfernt sie (auch von Hand angelegte)
  updateConfig({ app: { network: enabled } });
  if (await isAppRunning()) await restartService('webapp');
  if ((await serviceStatus('portal')).running) await restartService('portal');
  if (manual) {
    throw Object.assign(new InputError(`Gespeichert – ${enabled ? 'aber die Firewall-Regel fehlt noch' : 'die alte Firewall-Regel ist aber noch da'}: ${manual.message}`, enabled ? 'Den Befehl einmal als Administrator ausführen – danach ist Mosaik³LAB im Schulnetz erreichbar.' : 'Den Befehl einmal als Administrator ausführen (nicht dringend: die App hört ohnehin nur noch auf diesem Rechner).'), { command: manual.command, manual: true, saved: true });
  }
  return firewallStatus();
}
