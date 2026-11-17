// Gesamtstatus (für die Seite) und „doctor“ (alle Prüfungen mit Ampel und „Was tun?“, für CLI und Tests).
import fs from 'node:fs';
import { activeAdminCount } from './admin.mjs';
import { appRunnable } from './appstart.mjs';
import path from 'node:path';
import { getConfig, configErrors, resolvePaths } from './config.mjs';
import { allServices, portConflict, portalConflict, suggestPortalPort, firewallStatus, firewallActive, fetchHealth, localAppUrl, externalPortalUrl, portOwner, publicNetwork, PUBLIC_NETWORK_HINT } from './services.mjs';
import { mailState } from './mail.mjs';
import { listBackups, nextBackupTime, filesNote } from './backup.mjs';
import { installedVersion } from './update.mjs';
import { nodeOk, MIN_NODE } from './setup.mjs';
import { runtimeStatus } from './runtime.mjs';
import { reconcile } from './reconcile.mjs';
import { keyFileExists } from './backupcrypto.mjs';
import { inspectCertCached, portalUrls, hostIdentity } from './portalcert.mjs';
import { autoState, refreshStale } from './auto.mjs';
import { tail } from './log.mjs';
import { platform } from '../platform/index.mjs';

const RANK = { ok: 0, info: 0, off: 0, warn: 1, error: 2 };
const worst = (lights) => lights.reduce((w, l) => (RANK[l] > RANK[w] ? l : w), 'ok');
const LABEL = { ok: 'alles in Ordnung', warn: 'Hinweise beachten', error: 'Handlungsbedarf' };

/**
 * Ein Satz für oben auf der Seite: „Alles in Ordnung.“ bzw. „1 Punkt braucht Aufmerksamkeit: …“ – mit dem Knopf (fix)
 * des wichtigsten Punkts. Hinweise der Stufe „info“ zählen nicht.
 */
export function summarize(notes) {
  const todo = notes.filter((n) => n.light === 'warn' || n.light === 'error').sort((a, b) => RANK[b.light] - RANK[a.light]);
  if (!todo.length) return { light: 'ok', text: 'Alles in Ordnung.', count: 0, fix: null };
  const first = todo[0];
  return { light: worst(todo.map((n) => n.light)), text: `${todo.length === 1 ? '1 Punkt braucht' : `${todo.length} Punkte brauchen`} Aufmerksamkeit: ${first.text}`, count: todo.length, fix: first.fix ?? null };
}

/**
 * Hinweis, wenn ein Portal-Port (meist 80) belegt ist: wer ihn belegt, und als Vorschlag ein freier Ausweich-Port mit der
 * Adresse, die sich dann ergibt – samt Knopf „Port … verwenden“ (fix portal-port:<port>).
 */
export async function portalBusyNote(busy, c = getConfig(), suggest = suggestPortalPort) {
  const http = busy.find((b) => b.port === c.portal.httpPort);
  const alt = http ? await suggest() : null;
  const text = `${busy.map((b) => b.message).join(' ')} Das Portal kann so nicht starten, Mosaik³LAB ist im Schulnetz nicht erreichbar.`;
  if (!alt) return { light: 'error', text: `${text} Das andere Programm beenden oder unter „Netzwerk“ → „Ports“ einen anderen Port einstellen.`, fix: 'ports' };
  return { light: 'error', text: `${text} Vorschlag: das andere Programm beenden – oder Port ${alt} verwenden, dann lautet die Adresse http://<Server>:${alt}${c.portal.basePath}.`, fix: `portal-port:${alt}` };
}

/**
 * Adressen der App: im Schulnetz (nur bei „Im Schulnetz erreichbar“) und auf diesem Rechner. external: Adresse einer
 * außerhalb des Managers gestarteten App auf dem Portal-Port (Entwicklung) – die gilt dann, mit den Adressen im Netz.
 */
export function appAddresses(c = getConfig(), identity = hostIdentity(), external = null) {
  if (external) return { local: external, network: [identity.hostname, ...identity.ips].map((h) => external.replace('127.0.0.1', h)) };
  const local = localAppUrl(c);
  if (!c.app.network) return { local, network: [] };
  if (c.portal.enabled) return { local, network: portalUrls(c, identity) };
  return { local, network: [identity.hostname, ...identity.ips].map((h) => `http://${h}:${c.app.port}${c.portal.basePath}/`) };
}

/** Linux: zu altes oder fehlendes polkit (der Manager kann die Dienste nicht steuern) – ändert sich nicht, einmal prüfen. */
let polkitChecked;
const polkitNote = () => (polkitChecked ??= platform.polkitProblem && process.getuid?.() !== 0 ? platform.polkitProblem().catch(() => null) : Promise.resolve(null));

/** Alles, was die Seite braucht – in einem Aufruf. */
export async function pageStatus() {
  const c = getConfig();
  // Alles gleichzeitig; langsame Systemabfragen sind gemerkt (services.mjs). Gemerkte Prüfungen (Abweichungen, Laufzeit)
  // frischt refreshStale im Hintergrund auf – die Seite wartet darauf höchstens kurz, der nächste Status zeigt das Ergebnis.
  const [services, backups, conflict, busy, cert, external, onPublicNetwork] = await Promise.all([
    allServices(), listBackups(10), portConflict(),
    c.portal.enabled ? portalConflict().catch(() => []) : [],
    c.portal.https ? inspectCertCached() : null,
    externalPortalUrl(c).catch(() => null),
    c.app.network ? publicNetwork().catch(() => false) : false,
    Promise.race([refreshStale(), new Promise((r) => setTimeout(r, 500))]),
  ]);
  const web = services.find((s) => s.key === 'webapp');
  const health = web.running || web.external ? await fetchHealth(c.app.port, web.basePath) : null;
  const appExternal = web.external ? `http://127.0.0.1:${c.app.port}${web.basePath}/` : null; // ohne Vite/Portal davor
  const p = resolvePaths();
  const auto = autoState();
  // fix: Knopf zur Lösung (die Oberfläche kennt: start:<dienst>, backup, reconcile, backup-password, https, advanced)
  const notes = [...configErrors().map((t) => ({ light: 'error', text: t, fix: 'advanced' }))];
  if (conflict) notes.push({ light: 'error', text: conflict.message, fix: 'advanced' });
  if (!nodeOk()) notes.push({ light: 'error', text: `Node.js ${process.version} ist zu alt (mindestens ${MIN_NODE.join('.')}).`, fix: 'advanced' });
  if (web.external) notes.push({ light: 'info', text: 'Die Web-App wurde außerhalb des Managers gestartet (z. B. Entwicklung) – Starten und Stoppen dort, nicht hier.' });
  else if (!web.running && !conflict) notes.push({ light: 'error', text: 'Die Web-App läuft nicht.', fix: 'start:webapp' });
  else if (web.running && !web.healthy && web.phase === 'restarting' && web.lastError) notes.push({ light: 'error', text: `Die Web-App startet immer wieder neu (${web.lastError}) – Protokoll unter „System“ ansehen.`, fix: 'log' });
  const portalSvc = services.find((s) => s.key === 'portal');
  if (c.portal.enabled) {
    if (busy.length) notes.push(await portalBusyNote(busy, c));
    else if (portalSvc && !portalSvc.running && !portalSvc.external) notes.push({ light: 'error', text: portalSvc.lastError ?? 'Das Portal läuft nicht – ohne Portal ist die App im Schulnetz nicht erreichbar.', fix: 'start:portal' });
    else if (portalSvc?.light === 'error') notes.push({ light: 'error', text: portalSvc.lastError ?? 'Das Portal meldet einen Fehler.', fix: 'advanced' });
    if (c.portal.https && !cert?.present) notes.push({ light: 'error', text: 'HTTPS ist eingeschaltet, aber es ist kein Zertifikat hinterlegt.', fix: 'https' });
    for (const t of cert?.problems ?? []) notes.push({ light: 'error', text: t, fix: 'https' });
    for (const w of cert?.warnings ?? []) notes.push({ light: 'warn', text: w, fix: 'https' });
  }
  if (onPublicNetwork) notes.push({ light: 'warn', text: PUBLIC_NETWORK_HINT });
  const bk = services.find((s) => s.key === 'backup');
  const autoBackup = c.backup.enabled;
  if (autoBackup && !bk.running) notes.push({ light: 'warn', text: 'Der Backup-Dienst läuft nicht – automatische Sicherungen finden nicht statt.', fix: 'start:backup' });
  const last = backups[0];
  // Fehlschlag nur melden, solange es danach keine erfolgreiche Sicherung gibt (automatisch oder „Jetzt sichern“).
  const failed = bk?.lastRun?.ok === false && !backups.some((b) => Date.parse(b.created) >= Date.parse(bk.lastRun.at));
  if (failed) notes.push({ light: 'error', text: `Die letzte automatische Sicherung ist fehlgeschlagen (${bk.lastRun.error}). Es wird alle 15 Minuten erneut versucht.`, fix: 'backup' });
  if (!last) notes.push({ light: 'warn', text: 'Es gibt noch keine Sicherung.', fix: 'backup' });
  else if (Date.now() - Date.parse(last.created) > 2 * 86400_000) notes.push({ light: autoBackup ? 'warn' : 'info', text: autoBackup ? 'Die letzte Sicherung ist älter als 2 Tage.' : 'Die automatische Sicherung ist ausgeschaltet, die letzte Sicherung ist älter als 2 Tage.', fix: 'backup' });
  if (c.backup.encrypt && !keyFileExists()) notes.push({ light: 'error', text: 'Sicherungen sollen verschlüsselt werden, aber es gibt kein Backup-Passwort – Sicherungen schlagen fehl.', fix: 'backup-password' });
  else if (!c.backup.encrypt) notes.push({ light: 'info', text: 'Sicherungen sind nicht verschlüsselt, enthalten aber das Mail-Passwort und die Konten.', fix: 'backup-password' });
  for (const d of auto.drift) notes.push({ light: d.status === 'fehler' ? 'error' : 'warn', text: `${d.detail} – „Abgleichen“ behebt das.`, fix: 'reconcile' });
  for (const r of auto.runtime.filter((x) => x.light === 'error')) notes.push({ light: 'error', text: `${r.title}: ${r.label}.`, fix: 'advanced' });
  const mail = mailState();
  if (mail.linkWarnung) notes.push({ light: 'warn', text: mail.linkWarnung, fix: 'mail' });
  const polkit = p.mode === 'installation' ? await polkitNote() : null;
  if (polkit) notes.push({ light: 'warn', text: polkit });
  if (p.mode !== 'installation') notes.push({ light: 'info', text: 'Läuft aus der Arbeitskopie – für den Dauerbetrieb unter „System“ → „Einrichten“.' });
  const summary = summarize(notes);
  const light = summary.light;
  return {
    light, label: LABEL[light], summary, services, conflict, notes,
    backups, lastBackup: backups[0] ?? null, nextBackup: bk?.running ? (nextBackupTime()?.toISOString() ?? null) : null, backupAuto: autoBackup, backupDir: p.backupDir, filesMissingNote: filesNote(),
    backupEncrypted: c.backup.encrypt && keyFileExists(), version: installedVersion(), node: process.version, mode: p.mode, network: c.app.network, appPort: c.app.port,
    mail, database: databaseInfo(health), addresses: external ? appAddresses(c, undefined, external) : appExternal ? { local: appExternal, network: [] } : appAddresses(c),
    updates: { app: auto.update, runtime: auto.runtime.filter((x) => x.light === 'warn'), checkedAt: auto.checkedAt.update ?? auto.checkedAt.runtime ?? null },
    portal: { ...c.portal, openUrl: external ?? appExternal ?? localAppUrl(c), urls: portalUrls(c), certificate: cert },
    // Für die Oberfläche: was es auf diesem System gibt (z. B. Firewall-Hinweise, Windows-Dienstprogramm)
    system: { id: platform.id, label: platform.label, arch: process.arch, firewall: await firewallActive().catch(() => true) },
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Datenbank-Zustand – nur lesend über /api/health der App (die App legt DB und Tabellen selbst an):
 * { db: { vorhanden, schemaVersion, groesseBytes } }. Läuft die Web-App nicht, nur Datei vorhanden + Größe.
 */
function databaseInfo(health) {
  const file = path.join(resolvePaths().dataDir, 'mosaik3lab.db');
  const db = health?.db;
  const mb = (b) => `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  if (db?.vorhanden) return { present: true, schemaVersion: db.schemaVersion ?? null, sizeBytes: db.groesseBytes ?? null, label: `vorhanden, Schema ${db.schemaVersion ?? '?'}, ${mb(db.groesseBytes ?? 0)}` };
  if (fs.existsSync(file)) {
    const size = [file, `${file}-wal`].reduce((n, f) => n + (fs.existsSync(f) ? fs.statSync(f).size : 0), 0); // WAL gehört dazu
    return { present: true, schemaVersion: null, sizeBytes: size, label: `vorhanden, ${mb(size)} (Web-App gestoppt)` };
  }
  return { present: false, label: 'noch keine – wird beim ersten Start der Web-App angelegt' };
}

/** Ablageordner nur lesend prüfen: vorhanden, beschreibbar, freier Platz. */
export function ablageState(dir) {
  if (!fs.existsSync(dir)) return { light: 'warn', hint: 'Ordner fehlt – die Web-App legt ihn beim Start an.' };
  try {
    fs.accessSync(dir, fs.constants.W_OK);
  } catch {
    return { light: 'error', hint: 'Nicht beschreibbar – Rechte des Dienstkontos prüfen.' };
  }
  try {
    const st = fs.statfsSync(dir);
    const free = st.bavail * st.bsize;
    if (free < 1024 ** 3) return { light: 'warn', hint: `Nur noch ${Math.round(free / 1024 / 1024)} MB frei.` };
  } catch {
    /* freier Platz nicht ermittelbar */
  }
  return { light: 'ok', hint: '' };
}

/**
 * Waisen-Prüfung: Dateien laut Tabelle „datei“ ↔ Dateien im Ablageordner (nur lesend, node:sqlite).
 * null, wenn es noch keine Datenbank gibt.
 */
export async function ablageOrphans(p) {
  const file = path.join(p.dataDir, 'mosaik3lab.db');
  if (!fs.existsSync(file)) return null;
  let rows;
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      rows = db.prepare('SELECT pfad FROM datei').all().map((r) => String(r.pfad));
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
  const known = new Set(rows);
  const missing = rows.filter((r) => !fs.existsSync(path.join(p.ablageDir, ...r.split('/'))));
  const extra = [];
  if (fs.existsSync(p.ablageDir)) {
    for (const e of fs.readdirSync(p.ablageDir, { recursive: true, withFileTypes: true })) {
      if (!e.isFile() || e.name.startsWith('.')) continue;
      const rel = path.relative(p.ablageDir, path.join(e.parentPath ?? e.path, e.name)).split(path.sep).join('/');
      if (!known.has(rel)) extra.push(rel);
    }
  }
  return { total: rows.length, missing, extra };
}

/** Alle Prüfungen. exitCode: 0 grün, 1 Warnung, 2 Fehler. */
export async function doctor() {
  const s = await pageStatus();
  const p = resolvePaths();
  const items = [];
  const add = (title, light, value, hint = '') => items.push({ title, light, value, hint });
  add('Plattform', platform.untested ? 'info' : 'ok', `${platform.label} ${process.arch}${platform.untested ? ' (ungetestet)' : ''}`);
  // Laufzeit: Node.js, Git, Dienst-Wrapper. Eine neuere Version ist nur ein Hinweis (info), fehlendes Git bzw. zu altes Node ein Fehler.
  for (const r of (await runtimeStatus()).rows) add(r.title, r.light === 'warn' && r.installed ? 'info' : r.light, r.label, r.hint || (r.light === 'warn' ? 'Manager → Karte „Update verfügbar“ (oder: cli runtime update ' + r.id + ').' : ''));
  add('Abhängigkeiten', appRunnable(p.programDir) ? 'ok' : 'error', p.programDir, 'Im Programmordner „npm ci“ ausführen bzw. „Einrichten“.');
  add('Oberfläche gebaut', fs.existsSync(path.join(p.programDir, 'client', 'dist', 'index.html')) ? 'ok' : 'warn', '', 'Wird beim ersten Start der Web-App gebaut (npm run build).');
  for (const e of configErrors()) add('Konfiguration', 'error', p.configFile, e);
  for (const sv of s.services) add(sv.title, sv.light === 'off' ? (sv.key === 'webapp' ? 'error' : 'warn') : sv.light, sv.label + (sv.installed ? ' (Dienst)' : ''), sv.lastError ?? (sv.running ? '' : 'Starten (Oberfläche oder: cli start ' + sv.key + ').'));
  add('Mailversand eingerichtet', s.mail.configured ? 'ok' : s.mail.enabled ? 'warn' : 'info', s.mail.label, s.mail.configured ? '' : 'Reiter „E-Mail“ → „E-Mails verschicken“.');
  add('Datenbank', 'info', s.database.label);
  const pc = getConfig().portal;
  if (pc.enabled) {
    const ps = s.services.find((x) => x.key === 'portal');
    if (ps?.external) add('Portal', 'info', `${ps.label} → ${s.portal.openUrl}`);
    else add('Portal', ps?.running && ps.light === 'ok' ? 'ok' : 'error', ps?.running && ps.light === 'ok' ? `läuft (Ports ${ps.ports?.join(', ')}) → ${s.portal.urls[0] ?? ''}` : ps?.lastError ?? 'läuft nicht', 'Dienste → Portal → Starten; bei belegtem Port 80/443 anderen Port einstellen oder IIS/nginx als Vorschaltdienst nutzen (manager/README.md).');
    if (pc.https) {
      const ci = s.portal.certificate;
      add('HTTPS-Zertifikat', !ci?.present ? 'error' : ci.problems?.length ? 'error' : ci.warnings?.length ? 'warn' : 'ok', ci?.present ? (ci.valid ? `${ci.subject}, gültig bis ${ci.notAfter.slice(0, 10)} (${ci.daysLeft} Tage)` : ci.problems[0]) : 'fehlt', ci?.warnings?.[0] ?? (ci?.present ? '' : 'Reiter „Netzwerk“ → HTTPS → Zertifikat erzeugen oder hinterlegen.'));
    }
  } else add('Portal', 'info', 'aus – die App ist direkt auf ihrem Port erreichbar');
  const admins = await activeAdminCount(path.join(p.dataDir, 'mosaik3lab.db'));
  if (admins === 0) add('Administrator-Konto', 'warn', 'kein aktiver Administrator', 'Beim ersten Aufruf der App wird er angelegt – bitte gleich erledigen (Adressen: manager/cli.mjs erstzugang).');
  add('Einstellungen', 'ok', `in der Datenbank (${p.dbFile}); Startdatei ${p.configFile}`);
  add('Backup-Verschlüsselung', getConfig().backup.encrypt ? (keyFileExists() ? 'ok' : 'error') : 'info', getConfig().backup.encrypt ? (keyFileExists() ? 'AES-256-GCM, Passwort in backup.key' : 'Passwort fehlt') : 'aus – Sicherungen enthalten Passwörter im Klartext', getConfig().backup.encrypt ? 'Backup-Passwort festlegen: cli backup password set|generate.' : 'Empfohlen: cli backup password generate.');
  // Abgleich: weicht das System von der Datenbank ab (Firewall-Regel, Ordner, Dienste …)?
  const drift = await reconcile({ dryRun: true }).catch((e) => ({ steps: [{ id: 'abgleich', status: 'fehler', detail: e.message }], needsInput: [] }));
  for (const st of drift.steps.filter((x) => ['geplant', 'warnung', 'fehler', 'rueckfrage'].includes(x.status))) add(`Abweichung: ${st.id}`, st.status === 'fehler' ? 'error' : 'warn', st.detail, 'cli reconcile (gleicht das System an die Datenbank an).');
  if (s.conflict) add(`Port ${s.conflict.port}`, 'error', s.conflict.process ?? '?', s.conflict.message);
  const lastData = s.backups[0];
  add('Letzte Sicherung', lastData ? (Date.now() - Date.parse(lastData.created) > 2 * 86400_000 ? 'warn' : 'ok') : 'warn', lastData?.id ?? 'keine', lastData ? '' : 'Jetzt sichern.');
  const ab = ablageState(p.ablageDir);
  add('Ablageordner', ab.light, p.ablageDir, ab.hint);
  const orphans = await ablageOrphans(p);
  if (orphans) {
    const { missing, extra } = orphans;
    const note = filesNote(); // ältere „Nur Datenbank“-Sicherung eingespielt: fehlende Dateien sind erwartet
    add('Ablage ↔ Datenbank', missing.length ? (note ? 'info' : 'error') : extra.length ? 'warn' : 'ok',
      missing.length ? (note ? `${missing.length} Datei(en) fehlen (Backup ohne Dateien)` : `${missing.length} Datei(en) fehlen, ${extra.length} ohne Datensatz`) : extra.length ? `${extra.length} Datei(en) ohne Datensatz` : `${orphans.total} Datei(en) vollständig`,
      missing.length ? (note ? 'Die App zeigt dafür „Datei nicht vorhanden“. Nachholen: eine vollständige Sicherung wiederherstellen, nur Fehlendes: cli backup fill-files <id>.' : `Fehlende Dateien aus einer Sicherung zurückholen (z. B. ${missing[0]}).`) : extra.length ? `Dateien ohne Datensatz (z. B. ${extra[0]}) nach Prüfung löschen oder aufbewahren – die App nutzt sie nicht.` : '');
  }
  for (const [label, dir] of [['Datenordner', p.dataDir], ['Backup-Ziel', p.backupDir]]) add(label, fs.existsSync(dir) ? 'ok' : 'warn', dir, fs.existsSync(dir) ? '' : 'Ordner fehlt – wird beim ersten Start/Backup angelegt.');
  // Der Manager darf nie von außen erreichbar sein.
  const mgr = await portOwner(getConfig().manager.port).catch(() => null);
  if (mgr && !['127.0.0.1', '::1', undefined].includes(mgr.address)) add('Manager-Port', 'error', mgr.address, 'Der Manager lauscht nicht nur lokal – sofort beenden und prüfen.');
  if (s.network) {
    const fw = await firewallStatus();
    if (!fw.active) add('Firewall-Freigabe', 'ok', 'keine Firewall aktiv – Ports offen', '');
    else if (fw.ruleExists === null) add('Firewall-Freigabe', 'info', fw.rule, 'Nicht prüfbar ohne Administratorrechte.');
    else add('Firewall-Freigabe', fw.ruleExists ? 'ok' : 'warn', fw.rule, fw.ruleExists ? '' : 'Schalter „Im Netzwerk freigeben“ erneut einschalten.');
    if (fw.publicNetwork) add('Netzwerkprofil', 'warn', 'Öffentlich', PUBLIC_NETWORK_HINT);
  }
  const errs = tail('app', 300).concat(tail('manager', 300)).filter((l) => l.error).slice(-3);
  const light = worst(items.map((i) => i.light));
  return { light, exitCode: RANK[light], items, recentErrors: errs.map((e) => e.text), mode: p.mode, checkedAt: new Date().toISOString() };
}
