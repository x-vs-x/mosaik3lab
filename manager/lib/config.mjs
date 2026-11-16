// Einstellungen und Ordner des Managers.
//
// Zwei Betriebsarten – automatisch erkannt:
//   Entwicklung:  Manager läuft aus einer Arbeitskopie (z. B. C:\Entwicklung\mosaik3lab\manager)
//                 Startdatei mosaik3lab.json (nur dataDir, managerPort); Daten trotzdem in C:\Mosaik3LAB\{daten,ablage,backups}, Logs manager/logs/
//   Installation: Manager läuft aus <Programmordner>/releases/<version>/manager (über den Verweis „current“)
//                 Programmordner (Windows: C:\Mosaik3LAB\programm) und Datenordner (C:\Mosaik3LAB)
//                 sind getrennt; <Programmordner>/install.json zeigt auf die Konfiguration.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from '../platform/index.mjs';
import * as settingsdb from './settingsdb.mjs';

export const MANAGER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROGRAM_DIR = path.dirname(MANAGER_DIR);

function detectInstall() {
  try {
    const real = fs.realpathSync(PROGRAM_DIR);
    if (path.basename(path.dirname(real)) !== 'releases') return null;
    const programRoot = path.dirname(path.dirname(real));
    const inst = { programRoot, ...JSON.parse(fs.readFileSync(path.join(programRoot, 'install.json'), 'utf8')) };
    inst.managerDir ??= path.join(inst.dataRoot, 'manager'); // ältere Installationen: Dienstdateien und Manifest im Datenordner
    return inst;
  } catch {
    return null;
  }
}
export const INSTALL = detectInstall(); // { programRoot, dataRoot, configFile, logDir, managerDir } oder null
export const CONFIG_FILE = process.env.MANAGER_CONFIG ? path.resolve(process.env.MANAGER_CONFIG) : INSTALL?.configFile ?? path.join(PROGRAM_DIR, 'mosaik3lab.json'); // Startdatei { dataDir, managerPort }

/** Feste Adresse der App hinter dem Portal: http://<Server>/mosaik3lab */
export const FIXED_BASE_PATH = '/mosaik3lab';

export const DEFAULTS = Object.freeze({
  // Adresse ist fest 127.0.0.1 – bewusst nicht einstellbar. Zusätzlich immer über die App-Adresse <pfad>/manager erreichbar
  // (Portal/Vite-Proxy, nur für Admins der App, lib/remote.mjs). Anmeldung = Admin-Konto der App (lib/auth.mjs).
  manager: { port: 5190 },
  app: { port: 3001, network: false, demoAccounts: false }, // network: im Netzwerk freigegeben (0.0.0.0 + Firewall-Regel); das Session-Geheimnis verwaltet die App selbst (Datenbank)
  paths: { dataDir: '', ablageDir: '', backupDir: '', logDir: '' }, // leer = Standard der Betriebsart
  backup: { enabled: true, time: '02:00', keep: 14, encrypt: false, full: { enabled: false, time: '03:30', weekday: 0, keep: 4 } }, // enabled/time: automatische tägliche Sicherung (immer vollständig: Datenbank + Ablage); keep: so viele Sicherungen bleiben; encrypt: mit Backup-Passwort (AES-256-GCM); full: früher eigene „Komplett“-Sicherung – unbenutzt, bleibt nur für ältere Datenbanken
  // Portal: kleiner Weiterleitungs-Dienst, einziger Zugang von außen (Port 80/443); die App hört dann nur auf 127.0.0.1.
  // Standard: http://<Server>/mosaik3lab ohne Portnummer. Ältere Einstellungen ohne Portal-Werte behalten ihr Verhalten (keepLegacyPortal).
  portal: { enabled: true, basePath: FIXED_BASE_PATH, httpPort: 80, httpsPort: 443, https: false },
  update: { repo: '', branch: 'main', gitPath: '' }, // Git-Quelle; leer = Arbeitskopie, aus der installiert wurde. gitPath: gefundenes git (leer = suchen)
});

/**
 * Einstellungen von früher (es gibt schon Betriebswerte, aber noch keine Portal-Werte) behalten ihr Verhalten: Portal aus,
 * App direkt auf ihrem Port. Die neuen Standardwerte (Portal an, /mosaik3lab) gelten nur für neue Einrichtungen.
 */
export function keepLegacyPortal(raw) {
  if (raw.app && raw.portal?.enabled === undefined) raw.portal = { ...raw.portal, enabled: false, basePath: raw.portal?.basePath ?? '' };
  return raw;
}

export class InputError extends Error {
  constructor(message, hint) {
    super(message);
    this.status = 400;
    this.hint = hint;
  }
}

/** Portal-Ports dürfen auch unter 1024 liegen (80, 443). */
export function checkAnyPort(v, label = 'Port') {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new InputError(`${label}: bitte eine Zahl zwischen 1 und 65535.`);
  return n;
}

/** Basis-Pfad der App: leer (= unter /) oder /name bzw. /name/unterordner (Buchstaben, Ziffern, . _ ~ -). */
export function checkBasePath(v) {
  const s = String(v ?? '').trim().replace(/\/+$/, '');
  if (!s || s === '/') return '';
  if (!/^\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/.test(s) || s.length > 80) throw new InputError('Pfad der App: z. B. /mosaik3lab (nur Buchstaben, Ziffern, . _ ~ - und /), ohne Leerzeichen.');
  return s;
}

export function checkPort(v, label = 'Port') {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new InputError(`${label}: bitte eine Zahl zwischen 1024 und 65535.`);
  return n;
}

/** Ordnerpfad prüfen: absolut, keine Steuerzeichen, kein Laufwerk/Wurzelordner, keine Systemordner. */
export function checkDir(value, label, { allowEmpty = true } = {}) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) {
    if (allowEmpty) return '';
    throw new InputError(`${label}: bitte einen Ordner angeben.`);
  }
  if (v.length > 400 || /[\0-\x1f]/.test(v) || (process.platform === 'win32' && /[<>"|?*]/.test(v.slice(2)))) throw new InputError(`${label}: ungültiger Pfad.`);
  if (!path.isAbsolute(v) || fremderPfad(v)) throw new InputError(`${label}: bitte einen vollständigen Pfad angeben (z. B. ${process.platform === 'win32' ? 'D:\\Mosaik3LAB\\Daten' : '/srv/mosaik3lab'}).`);
  const p = path.resolve(v);
  const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
  if (p === path.parse(p).root) throw new InputError(`${label}: ein ganzes Laufwerk bzw. „/“ ist nicht erlaubt.`);
  if ([MANAGER_DIR, os.homedir(), process.env.SystemRoot, process.env.ProgramFiles, process.env.ProgramData, '/etc', '/usr', '/var', '/opt'].filter(Boolean).some((d) => same(d, p))) {
    throw new InputError(`${label}: bitte einen eigenen Unterordner wählen.`);
  }
  return p;
}

const MIN_FREE_BYTES = 200 * 1024 * 1024;

/**
 * Prüft einen Ablageordner: anlegbar, beschreibbar, genug freier Platz. Wirft InputError mit verständlichem Hinweis.
 * Liefert { freeBytes, files } (files = Anzahl vorhandener Dateien, z. B. um vor dem Umzug zu warnen).
 */
export function checkAblageDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.schreibtest-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe);
  } catch (err) {
    throw new InputError(`Ablageordner „${dir}“ kann nicht angelegt oder beschrieben werden (${err.code ?? err.message}).`, 'Rechte des Dienstkontos prüfen oder einen anderen Ordner wählen.');
  }
  let freeBytes = null;
  try {
    const st = fs.statfsSync(dir);
    freeBytes = st.bavail * st.bsize;
  } catch {
    /* nicht ermittelbar (z. B. Netzlaufwerk) */
  }
  if (freeBytes !== null && freeBytes < MIN_FREE_BYTES) throw new InputError(`Im Ablageordner sind nur noch ${Math.round(freeBytes / 1024 / 1024)} MB frei (mindestens ${MIN_FREE_BYTES / 1024 / 1024} MB).`, 'Platz schaffen oder ein anderes Laufwerk wählen.');
  return { freeBytes, files: countFiles(dir) };
}

export function countFiles(dir) {
  try {
    return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith('.')).length;
  } catch {
    return 0;
  }
}

export function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Komplette Konfiguration prüfen; liefert bereinigte Kopie oder wirft InputError. */
export function validate(cfg) {
  const c = structuredClone(cfg);
  c.manager.port = checkPort(c.manager.port, 'Manager-Port');
  c.app.port = checkPort(c.app.port, 'Port der Web-App');
  if (c.app.port === c.manager.port) throw new InputError('Web-App und Manager brauchen verschiedene Ports.');
  c.app.network = c.app.network === true;
  c.app.demoAccounts = c.app.demoAccounts === true;
  c.paths.dataDir = checkDir(c.paths.dataDir, 'Datenordner');
  c.paths.ablageDir = checkDir(c.paths.ablageDir, 'Ablage');
  c.paths.backupDir = checkDir(c.paths.backupDir, 'Backup-Ziel');
  c.paths.logDir = checkDir(c.paths.logDir, 'Log-Ordner');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(c.backup.time))) throw new InputError('Uhrzeit bitte als HH:MM angeben.');
  c.backup.encrypt = c.backup.encrypt === true;
  c.backup.enabled = c.backup.enabled !== false;
  const full = { ...DEFAULTS.backup.full, ...(c.backup.full ?? {}) };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(full.time))) throw new InputError('Uhrzeit der kompletten Sicherung bitte als HH:MM angeben.');
  if (!Number.isInteger(Number(full.weekday)) || Number(full.weekday) < -1 || Number(full.weekday) > 6) throw new InputError('Wochentag der kompletten Sicherung: 0 (Sonntag) bis 6 oder -1 (täglich).');
  if (!Number.isInteger(Number(full.keep)) || Number(full.keep) < 1 || Number(full.keep) > 52) throw new InputError('Anzahl der kompletten Sicherungen: 1 bis 52.');
  c.backup.full = { enabled: full.enabled === true, time: String(full.time), weekday: Number(full.weekday), keep: Number(full.keep) };
  c.backup.keep = Number(c.backup.keep);
  if (!Number.isInteger(c.backup.keep) || c.backup.keep < 1 || c.backup.keep > 365) throw new InputError('Anzahl der Sicherungen: 1 bis 365.');
  if (c.update.branch && !/^[\w./-]{1,100}$/.test(c.update.branch)) throw new InputError('Git-Branch ungültig.');
  if (/^-/.test(c.update.repo)) throw new InputError('Git-Quelle ungültig.');
  c.update.gitPath = typeof c.update.gitPath === 'string' ? c.update.gitPath.trim() : '';
  if (c.update.gitPath && (/[\0-\x1f]/.test(c.update.gitPath) || !path.isAbsolute(c.update.gitPath))) throw new InputError('Pfad zu Git: bitte einen vollständigen Pfad angeben oder leer lassen.');
  const po = { ...DEFAULTS.portal, ...(c.portal ?? {}) };
  // Mit Portal ist die Adresse immer http://<Server>/mosaik3lab – nicht einstellbar (Entscheidung des Nutzers, 2026-11-16).
  // Ein anderer gespeicherter Pfad (ältere Einrichtung, Sicherung) wird hier überall ersetzt: Portal, Web-App, Status, Mails.
  c.portal = { enabled: po.enabled === true, basePath: po.enabled === true ? FIXED_BASE_PATH : checkBasePath(po.basePath), httpPort: checkAnyPort(po.httpPort, 'HTTP-Port des Portals'), httpsPort: checkAnyPort(po.httpsPort, 'HTTPS-Port des Portals'), https: po.https === true };
  if (c.portal.httpPort === c.portal.httpsPort) throw new InputError('HTTP- und HTTPS-Port des Portals müssen verschieden sein.');
  for (const [label, port] of [['HTTP-Port', c.portal.httpPort], ['HTTPS-Port', c.portal.httpsPort]]) {
    if (port === c.app.port || port === c.manager.port) throw new InputError(`Portal ${label} ${port} wird schon von der Web-App bzw. dem Manager benutzt.`);
  }
  const p = resolvePaths(c);
  if (isInside(p.backupDir, p.dataDir) || isInside(p.dataDir, p.backupDir)) throw new InputError('Datenordner und Backup-Ziel dürfen nicht ineinander liegen.');
  if (INSTALL && [p.dataDir, p.ablageDir, p.backupDir].some((d) => d && isInside(d, INSTALL.programRoot))) throw new InputError('Daten, Ablage und Sicherungen dürfen nicht im Programmordner liegen.');
  return c;
}

function merge(base, extra) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (k in base) out[k] = base[k] && typeof base[k] === 'object' ? merge(base[k], v) : v;
  }
  return out;
}

// ---------- Laden: Startdatei + Datenbank ----------
// Alle Einstellungen liegen in der Datenbank (settingsdb.mjs). Nur die winzige Startdatei <Wurzel>/mosaik3lab.json
// { dataDir, managerPort } bleibt außerhalb, weil man den Ort der Datenbank kennen muss, bevor man sie liest.
// Fehlt etwas in der Datenbank → Standardwerte.
const SECTIONS = { manager: 'manager', app: 'betrieb', paths: 'betrieb', backup: 'betrieb', update: 'betrieb', portal: 'betrieb' }; // Abschnitt → Bereich
const RETIRED_KEYS = ['manager.passwordHash', 'manager.remote']; // früher: eigenes Manager-Passwort, Schalter „Über die App-Adresse“
const NOT_IN_DB = ['paths.dataDir']; // steht in der Startdatei

/** Konfiguration → Zeilen je Bereich { betrieb: { 'app.port': 3001, … }, manager: { … } } */
export function flatten(cfg) {
  const out = { betrieb: {}, manager: {} };
  for (const [section, bereich] of Object.entries(SECTIONS)) {
    for (const [k, v] of Object.entries(cfg[section] ?? {})) if (!NOT_IN_DB.includes(`${section}.${k}`)) out[bereich][`${section}.${k}`] = v;
  }
  return out;
}

/** Zeilen → Konfiguration (nur bekannte Abschnitte/Schlüssel). */
export function unflatten(rows) {
  const raw = {};
  for (const bereich of ['betrieb', 'manager']) {
    for (const [key, v] of Object.entries(rows?.[bereich] ?? {})) {
      const [section, ...rest] = key.split('.');
      if (SECTIONS[section] === bereich && rest.length === 1 && section in DEFAULTS && rest[0] in DEFAULTS[section]) (raw[section] ??= {})[rest[0]] = v;
    }
  }
  return raw;
}

/** Standard-Datenordner der Betriebsart (ohne Eintrag in der Startdatei). */
// Auch aus der Arbeitskopie nie im Entwicklungsordner: C:\Mosaik3LAB\daten bzw. /var/lib/mosaik3lab/daten (wie die App).
const devDataRoot = () => process.env.MOSAIK3LAB_ROOT
  ? path.resolve(process.env.MOSAIK3LAB_ROOT)
  : process.platform === 'win32' ? path.join(`${process.env.SystemDrive ?? 'C:'}\\`, 'Mosaik3LAB') : '/var/lib/mosaik3lab';
const defaultDataDir = () => (INSTALL ? layout({ programRoot: INSTALL.programRoot, dataRoot: INSTALL.dataRoot }).daten : path.join(devDataRoot(), 'daten'));

export function readStartFile(file = CONFIG_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Startdatei schreiben: nur { dataDir, managerPort }. */
export function writeStartFile(file, { dataDir, managerPort }) {
  writeJsonAtomic(file, { dataDir: dataDir || '', managerPort: Number(managerPort) || DEFAULTS.manager.port });
}

const writeDb = (dataDir, cfg) => {
  const rows = flatten(cfg);
  settingsdb.writeBereich(settingsdb.dbFileOf(dataDir), 'betrieb', rows.betrieb);
  settingsdb.writeBereich(settingsdb.dbFileOf(dataDir), 'manager', rows.manager);
};

/** Konfiguration an einen Ort schreiben: Startdatei + Datenbank im Datenordner (Einrichtung, Wiederherstellung, Tests). */
export function saveConfigTo(startFile, cfg) {
  const dataDir = cfg.paths.dataDir || defaultDataDir();
  writeDb(dataDir, cfg);
  writeStartFile(startFile, { dataDir: cfg.paths.dataDir, managerPort: cfg.manager.port });
}

/**
 * Alte Betriebsdateien einmalig in die Datenbank übernehmen und als .bak umbenennen:
 *  - die frühere Konfigurationsdatei (manager.config.json im alten Format → Startdatei + Datenbank)
 *  - <Daten>/config/mail.json → Bereich „mail“, <Daten>/data/.session-secret → Bereich „betrieb“
 * Gibt eine Liste der Übernahmen zurück.
 */
export function migrateLegacy(startFile = CONFIG_FILE) {
  const done = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const retire = (file) => fs.renameSync(file, `${file}.vor-datenbank-${stamp}.bak`);
  let start = null;
  try {
    start = readStartFile(startFile);
  } catch {
    return done; // unlesbar → load() meldet es
  }
  let legacyFile = null;
  if (start && ('manager' in start || 'app' in start || 'paths' in start)) legacyFile = { file: startFile, raw: start };
  else if (!start && startFile === path.join(PROGRAM_DIR, 'mosaik3lab.json')) {
    const old = path.join(MANAGER_DIR, 'manager.config.json'); // Entwicklung: früherer Ort
    try {
      legacyFile = { file: old, raw: JSON.parse(fs.readFileSync(old, 'utf8').replace(/^﻿/, '')) };
    } catch {
      /* nichts zu übernehmen */
    }
  }
  if (legacyFile) {
    const cfg = validate(merge(DEFAULTS, keepLegacyPortal({ ...legacyFile.raw, app: { ...legacyFile.raw.app, sessionSecret: undefined } })));
    const dataDir = cfg.paths.dataDir || defaultDataDir();
    const sessionSecret = legacyFile.raw.app?.sessionSecret;
    writeDb(dataDir, cfg);
    if (sessionSecret && sessionSecret.length >= 32) settingsdb.writeIfNew(settingsdb.dbFileOf(dataDir), 'betrieb', 'sessionSecret', sessionSecret, true);
    if (legacyFile.file === startFile) fs.copyFileSync(startFile, `${startFile}.vor-datenbank-${stamp}.bak`);
    else retire(legacyFile.file);
    writeStartFile(startFile, { dataDir: cfg.paths.dataDir, managerPort: cfg.manager.port });
    done.push(`Konfiguration aus ${legacyFile.file} in die Datenbank übernommen`);
    start = { dataDir: cfg.paths.dataDir, managerPort: cfg.manager.port };
  }
  // Mail und Session-Geheimnis aus den alten Dateien des Datenordners
  const dataDir = start?.dataDir || defaultDataDir();
  const dbFile = settingsdb.dbFileOf(dataDir);
  const mailFile = path.join(dataDir, 'config', 'mail.json');
  if (fs.existsSync(mailFile) && !Object.keys(settingsdb.readBereich(dbFile, 'mail')).length) {
    try {
      settingsdb.writeBereich(dbFile, 'mail', JSON.parse(fs.readFileSync(mailFile, 'utf8').replace(/^﻿/, '')), { secrets: ['smtp'] });
      retire(mailFile);
      done.push(`${mailFile} in die Datenbank übernommen`);
    } catch (err) {
      done.push(`${mailFile} konnte nicht übernommen werden: ${err.message}`);
    }
  }
  // Eigenes Manager-Passwort und Schalter „Über die App-Adresse“ gibt es nicht mehr (Anmeldung = Admin-Konto der App).
  const manager = settingsdb.readBereich(dbFile, 'manager');
  const retired = RETIRED_KEYS.filter((k) => k in manager);
  if (retired.length) {
    settingsdb.writeBereich(dbFile, 'manager', Object.fromEntries(retired.map((k) => [k, undefined])));
    done.push(`Altes Manager-Passwort entfernt – Anmeldung jetzt mit dem Admin-Konto der App (${retired.join(', ')})`);
  }
  const secretFile = path.join(dataDir, 'data', '.session-secret');
  if (fs.existsSync(secretFile)) {
    const s = fs.readFileSync(secretFile, 'utf8').trim();
    if (s.length >= 32 && settingsdb.writeIfNew(dbFile, 'betrieb', 'sessionSecret', s, true)) {
      retire(secretFile);
      done.push(`${secretFile} in die Datenbank übernommen`);
    }
  }
  return done;
}

/**
 * Pfad von einem anderen Betriebssystem? (z. B. Sicherung von Windows auf Linux eingespielt: „C:\Mosaik3LAB\ablage“ ist
 * dort kein vollständiger Pfad; umgekehrt würde „/var/backups/mosaik3lab“ unter Windows still zu „C:\var\backups\…“.)
 */
export function fremderPfad(p, platform = process.platform) {
  const v = typeof p === 'string' ? p.trim() : '';
  if (!v) return false;
  return platform === 'win32' ? !/^([A-Za-z]:[\\/]|\\\\[^\\/])/.test(v) : !v.startsWith('/');
}

/** Ordner aus der Datenbank, die von einem anderen System stammen, gelten nicht – hier greifen die Standardordner. */
function ohneFremdePfade(paths = {}) {
  const out = { ...paths };
  for (const key of ['ablageDir', 'backupDir', 'logDir']) if (fremderPfad(out[key])) out[key] = '';
  return out;
}

/**
 * Konfiguration aus der Datenbank eines Datenordners lesen und prüfen (Einrichtung aus Backup, Tests) – unabhängig
 * von der Konfiguration dieses Prozesses. managerPort überschreibt den Wert aus der Datenbank.
 */
export function configFromDb(dataDir, managerPort) {
  const raw = unflatten(settingsdb.readAll(settingsdb.dbFileOf(dataDir)));
  raw.paths = { ...ohneFremdePfade(raw.paths), dataDir };
  if (managerPort) raw.manager = { ...raw.manager, port: managerPort };
  return validate(merge(DEFAULTS, keepLegacyPortal(raw)));
}

let state = null;
let stateStamp = '';
let stateCheckedAt = 0;
let migrationNotes = [];
const dbStamp = (c) => settingsdb.stamp(settingsdb.dbFileOf(resolvePaths(c).dataDir));

function load() {
  let start = null;
  try {
    if (!process.env.MOSAIK3LAB_NO_MIGRATE) migrationNotes = migrateLegacy();
    start = readStartFile();
  } catch (err) {
    return { config: structuredClone(DEFAULTS), errors: [`Startdatei nicht lesbar oder ungültig (${err.message}) – es gelten Standardwerte. Vorige Fassung: ${CONFIG_FILE}.bak`] };
  }
  try {
    const dataDir = start?.dataDir || '';
    const rows = settingsdb.readAll(settingsdb.dbFileOf(dataDir || defaultDataDir()));
    const raw = unflatten(rows);
    raw.paths = { ...ohneFremdePfade(raw.paths), dataDir };
    if (start?.managerPort) raw.manager = { ...raw.manager, port: start.managerPort };
    const config = validate(merge(DEFAULTS, keepLegacyPortal(raw)));
    return { config, errors: [] };
  } catch (err) {
    const config = structuredClone(DEFAULTS);
    config.paths.dataDir = start?.dataDir || ''; // der Ort der Datenbank bleibt – sonst würde Reparieren in einen anderen Ordner schreiben
    return { config, errors: [`Konfiguration ungültig oder Datenbank nicht lesbar (${err.message}) – es gelten Standardwerte.`] };
  }
}

/** Wurde die Datenbank (z. B. von einem anderen Prozess oder durch eine Wiederherstellung) geändert, neu laden. */
function fresh() {
  if (!state) {
    state = load();
    stateStamp = dbStamp(state.config);
    stateCheckedAt = Date.now();
  } else if (Date.now() - stateCheckedAt > 1000) {
    stateCheckedAt = Date.now();
    const s = dbStamp(state.config);
    if (s !== stateStamp) {
      state = load();
      stateStamp = dbStamp(state.config);
    }
  }
  return state;
}

export const getConfig = () => fresh().config;
export const migrationLog = () => (fresh(), migrationNotes);

export const configErrors = () => fresh().errors;

/**
 * Sicherung gegen Fehlgriffe: Ist die Konfiguration fehlerhaft, gelten Standardwerte – die zeigen womöglich auf einen
 * ganz anderen Datenordner. Deshalb sind dann alle Aktionen gesperrt, die Daten schreiben oder Dienste starten.
 * Reparieren: Einstellungen speichern (vorige Fassung bleibt als .bak) oder die Datei von Hand korrigieren.
 */
export function requireValidConfig() {
  if (fresh().errors.length) throw new InputError(`Die Konfiguration ist fehlerhaft – Aktion gesperrt. ${fresh().errors[0]}`, `Einstellungen prüfen und speichern oder ${CONFIG_FILE} korrigieren.`);
}
export const reloadConfig = () => {
  state = load();
  stateStamp = dbStamp(state.config);
  stateCheckedAt = Date.now();
  return state.config;
};

/** Ändert Einstellungen (Teilobjekt) und speichert sie in der Datenbank (kurze Transaktion); Startdatei nur bei Bedarf. */
export function updateConfig(patch, file = CONFIG_FILE) {
  const next = validate(merge(fresh().config, patch));
  const dataDir = next.paths.dataDir || defaultDataDir();
  writeDb(dataDir, next);
  const start = readStartFile(file) ?? {};
  if ((start.dataDir || '') !== next.paths.dataDir || start.managerPort !== next.manager.port || !('dataDir' in start)) {
    writeJsonAtomic(file, { dataDir: next.paths.dataDir, managerPort: next.manager.port }, { backup: true });
  }
  if (file === CONFIG_FILE) {
    state = { config: next, errors: [] };
    stateStamp = dbStamp(next);
    stateCheckedAt = Date.now();
  }
  return next;
}

export function writeJsonAtomic(file, data, { backup = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  if (backup && fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  fs.renameSync(tmp, file);
}

/** Einstellungen ohne Geheimnisse (Oberfläche, CLI). */
export function publicConfig(c = fresh().config) {
  return { ...c, manager: { port: c.manager.port } };
}


/**
 * Feste Ordnerstruktur einer Installation (Vorgaben, im Einrichtungsdialog änderbar):
 *   Windows: C:\Mosaik3LAB\{programm, daten, ablage, backups, logs, manager}
 *   Linux:   /opt/mosaik3lab · /var/lib/mosaik3lab/{daten, ablage, manager} · /var/backups/mosaik3lab · /var/log/mosaik3lab
 */
export function layout({ programRoot, dataRoot, backupDir, logDir, managerDir } = {}) {
  const d = platform.defaults();
  programRoot ??= d.programRoot;
  dataRoot ??= d.dataRoot;
  // Dienstdateien, WinSW, install-manifest: Windows im Programmordner (Program Files), sonst im Datenordner
  const manager = managerDir ?? (platform.serviceFilesInProgram ? programRoot : path.join(dataRoot, 'manager'));
  return {
    programRoot,
    dataRoot,
    daten: path.join(dataRoot, 'daten'),
    ablage: path.join(dataRoot, 'ablage'),
    ablageSub: [], // Unterstruktur legt die App selbst an: <objekttyp>/<objekt-id>/<rolle>/ (docs/DATENMODELL.md)
    backups: backupDir ?? (dataRoot === d.dataRoot ? d.backupDir : path.join(dataRoot, 'backups')),
    logs: logDir ?? (dataRoot === d.dataRoot ? d.logDir : path.join(dataRoot, 'logs')),
    manager,
    services: path.join(manager, 'dienste'),
    tools: path.join(manager, 'werkzeuge'),
    configFile: path.join(dataRoot, 'mosaik3lab.json'), // Startdatei { dataDir, managerPort }
    manifest: path.join(manager, 'install-manifest.json'),
  };
}

/** Tatsächlich benutzte Ordner. */
export function resolvePaths(c = fresh().config) {
  if (INSTALL) {
    const l = layout({ programRoot: INSTALL.programRoot, dataRoot: INSTALL.dataRoot, logDir: INSTALL.logDir });
    const dataDir = c.paths.dataDir || l.daten;
    return {
      mode: 'installation',
      programRoot: l.programRoot,
      programDir: path.join(l.programRoot, 'current'),
      dataRoot: l.dataRoot,
      dataDir,
      ablageDir: c.paths.ablageDir || l.ablage,
      backupDir: c.paths.backupDir || l.backups,
      logDir: c.paths.logDir || l.logs,
      dbFile: settingsdb.dbFileOf(dataDir),
      keyFile: path.join(path.dirname(CONFIG_FILE), 'backup.key'),
      configFile: CONFIG_FILE,
    };
  }
  const dataDir = c.paths.dataDir || defaultDataDir();
  return {
    mode: 'entwicklung',
    programRoot: null,
    programDir: PROGRAM_DIR,
    dataRoot: null,
    dataDir,
    // wie die App: ohne eigenen Datenordner <Wurzel>\ablage, sonst <Datenordner>\ablage
    ablageDir: c.paths.ablageDir || (c.paths.dataDir ? path.join(dataDir, 'ablage') : path.join(devDataRoot(), 'ablage')),
    backupDir: c.paths.backupDir || path.join(devDataRoot(), 'backups'),
    logDir: c.paths.logDir || path.join(MANAGER_DIR, 'logs'),
    dbFile: settingsdb.dbFileOf(dataDir),
    keyFile: path.join(path.dirname(CONFIG_FILE), 'backup.key'),
    configFile: CONFIG_FILE,
  };
}
