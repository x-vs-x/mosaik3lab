// Mosaik³LAB Server-Manager: eine Seite + JSON-API, hört ausschließlich lokal (127.0.0.1 / ::1).
// Zusätzlich über die App-Adresse <pfad>/manager erreichbar (Portal/Vite-Proxy → hierher; Regeln in lib/remote.mjs).
// Anmeldung immer mit dem Admin-Konto der App (lib/auth.mjs).
//   node manager/server.mjs [--open] [--wait-port]
// Startet immer – auch bei kaputter Konfiguration (Standardwerte + Fehleranzeige) oder fehlenden node_modules der App.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { getConfig, updateConfig, resolvePaths, checkDir, checkAblageDir, countFiles, CONFIG_FILE, MANAGER_DIR, INSTALL, InputError } from './lib/config.mjs';
import { logger, tail, LOGS } from './lib/log.mjs';
import { authStatus, firstAdmin, login, logout, isLoggedIn, needsAdmin } from './lib/auth.mjs';
import { startService, stopService, restartService, isAppRunning, firewallStatus, setNetwork, serviceStatus, localAppUrl, portalConflict, publicNetwork, PORTAL_HINT, KEYS } from './lib/services.mjs';
import { createBackup, restoreBackup } from './lib/backup.mjs';
import { transferData, hasData } from './lib/transfer.mjs';
import { npmAudit, WHAT as RUNTIMES } from './lib/runtime.mjs';
import { install, proposal, STEPS, ROLLBACK_STEP } from './lib/setup.mjs';
import { pageStatus, appAddresses } from './lib/status.mjs';
import { startAutomation, afterChange, checkUpdates, checkRuntime, checkDrift } from './lib/auto.mjs';
import { reconcile } from './lib/reconcile.mjs';
import { loadCert, saveCert, removeCert, generateCert, publicCert, inspectCertCached, portalUrls } from './lib/portalcert.mjs';
import { configureBackupPassword } from './lib/backupcrypto.mjs';
import { mailSettings, saveMail, sendTestMail } from './lib/mail.mjs';
import { platform } from './platform/index.mjs';
import { remoteOf, isAppAdmin, deniedPage } from './lib/remote.mjs';
import { istPaketInstallation, pruefen as updatePruefen, starten as updateStarten, zustand as updateZustand } from './lib/updates.mjs';

const log = logger('manager');
const TOKEN = crypto.randomBytes(24).toString('hex'); // Pflicht-Header für Schreibaktionen (Schutz vor CSRF)
const PUBLIC = path.join(MANAGER_DIR, 'public');
const args = new Set(process.argv.slice(2));
let port = Number(process.env.MANAGER_PORT) || getConfig().manager.port;

// ---------- Hintergrundaufträge (Einrichtung, Update) ----------
let setupJob = null;
const PAKET_REPARIEREN = `Reparieren oder neu einrichten: das Installer-Paket erneut ausführen (${platform.id === 'windows' ? 'Installieren.cmd' : 'sudo ./installieren.sh'}) – Daten und Einstellungen bleiben erhalten.`;
function runSetup(body) {
  if (setupJob?.phase === 'läuft') throw new InputError('Die Einrichtung läuft bereits.');
  // Paket-Installation: Der Manager läuft als eingeschränkter Dienst (Programmordner gehört Admin/root) – Einrichten und
  // Reparieren gehen nur mit Adminrechten über das Installer-Paket (das Gleiche wie hier, mit Sicherung und Rückfall).
  if (istPaketInstallation() && !body.dryRun) throw new InputError(PAKET_REPARIEREN, 'Ordner und Ports ändert man hier in den Reitern, ohne neu einzurichten.');
  const job = (setupJob = { phase: 'läuft', dryRun: !!body.dryRun, steps: STEPS.map(([id, title]) => ({ id, title, status: 'offen' })) });
  const report = (id, status, detail) => {
    if (id === ROLLBACK_STEP[0] && !job.steps.some((s) => s.id === id)) job.steps.push({ id, title: ROLLBACK_STEP[1] });
    Object.assign(job.steps.find((s) => s.id === id), { status, detail });
  };
  install(body.input ?? {}, report, { dryRun: !!body.dryRun })
    .then((r) => {
      job.phase = 'fertig';
      job.backupPassword = r.backupPassword ?? undefined; // nur hier, einmalig
      // Nach echter Einrichtung mit Diensten übernimmt der Manager-Dienst: dieser Prozess beendet sich.
      if (!body.dryRun && body.input?.services !== false && r.steps.some((s) => s.id === 'start' && s.status === 'fertig')) {
        job.handover = true;
        setTimeout(() => platform.services.control('manager', 'start').finally(() => process.exit(0)), 1500);
      }
    })
    .catch((err) => Object.assign(job, { phase: 'fehler', error: err.message, hint: err.hint, command: err.command, needsInput: err.needsInput }));
  return { started: true };
}

const updateStateFile = () => path.join(resolvePaths().logDir, 'update.state.json');
function startUpdate() {
  if (!INSTALL) throw new InputError('Updates gibt es nach der Einrichtung. In der Arbeitskopie: git pull.');
  const child = spawn(process.execPath, [path.join(MANAGER_DIR, 'runners', 'update.mjs'), '--config', CONFIG_FILE], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return { started: true };
}

const runtimeStateFile = () => path.join(resolvePaths().logDir, 'runtime.state.json');
function startRuntimeUpdate(what) {
  if (!RUNTIMES.includes(what)) throw new InputError('Unbekannte Laufzeit.');
  if (!INSTALL) throw new InputError('Laufzeit-Updates gibt es nach der Einrichtung.', 'In der Arbeitskopie: Befehl aus dem Protokoll selbst ausführen oder: node manager/cli.mjs runtime update ' + what + ' --dry-run');
  const child = spawn(process.execPath, [path.join(MANAGER_DIR, 'runners', 'runtime.mjs'), '--config', CONFIG_FILE, '--what', what], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return { started: true };
}

/**
 * Einstellungsdialog speichern. Datenordner und Ablageordner nur bei gestoppter Web-App.
 * Datenordner: vorher Backup, Daten werden kopiert. Ablage: Ziel wird geprüft (beschreibbar, freier Platz);
 * vorhandene Dateien werden nur auf Wunsch (moveAblage) kopiert – der alte Ordner bleibt als Sicherung liegen.
 */
async function saveSettings(b) {
  const c = getConfig();
  const p = resolvePaths();
  const patch = { app: { port: b.appPort ?? c.app.port }, backup: { enabled: b.backupEnabled ?? c.backup.enabled, time: b.backupTime ?? c.backup.time, keep: b.backupKeep ?? c.backup.keep }, paths: { backupDir: b.backupDir ?? c.paths.backupDir, ablageDir: b.ablageDir ?? c.paths.ablageDir } };
  const newData = b.dataDir !== undefined ? checkDir(b.dataDir, 'Datenordner') : c.paths.dataDir;
  if (newData && newData !== p.dataDir) {
    if (await isAppRunning()) throw new InputError('Den Datenordner bitte nur bei gestoppter Web-App ändern.', 'Web-App stoppen, dann erneut speichern.');
    if (hasData(p.dataDir)) await createBackup('vor Wechsel des Datenordners');
    // Datenbank (konsistent über db:backup) + JSON-Reste übertragen und die Anzahlen vergleichen; die Ablage zieht mit,
    // wenn sie im Standardordner unter dem Datenordner liegt (sonst bleibt ihr eigener Ordner).
    if (!hasData(newData)) {
      const t = await transferData({ from: p.dataDir, to: newData, programDir: p.programDir });
      log.info(`Datenordner gewechselt: ${p.dataDir} → ${newData} (${t.tables} Tabellen, ${t.rows} Zeilen, ${t.files} Dateien geprüft)`);
    }
    if (!c.paths.ablageDir) b.moveAblage = true;
    patch.paths.dataDir = newData;
  }
  let ablageNote = '';
  const newAblage = b.ablageDir !== undefined ? (b.ablageDir ? checkDir(b.ablageDir, 'Ablage') : '') : c.paths.ablageDir;
  const target = resolvePaths({ ...c, paths: { ...c.paths, ...patch.paths, ablageDir: newAblage } }).ablageDir;
  if (target !== p.ablageDir) {
    if (await isAppRunning()) throw new InputError('Den Ablageordner bitte nur bei gestoppter Web-App ändern.', 'Web-App stoppen, dann erneut speichern.');
    const { files: present } = checkAblageDir(target);
    const old = countFiles(p.ablageDir);
    if (old && b.moveAblage) {
      if (present) throw new InputError(`Der neue Ablageordner enthält bereits ${present} Datei(en) – Dateien werden nicht vermischt.`, 'Einen leeren Ordner wählen oder ohne „Dateien mitnehmen“ speichern.');
      fs.cpSync(p.ablageDir, target, { recursive: true });
      if (countFiles(target) !== old) throw new Error('Kopieren der Ablage unvollständig – bitte prüfen.');
      ablageNote = `${old} Datei(en) nach ${target} kopiert; der alte Ordner ${p.ablageDir} bleibt als Sicherung liegen.`;
      log.info(`Ablage kopiert: ${p.ablageDir} → ${target} (${old} Dateien)`);
    } else if (old) {
      ablageNote = `Achtung: ${old} vorhandene Datei(en) liegen noch in ${p.ablageDir}. Bitte nach ${target} verschieben, sonst fehlen Bilder und Druckdateien.`;
    }
  }
  patch.paths.ablageDir = newAblage;
  updateConfig(patch);
  log.info('Einstellungen gespeichert.');
  // Automatisch angleichen: Firewall-Regel (z. B. bei Portwechsel), Ordner, Web-App mit neuem Port neu starten.
  const abgleich = await afterChange();
  return { settings: settings(), restartNeeded: false, ablageNote, reconcile: abgleich };
}
/** Erreichbarkeit: Portal-Einstellungen + Zertifikatsstatus + Adressen (für den Einstellungsdialog und die Karte). */
async function portalInfo() {
  const c = getConfig();
  return { ...c.portal, urls: portalUrls(c), openUrl: localAppUrl(c), certificate: await inspectCertCached(), conflicts: c.portal.enabled ? await portalConflict().catch(() => []) : [], hint: PORTAL_HINT };
}
/** Portal-Einstellungen speichern; die Web-App läuft danach mit neuem Pfad/HTTPS-Modus neu, Firewall/Ordner gleicht reconcile an. */
async function savePortal(b) {
  const old = getConfig().portal;
  // Der Pfad ist fest (/mosaik3lab, siehe config.mjs) – ein mitgeschickter basePath wird nicht übernommen.
  const patch = { enabled: b.enabled ?? old.enabled, httpPort: b.httpPort ?? old.httpPort, httpsPort: b.httpsPort ?? old.httpsPort, https: b.https ?? old.https };
  if (patch.https === true && patch.enabled && !loadCert()) throw new InputError('Für HTTPS ist noch kein Zertifikat hinterlegt.', 'Zuerst „Zertifikat erzeugen“ oder ein Zertifikat hinterlegen.');
  const next = updateConfig({ portal: patch }).portal;
  const changed = ['enabled', 'basePath', 'https'].some((k) => next[k] !== old[k]);
  if (changed && (await isAppRunning())) await restartService('webapp'); // Basis-Pfad und HTTPS-Modus stellt die App beim Start ein
  if (next.enabled && !(await serviceStatus('portal')).running && (await serviceStatus('webapp')).running) await startService('portal').catch((err) => log.warn(`Portal nicht gestartet: ${err.message}`));
  const abgleich = await afterChange({ restart: false });
  log.info(`Portal-Einstellungen gespeichert (${next.enabled ? `an, Pfad ${next.basePath || '/'}, Port ${next.httpPort}${next.https ? `/${next.httpsPort} HTTPS` : ''}` : 'aus'}).`);
  return { portal: await portalInfo(), reconcile: abgleich };
}
const settings = () => {
  const c = getConfig();
  const p = resolvePaths();
  return { appPort: c.app.port, network: c.app.network, managerPort: c.manager.port, dataDir: p.dataDir, ablageDir: p.ablageDir, backupDir: p.backupDir, backupEnabled: c.backup.enabled, backupTime: c.backup.time, backupKeep: c.backup.keep, mode: p.mode, configFile: CONFIG_FILE };
};

// ---------- API ----------
// [Methode, Pfad, Beschreibung, Handler, öffentlich?]
const key = (p) => {
  if (!KEYS.includes(p.key)) throw Object.assign(new Error('Unbekannter Dienst.'), { status: 404 });
  return p.key;
};
const ROUTES = [
  ['GET', '/api', 'Liste aller Endpunkte', () => ROUTES.map(([m, p, d]) => ({ method: m, path: p, description: d })), true],
  ['GET', '/api/auth', 'Anmeldestatus { loggedIn, remote, needsAdmin, managerPort }', ({ req, remote }) => authStatus(req, remote), true],
  ['POST', '/api/auth/login', 'Anmelden direkt am Server mit dem Admin-Konto der App { email, password } (5 Fehlversuche → 60 s Sperre)', async ({ body, res, remote }) => {
    if (remote) throw new InputError('Über die App-Adresse genügt die Anmeldung in Mosaik³LAB.');
    try {
      return await login(body.email, body.password, res);
    } catch (err) {
      log.warn(`Anmeldung am Manager abgelehnt: ${err.message}`);
      throw err;
    }
  }, true],
  ['POST', '/api/auth/first', 'Ersten Administrator der App anlegen { email, name, password, schulDomain? } (schulDomain: erlaubte E-Mail-Domain einer neuen Installation, sonst die der Adresse) – nur solange es keinen gibt (direkt am Server und über das Netz)', async ({ body, res, remote }) => {
    try {
      const r = await firstAdmin(body, res, remote);
      log.info(`Erster Administrator angelegt (${remote ? `über das Netz von ${remote.ip}` : 'direkt am Server'}).`);
      return r;
    } catch (err) {
      if (remote) log.warn(`Ersteinrichtung über das Netz abgelehnt (${remote.ip}): ${err.message}`);
      throw err;
    }
  }, true],
  ['GET', '/api/auth/erstzugang', 'Adressen für die Ersteinrichtung { managerUrls, localUrl, publicNetwork } – nur direkt am Server, nur solange es keinen Administrator gibt (zeigt der Installer an)', async ({ remote }) => {
    if (remote) throw Object.assign(new InputError('Nur direkt am Server.'), { status: 403 });
    if (!(await needsAdmin())) throw Object.assign(new InputError('Es gibt bereits einen Administrator.'), { status: 404 });
    const a = appAddresses();
    const mgr = (u) => `${u.replace(/\/$/, '')}/manager/`;
    return { managerUrls: a.network.map(mgr), localUrl: `http://127.0.0.1:${port}/`, publicNetwork: getConfig().app.network ? await publicNetwork().catch(() => false) : false };
  }, true],
  ['POST', '/api/auth/logout', 'Abmelden', ({ req, res }) => logout(req, res), true],
  ['GET', '/api/status', 'Alles für die Seite: Ampel, Dienste, Hinweise, Sicherungen, Version', () => pageStatus()],
  ['POST', '/api/services/:key/start', 'Dienst starten (webapp|backup)', ({ params }) => startService(key(params))],
  ['POST', '/api/services/:key/stop', 'Dienst stoppen', ({ params }) => stopService(key(params))],
  ['POST', '/api/services/:key/restart', 'Dienst neu starten', ({ params }) => restartService(key(params))],
  ['GET', '/api/firewall', 'Freigabe im Netzwerk: { network, port, rule, ruleExists }', () => firewallStatus()],
  ['POST', '/api/firewall', 'Freigabe ein/aus { enabled, dryRun } – mit Windows-Bestätigung/sudo', async ({ body }) => {
    const r = await setNetwork(body.enabled === true, { dryRun: !!body.dryRun });
    if (!body.dryRun) await checkDrift();
    return r;
  }],
  ['POST', '/api/backup', 'Jetzt sichern: ganzes System (Datenbank + Ablage), mit Prüfung', () => createBackup('manuell')],
  ['POST', '/api/backup/restore', 'Wiederherstellen { id, confirm: id, autoStop? } – bei gestoppter Web-App; autoStop: Web-App dafür stoppen und danach wieder starten', async ({ body }) => {
    const wasRunning = await isAppRunning();
    if (wasRunning && body.autoStop !== true) throw new InputError('Bitte zuerst die Web-App stoppen.', 'Karte „Dienste“ → Web-App → Stoppen.');
    if (wasRunning) await stopService('webapp');
    let r;
    try {
      r = await restoreBackup(body.id, body.confirm, { password: typeof body.password === 'string' && body.password ? body.password : undefined });
    } finally {
      if (wasRunning && !r) await startService('webapp').catch(() => {}); // Fehler: alter Stand läuft wieder
    }
    const abgleich = await afterChange({ restart: false, paths: body.paths ?? {} }); // System an die wiederhergestellte Datenbank angleichen
    if (wasRunning) await startService('webapp');
    return { ...r, reconcile: abgleich, restarted: wasRunning };
  }],
  ['POST', '/api/reconcile', 'Abgleichen { dryRun, paths: { ablageDir?, backupDir?, logDir? } } – Firewall, Ports, Ordner, Dienste aus der Datenbank ableiten', ({ body }) => (body.dryRun ? reconcile({ dryRun: true, paths: body.paths ?? {} }) : afterChange({ paths: body.paths ?? {} }))],
  ['POST', '/api/backup/password', 'Backup-Passwort { password } | { generate: true } | { disable: true } – erzeugtes Passwort nur in dieser Antwort', ({ body }) => configureBackupPassword({ password: body.password, generate: body.generate === true, disable: body.disable === true })],
  ['POST', '/api/update/check', 'Nach Updates suchen (Paket-Installation: freigegebene Versionen aus der Paketquelle, sonst Git; läuft sonst automatisch) → Zustand wie GET /api/update', async () => {
    if (istPaketInstallation()) {
      const z = await updatePruefen();
      await checkUpdates();
      return z;
    }
    const u = await checkUpdates();
    if (!u) throw new InputError('Updates gibt es nach der Einrichtung. In der Arbeitskopie: git pull.');
    if (u.error) throw new InputError(u.error);
    return u;
  }],
  ['POST', '/api/update/install', 'Update installieren – Paket: herunterladen, prüfen, Update-Helfer startet (Sicherung vorher, Rückfall bei Fehler); Git: eigener Prozess', () => (istPaketInstallation() ? updateStarten() : startUpdate())],
  ['GET', '/api/update', 'Updates: installierte Version, verfügbare Versionen, Download und Fortschritt (Paket) bzw. Fortschritt des Git-Updates', () => {
    if (istPaketInstallation()) return updateZustand();
    try { return JSON.parse(fs.readFileSync(updateStateFile(), 'utf8')); } catch { return null; }
  }],
  ['GET', '/api/runtime', 'Laufzeit: Node.js, Git, Dienst-Wrapper mit Ampel (Abfrage nodejs.org, offline → „unbekannt“; läuft sonst automatisch täglich)', () => checkRuntime()],
  ['POST', '/api/runtime/audit', 'npm audit --omit=dev als Information', () => npmAudit()],
  ['POST', '/api/runtime/update', 'Laufzeit aktualisieren { what: node|git|wrapper } (eigener Prozess; Sicherung, Dienste stoppen/starten, Health-Check)', ({ body }) => startRuntimeUpdate(body.what)],
  ['GET', '/api/runtime/progress', 'Fortschritt des letzten Laufzeit-Updates', () => { try { return JSON.parse(fs.readFileSync(runtimeStateFile(), 'utf8')); } catch { return null; } }],
  ['GET', '/api/portal', 'Erreichbarkeit: Portal (Pfad, Ports, HTTPS), Adressen, Zertifikat-Prüfung, belegte Ports', () => portalInfo()],
  ['POST', '/api/portal', 'Portal speichern { enabled, httpPort, httpsPort, https } – Pfad fest /mosaik3lab (danach Abgleich)', ({ body }) => savePortal(body)],
  ['POST', '/api/portal/cert/generate', 'Zertifikat am Server erzeugen (Rechnername + IP, 5 Jahre; als Datei, nichts im Zertifikatspeicher)', async () => ({ certificate: await generateCert(), portal: await portalInfo() })],
  ['POST', '/api/portal/cert/upload', 'Zertifikat hinterlegen { pfx (Base64), passphrase } oder { cert, key } (PEM)', async ({ body }) => ({ certificate: await saveCert(body), portal: await portalInfo() })],
  ['POST', '/api/portal/cert/remove', 'Zertifikat entfernen (nur bei ausgeschaltetem HTTPS)', async () => {
    if (getConfig().portal.https) throw new InputError('HTTPS ist eingeschaltet – zuerst HTTPS ausschalten.');
    removeCert();
    return { portal: await portalInfo() };
  }],
  ['GET', '/api/settings', 'Einstellungen für den Dialog', () => settings()],
  ['POST', '/api/settings', 'Einstellungen speichern { appPort, dataDir, ablageDir, moveAblage?, backupEnabled, backupDir, backupTime, backupKeep }', ({ body }) => saveSettings(body)],
  ['GET', '/api/mail', 'E-Mail bei neuen Anfragen (ohne Passwort)', () => mailSettings()],
  ['POST', '/api/mail', 'Mail speichern { enabled, host, port, secure, user, password?, clearPassword?, from, recipients[], appBaseUrl } – appBaseUrl leer = Adresse der App automatisch', ({ body }) => {
    const auto = appAddresses();
    return saveMail({ ...body, appBaseUrl: String(body.appBaseUrl ?? '').trim() || (auto.network[0] ?? auto.local).replace(/\/$/, '') });
  }],
  ['POST', '/api/mail/test', 'Testmail senden { to? } – über das Skript der App', ({ body }) => sendTestMail(body.to?.trim() || undefined)],
  ['GET', '/api/setup', 'Vorschlag und Fortschritt der Einrichtung (paket: Text, wie man eine Paket-Installation repariert)', () => ({ proposal: proposal(), job: setupJob, paket: istPaketInstallation() ? PAKET_REPARIEREN : null })],
  ['POST', '/api/setup', 'Einrichten { input, dryRun }', ({ body }) => runSetup(body)],
  ['GET', '/api/logs', 'Letzte 100 Zeilen (?which=app|manager|backup|update|portal|helfer)', ({ query }) => tail(LOGS.includes(query.get('which')) ? query.get('which') : 'app', 100)],
];

function match(method, pathname) {
  for (const [m, pattern, , handler, isPublic] of ROUTES) {
    if (m !== method) continue;
    const a = pattern.split('/');
    const b = pathname.split('/');
    const params = {};
    if (a.length === b.length && a.every((s, i) => (s.startsWith(':') ? ((params[s.slice(1)] = b[i]), true) : s === b[i]))) return { handler, params, isPublic };
  }
  return null;
}

// ---------- HTTP ----------
const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'" }; // <base href> = Pfad (direkt „/“, über die App-Adresse „/<pfad>/manager/“)
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': `${type}; charset=utf-8`, ...HEADERS });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const hosts = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => (size += c.length) > 400 * 1024 ? (req.destroy(), reject(Object.assign(new Error('Anfrage zu groß.'), { status: 413 }))) : chunks.push(c));
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {});
      } catch {
        reject(Object.assign(new Error('Ungültiges JSON.'), { status: 400 }));
      }
    });
  });
}

// Über die App-Adresse ist alles erlaubt, was auch direkt am Server geht. Was den Zugang kappen kann (Port, Pfad,
// Netzfreigabe, Web-App/Portal stoppen), bestätigt die Oberfläche vorher; der Notzugang 127.0.0.1:<Port> bleibt immer.
// Ausnahme Ersteinrichtung: solange es keinen Administrator gibt, sind über das Netz nur die Seite selbst, der
// Anmeldestatus und „ersten Administrator anlegen“ erreichbar – sonst nichts.
const SETUP_OPEN = new Set(['GET /', 'GET /app.css', 'GET /app.js', 'GET /ui.js', 'GET /update.js', 'GET /neuigkeiten.js', 'GET /erweitert.js', 'GET /einstellungen.js', 'GET /icon.svg', 'GET /api/auth', 'POST /api/auth/first']);
/** Zugang über die App-Adresse: nur mit Admin-Sitzung der App (oder Ersteinrichtung). → true, wenn schon geantwortet. */
async function remoteDenied(req, res, url, remote) {
  if (await needsAdmin()) {
    if (SETUP_OPEN.has(`${req.method} ${url.pathname}`)) return false;
    send(res, 403, { error: 'Zuerst den ersten Administrator anlegen.', code: 'setup' });
    return true;
  }
  if (await isAppAdmin(req, getConfig().app.port, remote.appBase)) return false;
  const text = 'Nur für Administratoren: Bitte zuerst in Mosaik³LAB als Administrator anmelden.';
  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) send(res, 403, deniedPage(text, remote.appBase), 'text/html');
  else send(res, 403, { error: text, code: 'app-admin' });
  return true;
}

async function handle(req, res) {
  if (!hosts().has(String(req.headers.host).toLowerCase())) return send(res, 403, { error: 'Nur über localhost erreichbar.' });
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    const remote = remoteOf(req); // null = direkt am Server (wie bisher)
    if (remote && (await remoteDenied(req, res, url, remote))) return;
    const file = { '/': 'index.html', '/app.css': 'app.css', '/app.js': 'app.js', '/ui.js': 'ui.js', '/update.js': 'update.js', '/neuigkeiten.js': 'neuigkeiten.js', '/erweitert.js': 'erweitert.js', '/einstellungen.js': 'einstellungen.js', '/icon.svg': 'icon.svg' }[url.pathname];
    if (req.method === 'GET' && file) return send(res, 200, fs.readFileSync(path.join(PUBLIC, file), 'utf8').replace('__TOKEN__', TOKEN).replace('__BASE__', remote ? `${remote.prefix}/` : '/'), TYPES[path.extname(file)]);
    if (req.method === 'GET' && url.pathname === '/api/portal/cert.cer') {
      if (!remote && !isLoggedIn(req)) return send(res, 401, { error: 'Bitte anmelden.' });
      const pub = await publicCert();
      if (!pub) return send(res, 404, { error: 'Es ist kein Zertifikat hinterlegt.' });
      res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="mosaik3lab.cer"', ...HEADERS });
      return res.end(pub.der);
    }
    const route = match(req.method, url.pathname);
    if (!route) return send(res, 404, { error: 'Unbekannte Adresse.' });
    if (!route.isPublic && !remote && !isLoggedIn(req)) return send(res, 401, { error: 'Bitte anmelden.' });
    let body = {};
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      const originOk = !origin || (remote ? origin === remote.origin : hosts().has(origin.replace('http://', '')));
      if (req.headers['x-manager-token'] !== TOKEN || !originOk) return send(res, 403, { error: 'Sicherheitsprüfung fehlgeschlagen – Seite neu laden.' });
      if (!String(req.headers['content-type']).startsWith('application/json')) return send(res, 415, { error: 'JSON erwartet.' });
      body = await readJson(req);
    }
    send(res, 200, (await route.handler({ req, res, body, params: route.params, query: url.searchParams, remote })) ?? { ok: true });
  } catch (err) {
    const code = err.status ?? 500;
    if (code >= 500) log.error(`${req.method} ${url.pathname}: ${err.stack ?? err.message}`);
    send(res, code, { error: code >= 500 ? `Interner Fehler: ${err.message}` : err.message, hint: err.hint ?? (code >= 500 ? 'Protokoll „Manager“ ansehen.' : undefined), command: err.command });
  }
}

// Bis 1.1.3 gab es einen Einrichtungscode – eine übrig gebliebene Datei wird nicht mehr gebraucht.
try {
  fs.rmSync(path.join(resolvePaths().logDir, 'einrichtungscode.txt'), { force: true });
} catch {
  /* ohne Bedeutung */
}

/** Läuft auf dem Port schon ein Manager? Dann nur dessen Fenster öffnen. Sonst Ausweichport. */
async function listen() {
  for (let attempt = 0; ; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const s = http.createServer(handle).once('error', reject).listen(port, '127.0.0.1', () => {
          http.createServer(handle).once('error', () => {}).listen(port, '::1'); // IPv6-localhost, falls vorhanden
          resolve();
        });
      });
      return;
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
      if (args.has('--wait-port') && attempt < 30) {
        await new Promise((r) => setTimeout(r, 1000)); // Übergabe/Neustart: alter Prozess gibt den Port gleich frei
        continue;
      }
      const running = await fetch(`http://127.0.0.1:${port}/api/auth`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);
      if (running) {
        if (args.has('--open')) platform.openAppWindow(`http://127.0.0.1:${port}/`);
        console.log(`Der Manager läuft bereits: http://127.0.0.1:${port}/`);
        process.exit(0);
      }
      if (port >= getConfig().manager.port + 9) throw new Error('Kein freier Port gefunden.');
      log.warn(`Port ${port} ist von einem anderen Programm belegt – weiche auf ${port + 1} aus.`);
      port++;
    }
  }
}

try {
  await listen();
} catch (err) {
  log.error(`Manager konnte nicht starten: ${err.message}`);
  process.exit(1);
}
log.info(`Server-Manager: http://127.0.0.1:${port}/ (${resolvePaths().mode})`);
if (args.has('--open')) platform.openAppWindow(`http://127.0.0.1:${port}/`);
if (process.env.MOSAIK3LAB_NO_AUTOMATION !== '1') startAutomation(); // Abgleichen, Backup-Dienst, Update-/Laufzeit-Prüfung (lib/auto.mjs)

// Neustart nach Update: als Dienst beenden (die Dienststeuerung startet neu), sonst neuen Prozess starten.
setInterval(() => {
  const f = path.join(resolvePaths().logDir, 'manager.restart');
  if (!fs.existsSync(f)) return;
  fs.rmSync(f, { force: true });
  log.info('Neustart nach Update.');
  if (process.env.MOSAIK3LAB_SERVICE === '1') process.exit(75);
  spawn(process.execPath, [path.join(INSTALL.programRoot, 'current', 'manager', 'server.mjs'), '--wait-port'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  process.exit(0);
}, 2000).unref();

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => process.exit(0)); // Web-App und Backup laufen weiter
