// Einrichtung und Update per Installer-Paket – „wie ein normal installiertes Programm“ (Deinstallation: deinstallieren.mjs).
//
// Einrichten kopiert das Programm aus diesem Ordner (Arbeitskopie/Download) in den Programmordner
//   <Programmordner>/releases/<version>  +  Verweis „current“  +  install.json
// und legt Daten getrennt davon an: <Datenordner>/{daten, ablage, backups, logs} sowie den Verwaltungsordner (dienste,
// werkzeuge, install-manifest.json – Windows im Programmordner, sonst <Datenordner>/manager).
// Danach: Abhängigkeiten, Build, Dienste, ggf. Firewall, Verknüpfungen, Start. Jeder Schritt ist idempotent,
// mit dryRun nur angezeigt. Jede Systemänderung steht im install-manifest.json (manifest.mjs) –
// daraus weiß die Deinstallation genau, was zu entfernen ist.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { platform, SERVICE_IDS, SERVICE_TITLES, FIREWALL_RULE } from '../platform/index.mjs';
import { run, runShell } from '../platform/common.mjs';
import { DEFAULTS, INSTALL, PROGRAM_DIR, MANAGER_DIR, resolvePaths, validate, writeJsonAtomic, saveConfigTo, configFromDb, countFiles, checkDir, checkPort, layout, isInside, requireValidConfig, InputError } from './config.mjs';
import * as settingsdb from './settingsdb.mjs';
import { generatePassword, saveBackupPassword } from './backupcrypto.mjs';
import { openBackup, applyBackup } from './backup.mjs';
import { transferData, hasData } from './transfer.mjs';
import { releaseSchemaVersion } from './schema.mjs';
import { einrichtungSperren } from './sperre.mjs';
import { refuseDowngrade, refuseOlderVersion, backupWithInstalled, restoreDbFrom, rollBack, umschalten, alteVersionenEntfernen } from './paketupdate.mjs';
import { currentRelease, prune as pruneReleases } from './releases.mjs';
import { removeTree, linkWorkspaces } from './dateien.mjs';
import { logger, append, logFile } from './log.mjs';
import { admin, checkHealth, wantedFirewallPorts } from './services.mjs';
import { startAbbruch } from './startwache.mjs';
import { activeAdminCount, checkAdminInput, createAdmin } from './admin.mjs';
import { appRunnable } from './appstart.mjs';
import { readManifest, recordManifest, setManifestTarget } from './manifest.mjs';
import { paketVersion, schreibprobe } from './hilfen.mjs';

const log = () => logger('manager');
export const MIN_NODE = [24, 0]; // node:sqlite (Datenbank der App und Einstellungen des Managers)
export const nodeOk = () => {
  const [a, b] = process.versions.node.split('.').map(Number);
  return a > MIN_NODE[0] || (a === MIN_NODE[0] && b >= MIN_NODE[1]);
};
const version = (dir) => paketVersion(dir) ?? '0.0.0';

// ---------- Einrichtung ----------
export const STEPS = [
  ['check', 'System prüfen'],
  ['folders', 'Ordner anlegen'],
  ['program', 'Programm in den Programmordner kopieren'],
  ['config', 'Einstellungen und Daten übernehmen'],
  ['restore', 'Aus Backup wiederherstellen (Datenbank, Einstellungen, Ablage)'],
  ['deps', 'Abhängigkeiten installieren (npm ci)'],
  ['build', 'Oberfläche bauen'],
  ['admin', 'Admin-Konto anlegen'],
  ['services', 'Dienste einrichten (Web-App, Backup, Manager)'],
  ['firewall', 'Firewall-Freigabe'],
  ['shortcuts', 'Verknüpfungen (Desktop, Startmenü)'],
  ['start', 'Dienste starten'],
];
export const ROLLBACK_STEP = ['rollback', 'Rückfall auf die vorige Version']; // nur nach einem fehlgeschlagenen Update gemeldet

export function proposal() {
  const l = layout({ programRoot: INSTALL?.programRoot, dataRoot: INSTALL?.dataRoot });
  return { programRoot: l.programRoot, dataRoot: l.dataRoot, backupDir: l.backups, logDir: l.logs, platform: platform.label, untested: !!platform.untested, nodeVersion: process.version, nodeOk: nodeOk(), nodeInstall: platform.nodeInstall, needsWrapper: !!platform.wrapper };
}

const writable = (dir) => !schreibprobe(dir);

/** Kopierfilter: keine Laufzeitdaten, Logs, Git-Daten, Builds; node_modules und Build nur auf Wunsch (Installer-Paket). */
const copyFilter = (copyDeps, keepDist = false) => (src) => {
  const rel = path.relative(PROGRAM_DIR, src).split(path.sep);
  if (rel[0] === '') return true;
  if (['.git', 'storage', 'backups', '.claude', 'mosaik3lab.config.json'].includes(rel[0])) return false;
  if (rel[0] === 'manager' && /^(logs|manager\.config\.json.*|install-manifest\.json)$/.test(rel[1] ?? '')) return false;
  if (rel[0] === 'client' && rel[1] === 'dist' && !keepDist) return false;
  return copyDeps || !rel.includes('node_modules');
};

/**
 * input: { programRoot, dataRoot, appPort, network, backupTime, backupKeep, downloadWrapper,
 *          services=true, shortcuts=true, copyDeps=false, copyData=true, backupEncrypt=true, backupPassword,
 *          fromBackup: { dir, password, paths: { ablageDir, backupDir, logDir } }  (Einrichten aus einer Sicherung: alle Einstellungen
 *          kommen aus deren Datenbank; password nur bei verschlüsselter Sicherung),
 *          admin: { email, name, password } (erstes Administrator-Konto; entfällt bei fromBackup oder wenn schon ein Admin existiert),
 *          dataFrom/ablageFrom (bisherige Daten übernehmen; Standard: Ordner der Arbeitskopie),
 *          systemDryRun (Dienste, Firewall, Verknüpfungen, Start nur anzeigen), skipBuild (npm ci und Build überspringen – Tests),
 *          prebuilt (Installer-Paket: gebündelter Server server/dist und client/dist liegen bei → mitkopieren, kein npm ci,
 *          kein Build) }
 * Liegt im Datenordner schon eine Einrichtung (Startdatei + Datenbank), bleiben deren Einstellungen unverändert.
 * report(stepId, status, detail) meldet den Fortschritt.
 */
export async function install(input, report = () => {}, { dryRun = false } = {}) {
  if (!dryRun) requireValidConfig();
  const programRoot = checkDir(input.programRoot ?? proposal().programRoot, 'Programmordner', { allowEmpty: false });
  const dataRoot = checkDir(input.dataRoot ?? proposal().dataRoot, 'Datenordner', { allowEmpty: false });
  const L = layout({ programRoot, dataRoot, backupDir: input.backupDir ? checkDir(input.backupDir, 'Backup-Ziel') : undefined, logDir: input.logDir ? checkDir(input.logDir, 'Protokolle') : undefined });
  if ([L.daten, L.ablage, L.backups].some((d) => isInside(d, programRoot)) || isInside(programRoot, L.daten)) throw new InputError('Daten, Ablage und Sicherungen müssen außerhalb des Programmordners liegen.');
  let appPort = checkPort(input.appPort ?? DEFAULTS.app.port, 'Port der Web-App');
  let network = !!input.network;
  // Portal (Port 80/443 → Web-App unter /mosaik3lab): bei neuer Einrichtung standardmäßig an; input.portal = false schaltet es aus
  let portal = { enabled: input.portal !== false, basePath: input.portal === false ? (input.basePath ?? DEFAULTS.portal.basePath) : DEFAULTS.portal.basePath, httpPort: Number(input.httpPort ?? 80), httpsPort: 443, https: false }; // Pfad mit Portal fest
  const sysDry = !!input.systemDryRun; // Systemänderungen nur anzeigen
  let generatedBackupPassword = null;
  const dirs = { storage: L.daten, ablage: L.ablage, backups: L.backups, logs: L.logs, manager: L.manager, services: L.services, tools: L.tools };
  const configFile = L.configFile;
  const id = `${version(PROGRAM_DIR)}-${await gitCommit()}`; // gleiche Quelle → gleiche Version (idempotent)
  const current = path.join(programRoot, 'current');
  const onOutput = input.onOutput ?? ((t) => append(logFile('manager'), t)); // Ausgabe von npm ins Protokoll
  const steps = [];
  const step = async (sid, fn) => {
    report(sid, 'läuft');
    try {
      const r = (await fn()) ?? {};
      const status = r.skip ? 'übersprungen' : dryRun || r.planned ? 'geplant' : 'fertig';
      report(sid, status, r.detail);
      steps.push({ id: sid, status, detail: r.detail, command: r.command });
    } catch (err) {
      report(sid, 'fehler', err.message);
      steps.push({ id: sid, status: 'fehler', detail: err.message, hint: err.hint, command: err.command });
      throw Object.assign(err, { steps });
    }
  };
  if (!dryRun) setManifestTarget(L.manager);
  // Paket-Installation: Programmordner nur für root bzw. Administratoren/System beschreibbar (nach dem Anlegen und nach dem
  // Kopieren) – der Update-Helfer läuft mit Adminrechten daraus.
  const programmSchuetzen = async () => {
    if (dryRun || sysDry || !platform.protectProgramScript || !paketInfo() || !fs.existsSync(programRoot)) return;
    await admin(platform.protectProgramScript(programRoot), platform.id === 'windows' ? 'Programmordner schützen (nur Administratoren und System schreiben)' : 'Programmordner schützen (nur root schreibt)');
  };
  const dataOwned = () => [...new Set([dataRoot, dirs.ablage, dirs.backups, dirs.logs])];
  const dbFile = settingsdb.dbFileOf(dirs.storage);
  let schemaBefore = null; // Datenbank-Schema vor dem Update (null = keine Datenbank)
  let update = null; // erneutes Einrichten mit neuer Version: { previous, failed, backupId } – nach dem Umschalten gesetzt
  let pruneAfter = null; // nach dem Umschalten: prune() aus releases.mjs, läuft erst nach Erfolg
  // Linux als root: Datenbank, Einstellungen, Sicherungen, Protokolle gehören sonst root → dem Dienstbenutzer geben
  const giveDataToServiceUser = async () => {
    if (!platform.ownsDataDirs || !(await platform.isAdmin())) return;
    await admin(platform.prepareDirsScript(dataOwned()), 'Datenordner dem Dienstbenutzer übergeben');
  };
  const serviceKeys = () => ['webapp', 'backup', ...(portal.enabled ? ['portal'] : []), 'manager'];
  // Ohne Adminrechte darf man Dienste meist nicht starten (Windows: Fehler 5) – dann alle in einer Admin-Aktion.
  let gestartetSeit = 0; // Zeitpunkt des letzten Dienststarts – ältere Zustandsdateien zählen beim Warten nicht
  let startGrund = null; // warum waitHealthy früh aufgegeben hat (lib/startwache.mjs) oder null
  const startServices = async (keys) => {
    gestartetSeit = Date.now() - 1000;
    const failed = [];
    for (const key of keys) if (!(await platform.services.control(key, 'start'))) failed.push(key);
    if (failed.length) {
      await admin(failed.map((key) => platform.services.controlScript(key, 'start')).join('\n'), 'Dienste starten');
    }
  };
  // Bis zu 2 Minuten auf /api/health warten (langsame Rechner); stürzt die Web-App immer wieder ab, sofort aufgeben.
  const readWebappState = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dirs.logs, 'webapp.state.json'), 'utf8'));
    } catch {
      return null;
    }
  };
  const waitHealthy = async () => {
    startGrund = null;
    for (let i = 0; i < 60 && !(await checkHealth(appPort, portal.basePath)); i++) {
      startGrund = startAbbruch(readWebappState(), { seit: gestartetSeit });
      if (startGrund) return false;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return checkHealth(appPort, portal.basePath);
  };

  // Nie zweimal gleichzeitig einrichten (doppelt gestartetes Installieren.cmd, Update-Helfer, Manager)
  const freigeben = dryRun ? () => {} : einrichtungSperren(programRoot, 'Installation');
  try {
    await step('check', async () => {
      if (!nodeOk()) throw new InputError(`Node.js ${process.version} ist zu alt (mindestens ${MIN_NODE.join('.')}).`, platform.nodeInstall);
      // Älteres Paket über eine neuere Installation: ablehnen, bevor irgendetwas verändert wird – nach Versionsnummer
      // (SemVer) und nach Datenbank-Schema
      if (!input.fromBackup) {
        const installed = currentRelease(programRoot);
        refuseOlderVersion(installed?.version ?? installed?.id ?? null, version(PROGRAM_DIR), { allowOlder: !!input.allowOlder });
        schemaBefore = await refuseDowngrade(dbFile, PROGRAM_DIR, id);
      }
      // Linux mit zu altem polkit (Bullseye, Ubuntu 22.04): Einrichtung geht, aber der Manager kann die Dienste nicht steuern – deutlich sagen
      const polkit = platform.polkitProblem ? await platform.polkitProblem().catch(() => null) : null;
      if (polkit) log().warn(`Einrichtung: ${polkit}`);
      return { detail: `${platform.label}${platform.untested ? ' (ungetestet)' : ''}, ${process.arch}, Node ${process.version}${polkit ? `\n  ! ACHTUNG: ${polkit}` : ''}` };
    });

    await step('folders', async () => {
      const list = [...new Set([programRoot, path.join(programRoot, 'releases'), dataRoot, ...Object.values(dirs), ...L.ablageSub.map((n) => path.join(L.ablage, n))])];
      if (dryRun) return { detail: list.join(' · ') };
      const missing = new Set([programRoot, dataRoot, dirs.backups, dirs.logs].filter((d) => !writable(d)));
      // Linux als root: alles beschreibbar – trotzdem Dienstbenutzer anlegen und ihm die Datenordner geben
      if (platform.ownsDataDirs && (await platform.isAdmin())) for (const d of dataOwned()) missing.add(d);
      // Programmordner unter „Programme“: Nur Installationen aus einer Arbeitskopie (Entwicklung) bekommen Schreibrechte für
      // Benutzer und Dienstkonto. Bei Paket-Installationen darf dort NUR Admin/System schreiben – der Update-Helfer läuft als
      // System aus diesem Ordner; wäre er für den Manager (Lokaler Dienst) beschreibbar, könnte ein übernommener Manager so
      // Admin-Rechte bekommen.
      const inProgramFiles = platform.serviceFilesInProgram && isInside(programRoot, path.dirname(platform.defaults().programRoot));
      const paket = !!paketInfo();
      if (inProgramFiles && !paket) missing.add(programRoot);
      if (missing.size) {
        await admin(platform.prepareDirsScript([...missing]), 'Ordner anlegen');
      }
      // Paket-Installation: programmSchuetzen() setzt die Rechte (Windows unter „Programme“: Standard; anderswo ausdrücklich nur Admin/System)
      for (const d of list) fs.mkdirSync(d, { recursive: true });
      await programmSchuetzen();
      recordManifest({ type: 'folder', path: programRoot, role: 'program' });
      recordManifest({ type: 'folder', path: dataRoot, role: 'data' });
      if (inProgramFiles) recordManifest({ type: 'acl', path: programRoot, detail: 'Ändern für Benutzer und Lokaler Dienst' });
      for (const d of [dirs.backups, dirs.logs]) if (!isInside(d, dataRoot)) recordManifest({ type: 'folder', path: d, role: 'data' });
      return { detail: `Programm: ${programRoot} · Daten: ${dataRoot}` };
    });

    await step('program', async () => {
      if (INSTALL && fs.realpathSync(PROGRAM_DIR).startsWith(programRoot)) return { skip: true, detail: 'läuft bereits aus dem Programmordner' };
      const previous = dryRun ? null : (currentRelease(programRoot)?.id ?? null);
      if (previous === id) return { skip: true, detail: `Version ${id} ist bereits installiert` };
      const dest = path.join(programRoot, 'releases', id);
      const copyDeps = !!(input.copyDeps || input.prebuilt);
      if (dryRun) return { detail: `${PROGRAM_DIR} → ${dest}${input.prebuilt ? ' (fertig gebaut)' : copyDeps ? ' (mit node_modules)' : ''}; „current“ zeigt darauf` };
      removeTree(dest);
      // Verweise (z. B. npm-Workspaces in node_modules) nicht kopieren, sondern danach neu auf die Kopie zeigen lassen.
      const links = [];
      const filter = copyFilter(copyDeps, !!input.prebuilt);
      // Direkt in den Zielordner kopieren – kein Umbenennen, das Virenscanner bei frischen Ordnern gern sperren (EPERM).
      // Halb kopiert ist unschädlich: „current“ zeigt erst nach dem Kopieren darauf, ein neuer Versuch löscht den Rest (removeTree oben).
      fs.cpSync(PROGRAM_DIR, dest, { recursive: true, filter: (src) => filter(src) && !(fs.lstatSync(src).isSymbolicLink() && links.push(src)) });
      fs.writeFileSync(path.join(dest, '.release.json'), JSON.stringify({ id, version: version(PROGRAM_DIR), source: paketInfo()?.name ?? PROGRAM_DIR, at: new Date().toISOString() }));
      const inDest = (p) => path.join(dest, path.relative(PROGRAM_DIR, p));
      for (const src of links) {
        const target = fs.realpathSync(src);
        if (!path.relative(PROGRAM_DIR, target).startsWith('..') && fs.existsSync(path.dirname(inDest(src)))) platform.linkDir(inDest(target), inDest(src));
      }
      if (copyDeps) linkWorkspaces(dest); // ZIP-Pakete enthalten keine Verweise
      const stopped = sysDry ? [] : await stopOwnServices(); // erneutes Einrichten = Update: Dienste stoppen, „start“ startet sie wieder
      // Update einer Installation mit Daten: Sicherung mit der bisherigen Version, Dienste dabei schon gestoppt (nichts geht verloren)
      let backupId = null;
      if (previous && !input.fromBackup && schemaBefore !== null) {
        try {
          backupId = await backupWithInstalled(programRoot, `vor Update auf ${version(PROGRAM_DIR)}`);
        } catch (err) {
          await startServices(stopped); // nichts umgestellt → wie vorher weiterlaufen lassen
          throw err;
        }
      }
      // Scheitert das Umschalten, zeigt „current“ wieder auf die bisherige Version und die gestoppten Dienste laufen wieder
      await umschalten({ programRoot, id, previous }, { start: () => startServices(stopped), warn: (t) => log().error(`Einrichtung: ${t}`) });
      if (previous && !input.fromBackup) update = { previous, failed: id, backupId };
      pruneAfter = pruneReleases; // nur aktuelle + vorige Version behalten – erst nach Erfolg, damit ein Rückfall die vorige hat
      // Für alle lesbar (nur Ordner, keine Geheimnisse): Manager und Kommandozeile erkennen daran die Installation –
      // unter Linux läuft der Manager als mosaik3lab, die Datei gehört root (mit 0600 sah er sich als „Arbeitskopie“)
      writeJsonAtomic(path.join(programRoot, 'install.json'), { dataRoot, configFile, logDir: dirs.logs, managerDir: dirs.manager }, { mode: 0o644 });
      const { logoIco, logoPng, LOGO_SVG } = await import('./icon.mjs');
      fs.writeFileSync(path.join(programRoot, 'mosaik3lab.ico'), logoIco());
      fs.writeFileSync(path.join(programRoot, 'mosaik3lab.png'), logoPng(256));
      fs.writeFileSync(path.join(programRoot, 'mosaik3lab.svg'), LOGO_SVG);
      return { detail: `${dest} (aktiv über ${current})${update ? ` · vorher: ${previous}` : ''}${backupId ? ` · Sicherung vor dem Update: ${backupId}` : ''}${stopped.length ? ` · für den Wechsel gestoppt: ${stopped.join(', ')}` : ''}` };
    });

    await step('config', async () => {
      if (input.fromBackup) return { skip: true, detail: 'alle Einstellungen kommen aus der Sicherung' };
      if (fs.existsSync(configFile) && fs.existsSync(settingsdb.dbFileOf(dirs.storage))) {
        // Erneut eingerichtet (z. B. neues Installer-Paket): Einstellungen der Datenbank gelten weiter, nichts zurücksetzen.
        const cfg = configFromDb(dirs.storage);
        appPort = cfg.app.port;
        network = cfg.app.network;
        portal = cfg.portal;
        Object.assign(dirs, { ablage: cfg.paths.ablageDir || dirs.ablage, backups: cfg.paths.backupDir || dirs.backups, logs: cfg.paths.logDir || dirs.logs });
        return { skip: true, detail: `vorhandene Einrichtung in ${dataRoot} – Einstellungen und Daten bleiben` };
      }
      const encrypt = input.backupEncrypt !== false;
      const cfg = validate({
        ...structuredClone(DEFAULTS),
        manager: { port: DEFAULTS.manager.port },
        app: { ...DEFAULTS.app, port: appPort, network },
        portal,
        paths: { dataDir: dirs.storage, ablageDir: dirs.ablage, backupDir: dirs.backups, logDir: dirs.logs },
        backup: { time: input.backupTime ?? DEFAULTS.backup.time, keep: Number(input.backupKeep ?? DEFAULTS.backup.keep), encrypt },
      });
      const from = input.dataFrom ? path.resolve(input.dataFrom) : resolvePaths().dataDir; // bisherige Daten (Entwicklung: C:\Mosaik3LAB\daten)
      const copyData = input.copyData !== false && hasData(from) && !hasData(dirs.storage);
      const oldAblage = input.ablageFrom ? path.resolve(input.ablageFrom) : resolvePaths().ablageDir; // Ablage der bisherigen Arbeitskopie
      const copyAblage = copyData && fs.existsSync(oldAblage) && countFiles(oldAblage) > 0 && countFiles(dirs.ablage) === 0 && path.resolve(oldAblage) !== path.resolve(dirs.ablage);
      const keyFile = L.keyFile;
      if (dryRun) return { detail: `${configFile} + Datenbank ${settingsdb.dbFileOf(dirs.storage)}${encrypt ? ' · Backup-Passwort wird erzeugt' : ''}${copyData ? ` · Datenbank und Dateien aus ${from} übernehmen` : ''}` };
      // Vorhandene Daten zuerst übertragen (Datenbank konsistent über db:backup, Anzahlen verglichen) – danach schreibt
      // saveConfigTo die Einstellungen der neuen Einrichtung hinein; fachliche Daten der Datenbank bleiben erhalten.
      let moved = null;
      if (copyData) moved = await transferData({ from, to: dirs.storage, programDir: PROGRAM_DIR });
      if (copyAblage) {
        const n = countFiles(oldAblage);
        fs.cpSync(oldAblage, dirs.ablage, { recursive: true });
        if (countFiles(dirs.ablage) !== n) throw new Error(`Ablage unvollständig übernommen (${n} → ${countFiles(dirs.ablage)} Dateien).`);
        moved = { ...moved, ablageFiles: n };
      }
      saveConfigTo(configFile, cfg); // Startdatei { dataDir, managerPort } + alle Einstellungen in die Datenbank
      if (encrypt) {
        if (input.backupPassword) saveBackupPassword(input.backupPassword, keyFile);
        else if (!fs.existsSync(keyFile)) {
          generatedBackupPassword = generatePassword();
          saveBackupPassword(generatedBackupPassword, keyFile);
        }
      }
      return { detail: `${configFile}${moved ? ` · Daten übernommen (${moved.tables} Tabellen, ${moved.rows} Zeilen${moved.ablageFiles ? `, ${moved.ablageFiles} Dateien der Ablage` : ''}, Anzahlen verglichen)` : ''}${generatedBackupPassword ? ' · Backup-Passwort erzeugt (wird einmalig angezeigt)' : ''}` };
    });

    await step('restore', async () => {
      const fb = input.fromBackup;
      if (!fb) return { skip: true, detail: 'neue Einrichtung (nicht aus Sicherung)' };
      if (!fb.dir) throw new InputError('Sicherungsdatei angeben (fromBackup.dir).');
      const location = path.resolve(String(fb.dir));
      if (!fs.existsSync(location)) throw new InputError(`Sicherung nicht gefunden: ${location}`, 'Pfad der Datei .m3lbackup prüfen.');
      if (dryRun) return { detail: `${location} → ${dirs.storage} (alle Einstellungen aus der Sicherung)` };
      // Auspacken und prüfen; ein falsches Passwort wird hier abgelehnt, bevor etwas angelegt oder verändert wird.
      const opened = await openBackup(location, { password: fb.password, stagingBase: dataRoot });
      try {
        const { meta, header, folder } = opened;
        const mine = releaseSchemaVersion(PROGRAM_DIR);
        if (mine !== null && meta.schemaVersion > mine) {
          throw new InputError(`Die Sicherung stammt aus einer neueren Version (Datenbank-Schema ${meta.schemaVersion}, dieses Programm kennt ${mine}).`, 'Eine neuere Programmversion einrichten (gleiche Quelle wie die Sicherung) und es erneut versuchen.');
        }
        // 1. Datenbank zurückspielen und Einstellungen daraus lesen
        const first = await applyBackup({ folder, meta, dirs: { dataDir: dirs.storage, ablageDir: dirs.ablage }, only: ['db'] });
        if (first.length) throw new Error(`Datenbank konnte nicht zurückgespielt werden (${first[0]}).`);
        const cfg = configFromDb(dirs.storage);
        // 2. Ordner prüfen (anderes Laufwerk auf einem neuen Rechner?) – nur dann nachfragen, mit Vorschlag
        const wanted = {
          ablageDir: fb.paths?.ablageDir ?? (cfg.paths.ablageDir || dirs.ablage),
          backupDir: input.backupDir ?? fb.paths?.backupDir ?? (cfg.paths.backupDir || dirs.backups),
          logDir: input.logDir ?? fb.paths?.logDir ?? (cfg.paths.logDir || dirs.logs),
        };
        const suggestion = { ablageDir: dirs.ablage, backupDir: dirs.backups, logDir: dirs.logs };
        const labels = { ablageDir: 'Ablageordner', backupDir: 'Backup-Ziel', logDir: 'Protokollordner' };
        const needsInput = [];
        for (const [key2, dir] of Object.entries(wanted)) {
          const clean = checkDir(dir, labels[key2], { allowEmpty: false });
          wanted[key2] = clean;
          if (!writable(clean)) needsInput.push({ key: key2, label: labels[key2], path: clean, suggestion: suggestion[key2], reason: 'nicht anlegbar oder nicht beschreibbar (anderes Laufwerk?)' });
          else if (key2 === 'ablageDir' && meta.kind === 'komplett' && countFiles(clean) > 0 && !fb.paths?.ablageDir) needsInput.push({ key: key2, label: labels[key2], path: clean, suggestion: suggestion[key2], reason: 'enthält schon Dateien – es werden keine fremden Dateien überschrieben' });
        }
        if (needsInput.length) {
          throw Object.assign(new InputError(`Ordner aus der Sicherung passen nicht zu diesem Rechner: ${needsInput.map((n) => `${n.label} ${n.path} (${n.reason}; Vorschlag: ${n.suggestion})`).join('; ')}`, `Andere Ordner angeben: fromBackup.paths { ${needsInput.map((n) => n.key).join(', ')} } bzw. --path <schlüssel>=<ordner>.`), { needsInput });
        }
        Object.assign(cfg.paths, { dataDir: dirs.storage, ...wanted });
        saveConfigTo(configFile, validate(cfg)); // Startdatei + Datenbank mit den (ggf. angepassten) Ordnern
        appPort = cfg.app.port;
        network = cfg.app.network;
        portal = cfg.portal;
        Object.assign(dirs, { ablage: wanted.ablageDir, backups: wanted.backupDir, logs: wanted.logDir });
        // 3. Dateien (nur was die Sicherung enthält: „komplett“ → Ablage; „Daten & Einstellungen“ lässt die Ablage leer)
        const rest = await applyBackup({ folder, meta, dirs: { dataDir: dirs.storage, ablageDir: wanted.ablageDir }, only: ['ablage', 'data', 'uploads'] });
        if (rest.length) throw new Error(`Dateien konnten nicht vollständig zurückgespielt werden (${rest[0]}).`);
        if (meta.kind !== 'komplett') settingsdb.writeBereich(settingsdb.dbFileOf(dirs.storage), 'betrieb', { 'restore.ohneDateien': { at: new Date().toISOString(), backup: path.basename(location) } });
        if (cfg.backup.encrypt && header?.encryption && fb.password) saveBackupPassword(fb.password, L.keyFile); // geplante Sicherungen laufen weiter
        const hint = meta.app?.version && meta.app.version !== version(PROGRAM_DIR) ? ` · Sicherung von App-Version ${meta.app.version}${meta.app.commit ? ` (${meta.app.commit})` : ''}, eingerichtet wird ${version(PROGRAM_DIR)} – bei Bedarf danach ein Update auf die gewünschte Version` : '';
        return { detail: `${meta.files.length} Dateien aus ${path.basename(location)} (${meta.kind === 'komplett' ? 'komplett' : 'Daten & Einstellungen – Bilder fehlen zunächst'}); Web-App-Port ${cfg.app.port}${cfg.app.network ? ', im Netzwerk' : ''}${hint}` };
      } finally {
        await opened.cleanup();
      }
    });

    await step('deps', async () => {
      if (input.skipBuild) return { skip: true, detail: 'übersprungen (skipBuild)' };
      if (!dryRun && appRunnable(current)) return { skip: true, detail: fs.existsSync(path.join(current, 'node_modules')) ? 'bereits vorhanden' : 'nicht nötig (gebündelt)' };
      if (dryRun) return { detail: input.prebuilt ? 'liegen im Paket bei' : input.copyDeps ? 'mitkopiert' : `npm ci in ${current}`, command: 'npm ci' };
      // Mit devDependencies: der Server startet hier über tsx.
      const r = await runShell('npm ci --no-audit --no-fund', { cwd: fs.realpathSync(current), onOutput });
      if (r.code !== 0) throw new InputError(`npm ci fehlgeschlagen (Code ${r.code}).`, 'Internetverbindung prüfen und „Einrichten“ erneut starten.');
      return { detail: 'installiert' };
    });

    await step('build', async () => {
      if (input.skipBuild) return { skip: true, detail: 'übersprungen (skipBuild)' };
      if (!dryRun && fs.existsSync(path.join(current, 'client', 'dist', 'index.html'))) return { skip: true, detail: 'bereits gebaut' };
      if (dryRun) return input.prebuilt ? { detail: 'liegt im Paket bei' } : { detail: 'npm run build -w client', command: 'npm run build -w client' };
      const r = await runShell('npm run build -w client', { cwd: fs.realpathSync(current), onOutput });
      if (r.code !== 0) throw new InputError(`Build fehlgeschlagen (Code ${r.code}).`, 'Protokoll ansehen und „Einrichten“ erneut starten.');
      return { detail: 'gebaut' };
    });

    await step('admin', async () => {
      if (input.fromBackup) return { skip: true, detail: 'Konten kommen aus der Sicherung' };
      if (!dryRun && (await activeAdminCount(dbFile)) > 0) return { skip: true, detail: 'es gibt bereits einen aktiven Administrator' };
      const a = input.admin;
      if (!a?.email) return { skip: true, detail: 'nicht angegeben – beim ersten Aufruf der App im Schulnetz anlegen (Adressen am Ende der Installation)' };
      checkAdminInput(a);
      if (dryRun) return { detail: `${a.email} (Administrator)` };
      if (input.skipBuild) return { skip: true, detail: 'übersprungen (skipBuild)' };
      await createAdmin({ programDir: fs.realpathSync(current), dataDir: dirs.storage, ablageDir: dirs.ablage, email: a.email, name: a.name, password: a.password, schulDomain: a.schulDomain });
      return { detail: `${a.email} (Administrator)` };
    });

    await step('services', async () => {
      await programmSchuetzen(); // auch das gerade kopierte Programm
      if (input.services === false) return { skip: true, detail: 'nicht gewählt – Dienste laufen als Hintergrundprozesse' };
      // Installer-Paket bringt node.exe mit (<Version>/node/) – über „current“, damit ein Rückfall die passende Node-Version nimmt
      const bundled = path.join(current, 'node', path.basename(process.execPath));
      const node = fs.existsSync(path.join(fs.existsSync(current) ? fs.realpathSync(current) : PROGRAM_DIR, 'node', path.basename(process.execPath))) ? bundled : process.execPath;
      // Beim Update per Knopfdruck läuft dieses Setup im Dienst „Update-Helfer“ – unter Windows den nicht anfassen (ein Austausch
      // seiner WinSW-Datei würde ihn – und damit dieses Setup – mitten im Schritt stoppen). Unter Linux wird nur die Unit neu
      // geschrieben (daemon-reload stoppt nichts) – so kommen auch neue Zeitlimits (TimeoutStartSec) per Knopfdruck an.
      const helferLaeuft = process.env.MOSAIK3LAB_UPDATE_HELFER === '1' && !platform.services.updaterLiveUpdate;
      const keys = ['webapp', 'backup', 'portal', 'manager', ...(helferLaeuft ? [] : ['updater'])];
      const defs = keys.map((key) => ({
        key, id: SERVICE_IDS[key], title: SERVICE_TITLES[key], node, workDir: current, logDir: dirs.logs, serviceDir: dirs.services,
        args: [path.join(current, 'manager', key === 'manager' ? 'server.mjs' : key === 'updater' ? 'runners/aktualisieren.mjs' : `runners/${key}.mjs`), ...(key === 'manager' ? ['--wait-port'] : []), '--config', configFile],
        env: { MOSAIK3LAB_SERVICE: '1', MANAGER_CONFIG: configFile, NODE_ENV: 'production' },
        wrapperExe: platform.wrapper ? path.join(dirs.tools, `WinSW-${platform.wrapper.version}.exe`) : null,
      }));
      const script = defs.map((d) => platform.services.installScript(d)).join('\n');
      if (dryRun || sysDry) return { detail: defs.map((d) => d.id).join(', '), command: script, planned: true };
      if (platform.wrapper) await ensureWrapper(defs[0].wrapperExe, !!input.downloadWrapper);
      // Linux: Inhalte stehen im Admin-Skript, root schreibt direkt nach /etc (nie über den Datenordner, platform/linux.mjs)
      if (!platform.services.filesInInstallScript) for (const d of defs) for (const f of platform.services.files(d)) fs.writeFileSync(f.path, f.content);
      await admin(script, 'Dienste einrichten');
      for (const d of defs) recordManifest({ type: 'service', name: d.id });
      return { detail: defs.map((d) => d.id).join(', ') };
    });

    await step('firewall', async () => {
      if (!network) return { skip: true, detail: 'Web-App nur auf diesem Rechner – keine Freigabe nötig' };
      // Mit Portal: nur dessen Ports (80, bei HTTPS auch 443) – die App selbst hört nur auf 127.0.0.1
      const ports = wantedFirewallPorts({ app: { port: appPort }, portal });
      const script = ports.map((p) => platform.firewall.allowScript(p)).join('\n');
      if (dryRun || sysDry) return { detail: ports.map((p) => FIREWALL_RULE(p)).join(' · '), command: script, planned: true };
      // Ganz ohne Firewall-Programm (z. B. Raspberry Pi OS) sind die Ports offen – nichts anzulegen. Ist ufw/firewalld nur
      // ausgeschaltet (Ubuntu), kommt die Regel trotzdem dazu: Schaltet jemand die Firewall später ein, bleibt die App erreichbar.
      if (platform.firewall.available && !(await platform.firewall.available())) return { detail: `keine Firewall vorhanden – Port ${ports.join(', ')} ist ohne Regel erreichbar` };
      await admin(script, `Firewall: Port ${ports.join(', ')} freigeben`);
      for (const p of ports) recordManifest({ type: 'firewall', name: FIREWALL_RULE(p), port: p });
      return { detail: ports.map((p) => FIREWALL_RULE(p)).join(' · ') };
    });

    await step('shortcuts', async () => {
      if (input.shortcuts === false) return { skip: true, detail: 'nicht gewählt' };
      if (process.env.MOSAIK3LAB_UPDATE_HELFER === '1') return { skip: true, detail: 'bleiben unverändert (Update per Knopfdruck)' };
      const items = shortcutItems(programRoot, portal.enabled ? `http://127.0.0.1${portal.httpPort === 80 ? '' : `:${portal.httpPort}`}${portal.basePath}/` : `http://127.0.0.1:${appPort}/`);
      if (dryRun || sysDry) return { detail: items.map((i) => i.file).join(' · '), planned: true };
      await platform.createShortcuts(items);
      // Probelauf-Plattform legt keine an → nicht ins Manifest (Deinstallieren würde sonst echte Verknüpfungen gleichen Namens löschen)
      if (!platform.dryRun) for (const i of items) recordManifest({ type: 'shortcut', path: i.file });
      return { detail: `${items.length} Verknüpfungen` };
    });

    await step('start', async () => {
      if (input.services === false) return { skip: true, detail: 'über die Verknüpfung „Mosaik³LAB Server-Manager“ starten' };
      if (dryRun || sysDry) return { detail: 'Web-App, Backup, Portal und Manager-Dienst starten, /api/health prüfen', planned: true };
      await giveDataToServiceUser();
      // Der Manager-Dienst wartet (--wait-port), bis ein Manager aus dem Einrichtungsdialog Port und Adresse freigibt.
      await startServices(serviceKeys());
      if (!(await waitHealthy())) throw new InputError(startGrund ? `Die Web-App startet nicht – ${startGrund}.` : 'Die Web-App antwortet nicht.', 'Protokoll „Web-App“ ansehen.');
      return { detail: portal.enabled ? `läuft: http://<Rechner>${portal.httpPort === 80 ? '' : `:${portal.httpPort}`}${portal.basePath}/ (Portal) – App intern auf 127.0.0.1:${appPort}` : `läuft: http://127.0.0.1:${appPort}/`, handover: true };
    });
  } catch (err) {
    if (!update) throw err;
    throw await rollBackUpdate(err);
  } finally {
    setManifestTarget(null);
    freigeben();
  }
  if (pruneAfter) alteVersionenEntfernen(programRoot, pruneAfter, (t) => log().warn(t));
  if (!dryRun) log().info(update ? `Update von ${update.previous} auf ${id} abgeschlossen` : `Einrichtung abgeschlossen: ${programRoot} / ${dataRoot}`);
  return { steps, programRoot, dataRoot, configFile, backupPassword: generatedBackupPassword };

  /** Update fehlgeschlagen (nach dem Umschalten): automatisch zurück auf die vorige Version → Fehler mit klarer Meldung. */
  async function rollBackUpdate(err) {
    const { previous, failed, backupId } = update;
    const withServices = input.services !== false && !sysDry;
    const logs = path.join(dirs.logs, 'app.log');
    report('rollback', 'läuft');
    let text;
    try {
      const r = await rollBack({ programRoot, previous, failed, backupId, schemaBefore, dbFile }, {
        stop: () => (withServices ? stopOwnServices() : []),
        restoreDb: (bid) => restoreDbFrom({ backupDir: dirs.backups, id: bid, keyFile: L.keyFile, dataDir: dirs.storage, ablageDir: dirs.ablage }),
        start: async () => {
          if (!withServices) return;
          await giveDataToServiceUser();
          await startServices(serviceKeys());
        },
        healthy: () => (withServices ? waitHealthy() : true),
      });
      text = `Update auf ${failed} fehlgeschlagen (${err.message}) – automatisch auf ${previous} zurückgeschaltet, ${r.data}.${r.healthy ? ` ${previous} läuft wieder.` : ` Achtung: auch ${previous} antwortet nicht.`} Protokoll: ${logs}`;
      report('rollback', r.healthy ? 'fertig' : 'fehler', `zurück auf ${previous} · ${r.data}`);
    } catch (e) {
      text = `Update auf ${failed} fehlgeschlagen (${err.message}) und der automatische Rückfall auf ${previous} ebenfalls (${e.message}).${backupId ? ` Sicherung von direkt vor dem Update: ${backupId}.` : ''} Protokoll: ${logs}`;
      report('rollback', 'fehler', e.message);
    }
    log().error(text);
    return Object.assign(new InputError(text, err.hint ?? 'Protokoll „Web-App“ ansehen; mit dem vorigen Paket läuft alles wie vorher.'), { steps, rolledBack: true });
  }
}

/** Installer-Paket: paket.json { name, version, commit, node } – sonst null (Arbeitskopie). */
function paketInfo() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PROGRAM_DIR, 'paket.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** Laufende Mosaik³LAB-Dienste stoppen (nicht aus einem Dienst heraus – der Manager-Dienst würde sich selbst beenden). */
async function stopOwnServices() {
  if (process.env.MOSAIK3LAB_SERVICE === '1') return [];
  const running = [];
  // Der Update-Helfer nie: er führt gerade selbst dieses Update aus
  for (const key of Object.keys(SERVICE_IDS)) if (key !== 'updater' && (await platform.services.status(key)).running) running.push(key);
  const failed = [];
  for (const key of running) if (!(await platform.services.control(key, 'stop'))) failed.push(key);
  if (failed.length) {
    await admin(failed.map((key) => platform.services.controlScript(key, 'stop')).join('\n'), 'Dienste stoppen');
  }
  return running;
}

async function gitCommit() {
  const paket = paketInfo(); // Installer-Paket: Commit steht dort (kein .git)
  if (paket) return paket.commit ?? 'lokal';
  // Arbeitskopie: Commit für die Versionsbezeichnung, ohne Git einfach „lokal“
  const r = await run('git', ['-C', PROGRAM_DIR, 'rev-parse', '--short', 'HEAD'], { timeout: 5000 });
  return r.code === 0 && /^[0-9a-f]{4,40}$/.test(r.stdout) ? r.stdout : 'lokal';
}

function shortcutItems(programRoot, webUrl) {
  const { desktop, menu } = platform.shortcutDirs();
  const current = path.join(programRoot, 'current');
  const icon = path.join(programRoot, platform.id === 'windows' ? 'mosaik3lab.ico' : 'mosaik3lab.svg');
  const ext = (it) => platform.shortcutExt(it);
  const manager = { ...platform.launcher(current), icon, description: 'Mosaik³LAB Server-Manager' };
  const web = { url: webUrl, icon, description: 'Mosaik³LAB im Browser öffnen' };
  const uninstall = { ...platform.launcher(current, 'uninstall'), icon, description: 'Mosaik³LAB deinstallieren' };
  const list = [];
  for (const [dir, entries] of [[desktop, [['Mosaik³LAB Server-Manager', manager], ['Mosaik³LAB öffnen', web]]], [menu, [['Server-Manager', manager], ['Mosaik³LAB öffnen', web], ['Mosaik³LAB deinstallieren', uninstall]]]]) {
    if (!dir) continue;
    for (const [name, it] of entries) list.push({ ...it, file: path.join(dir, `${name}${ext(it)}`) });
  }
  return list;
}

/** WinSW laden (nur mit Zustimmung), Größe und – falls hinterlegt – SHA-256 prüfen. */
export async function ensureWrapper(file, allowDownload, { wrapper = platform.wrapper, fetchImpl = fetch } = {}) {
  const w = wrapper;
  if (fs.existsSync(file) && fs.statSync(file).size === w.size) return;
  if (!allowDownload) throw new InputError(`Für Windows-Dienste wird WinSW ${w.version} benötigt.`, 'Im Einrichtungsdialog „WinSW herunterladen“ ankreuzen.');
  // Ohne Internet (Schulserver hinter einem Filter) scheitert fetch mit „fetch failed“ – das versteht niemand. Klar sagen,
  // was fehlt und wie es ohne Internet geht (die Datei wird beim nächsten Versuch an der Größe erkannt).
  const ohneNetz = (grund) =>
    new InputError(
      `Das Hilfsprogramm für die Windows-Dienste (WinSW ${w.version}) konnte nicht heruntergeladen werden (${grund}). Dieser Rechner braucht dafür einmal Internetzugang.`,
      `Internetverbindung prüfen und die Einrichtung erneut starten. Ohne Internet: ${w.url} an einem anderen Rechner laden und als ${file} ablegen, dann erneut starten.`,
    );
  let res;
  let buf;
  try {
    res = await fetchImpl(w.url, { signal: AbortSignal.timeout(60_000) });
    if (res.ok) buf = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    throw ohneNetz(err.name === 'TimeoutError' ? 'keine Antwort nach 60 Sekunden' : (err.cause?.code ?? 'keine Verbindung'));
  }
  if (!res.ok) throw ohneNetz(`Fehler ${res.status}`);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  if (buf.length !== w.size || (w.sha256 && hash !== w.sha256)) throw new InputError('WinSW: Datei stimmt nicht mit der erwarteten Version überein – verworfen.');
  fs.writeFileSync(file, buf);
  log().info(`WinSW ${w.version} geladen (SHA-256 ${hash}).`);
  recordManifest({ type: 'file', path: file, sha256: hash });
}

// Für bestehende Aufrufer (cli, server, Tests) weiter auch hier erreichbar
export { MANAGER_DIR, removeTree, linkWorkspaces, readManifest, recordManifest };
export { uninstall } from './deinstallieren.mjs';
