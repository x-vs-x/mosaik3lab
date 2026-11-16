// Abgleichen: Der Systemzustand (Dienste, Firewall-Regel, Ports, Ordner) wird immer AUS der Datenbank abgeleitet.
// Läuft automatisch nach „Wiederherstellen“ und bei „Aus Backup einrichten“, auf Knopfdruck („Abgleichen“) und als
// Prüfung im doctor (dryRun). Nichts davon steht in der Datenbank – sie sagt nur, wie es sein soll.
//   - Manager-Port: Wert aus der Datenbank → Startdatei (wirkt nach Neustart des Managers)
//   - Ordner (Ablage, Backup-Ziel, Protokolle): anlegbar und beschreibbar? Sonst Rückfrage (needsInput) – z. B. anderes
//     Laufwerk auf einem neuen Rechner. Antworten kommen als paths: { ablageDir: '…' } und werden gespeichert.
//   - Firewall-Regel passend zu „Im Netzwerk freigeben“ und Port
//   - Dienste eingerichtet? Web-App läuft auf dem eingestellten Port/Host (sonst Neustart)
import fs from 'node:fs';
import path from 'node:path';
import { platform, FIREWALL_RULE } from '../platform/index.mjs';
import { getConfig, reloadConfig, resolvePaths, updateConfig, checkDir, readStartFile, writeStartFile, CONFIG_FILE, INSTALL } from './config.mjs';
import * as settingsdb from './settingsdb.mjs';
import { portConflict, portalConflict, firewallStatus, firewallExists, readState, serviceStatus, restartService, admin, appHost, localAppUrl, candidateFirewallPorts } from './services.mjs';
import { logger } from './log.mjs';

const PATH_KEYS = { ablageDir: 'Ablageordner', backupDir: 'Backup-Ziel', logDir: 'Protokollordner' };

function usable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.schreibtest-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe);
    return null;
  } catch (err) {
    return err.code === 'ENOENT' || err.code === 'ENOTDIR' ? 'Laufwerk oder übergeordneter Ordner fehlt' : `nicht beschreibbar (${err.code ?? err.message})`;
  }
}

/**
 * Abgleich. opts: { dryRun, paths: { ablageDir?, backupDir?, logDir? }, restart (Web-App neu starten, wenn sie läuft; Standard true),
 *   firewall (Regeln anpassen; false = Abweichung nur melden – beim Start des Managers, damit keine Windows-Bestätigung ungefragt erscheint) }.
 * → { ok, needsInput: [{ key, label, path, reason }], restartNeeded, steps: [{ id, status, detail, command? }] }
 */
export async function reconcile({ dryRun = false, paths = {}, restart = true, firewall = true } = {}) {
  if (!dryRun) reloadConfig();
  const steps = [];
  const add = (id, status, detail, command) => steps.push({ id, status, detail, ...(command ? { command } : {}) });
  const needsInput = [];
  let restartNeeded = false;
  const apply = dryRun ? 'geplant' : 'fertig';

  // 1. Manager-Port: Datenbank → Startdatei
  try {
    const start = readStartFile() ?? {};
    const dbPort = settingsdb.readBereich(resolvePaths().dbFile, 'manager')['manager.port'];
    if (dbPort && start.managerPort && dbPort !== start.managerPort) {
      if (!dryRun) writeStartFile(CONFIG_FILE, { dataDir: start.dataDir, managerPort: dbPort });
      add('manager-port', apply, `Manager-Port ${start.managerPort} → ${dbPort} (wirkt nach Neustart des Managers)`);
    } else add('manager-port', 'ok', `Manager-Port ${getConfig().manager.port}`);
  } catch (err) {
    add('manager-port', 'fehler', err.message);
  }

  // 2. Ordner: Antworten übernehmen, sonst prüfen
  const overrides = {};
  for (const [key, label] of Object.entries(PATH_KEYS)) {
    if (!paths[key]) continue;
    try {
      overrides[key] = checkDir(paths[key], label, { allowEmpty: false });
    } catch (err) {
      add(`ordner-${key}`, 'fehler', err.message);
      needsInput.push({ key, label, path: resolvePaths()[key], reason: err.message });
    }
  }
  if (Object.keys(overrides).length && !dryRun) updateConfig({ paths: overrides });
  const p = resolvePaths(dryRun ? { ...getConfig(), paths: { ...getConfig().paths, ...overrides } } : getConfig());
  for (const [key, label] of Object.entries(PATH_KEYS)) {
    if (needsInput.some((n) => n.key === key)) continue;
    const problem = usable(p[key]);
    if (problem) {
      needsInput.push({ key, label, path: p[key], reason: problem });
      add(`ordner-${key}`, 'rueckfrage', `${label} ${p[key]}: ${problem} – bitte einen anderen Ordner angeben`);
    } else add(`ordner-${key}`, overrides[key] ? apply : 'ok', `${label}: ${p[key]}${overrides[key] ? ' (neu eingestellt)' : ''}`);
  }
  const dataProblem = fs.existsSync(p.dataDir) ? null : 'Datenordner fehlt';
  add('ordner-dataDir', dataProblem ? 'warnung' : 'ok', dataProblem ?? `Datenordner: ${p.dataDir}`);

  // 3. Port frei?
  const c = getConfig();
  const conflict = await portConflict().catch(() => null);
  add('port', conflict ? 'warnung' : 'ok', conflict ? conflict.message : `Web-App-Port ${c.app.port}`);

  // 4. Firewall-Regeln passend zu „Im Netzwerk freigeben“: mit Portal dessen Ports (80, bei HTTPS auch 443), sonst der Port der App;
  //    Regeln früherer Ports (z. B. der alte App-Port 3001) werden entfernt
  try {
    const fw = await firewallStatus();
    const want = fw.ports;
    if (!fw.active) add('firewall', 'ok', 'Keine Firewall aktiv – die Ports sind ohne Regel erreichbar');
    else if (fw.ruleExists === null) add('firewall', 'ok', 'Firewall-Regel nicht prüfbar – übersprungen');
    else {
      const others = candidateFirewallPorts(c).filter((p) => !want.includes(p));
      const found = await Promise.all(others.map((p) => firewallExists(p).catch(() => false)));
      const stale = others.filter((_, i) => found[i]);
      const existingWanted = want.filter((p) => !fw.missingPorts.includes(p));
      const addPorts = c.app.network ? fw.missingPorts : [];
      const removePorts = c.app.network ? stale : [...existingWanted, ...stale];
      if (!addPorts.length && !removePorts.length) add('firewall', 'ok', c.app.network ? `Regeln vorhanden: ${want.map((p) => `„${FIREWALL_RULE(p)}“`).join(', ')}` : 'keine Freigabe nötig');
      else if (!firewall && !dryRun) {
        add('firewall', 'warnung', `Firewall passt nicht zu „Im Schulnetz erreichbar“ (${[addPorts.length && `Regel für Port ${addPorts.join(', ')} fehlt`, removePorts.length && `alte Regel für Port ${removePorts.join(', ')}`].filter(Boolean).join(', ')})`);
      } else {
        const script = [...removePorts.map((p) => platform.firewall.removeScript(p)), ...addPorts.map((p) => platform.firewall.allowScript(p))].join('\n');
        if (!dryRun) await admin(script, 'Firewall abgleichen');
        add('firewall', apply, [addPorts.length && `Regel(n) anlegen für Port ${addPorts.join(', ')}`, removePorts.length && `Regel(n) entfernen für Port ${removePorts.join(', ')}`].filter(Boolean).join('; '), dryRun ? script : undefined);
        if (addPorts.length) restartNeeded = true;
      }
    }
  } catch (err) {
    add('firewall', 'fehler', err.message, err.command); // ohne Adminrechte: Befehl für die IT mitgeben
  }

  // 5. Dienste eingerichtet? (nur in einer Installation)
  if (INSTALL) {
    for (const key of ['webapp', 'backup', ...(c.portal.enabled ? ['portal'] : []), 'manager']) {
      const st = await platform.services.status(key).catch(() => ({ installed: false }));
      // Paket-Installation: repariert wird mit dem Installer-Paket (der Manager-Dienst hat dafür keine Rechte)
      const fix = fs.existsSync(path.join(INSTALL.programRoot, 'current', 'paket.json')) ? `das Installer-Paket erneut ausführen (${platform.id === 'windows' ? 'Installieren.cmd' : 'sudo ./installieren.sh'})` : '„Einrichten“ erneut ausführen';
      add(`dienst-${key}`, st.installed ? 'ok' : 'warnung', st.installed ? `Dienst ${key} eingerichtet` : `Dienst ${key} fehlt – ${fix}`);
    }
  }

  // 6. Läuft die Web-App mit den Werten aus der Datenbank?
  const web = await serviceStatus('webapp').catch(() => null);
  if (web?.running) {
    const st = readState('webapp');
    const host = appHost(); // mit Portal immer 127.0.0.1
    const stale = (st?.port && st.port !== c.app.port) || (st?.host && st.host !== host) || restartNeeded;
    if (stale && restart) {
      if (!dryRun) await restartService('webapp');
      add('webapp', apply, 'Web-App mit den Werten aus der Datenbank neu gestartet');
    } else add('webapp', stale ? 'warnung' : 'ok', stale ? 'Web-App läuft noch mit alten Werten – neu starten' : `Web-App läuft auf Port ${c.app.port}`);
  } else add('webapp', 'ok', 'Web-App läuft nicht – startet mit den Werten aus der Datenbank');

  // 6b. Portal: läuft er, sind die Ports frei, ist HTTPS vollständig?
  if (c.portal.enabled) {
    const busy = await portalConflict().catch(() => []);
    const portal = await serviceStatus('portal').catch(() => null);
    if (busy.length) add('portal', 'warnung', busy.map((b) => b.message).join(' '));
    else if (portal?.running && portal.light === 'ok') add('portal', 'ok', `Portal läuft (Ports ${portal.ports?.join(', ') ?? '?'}): ${localAppUrl(c)}`);
    else add('portal', 'warnung', portal?.lastError ?? 'Portal läuft nicht – Karte „Dienste“ → Portal → Starten.');
  } else add('portal', 'ok', 'Portal ausgeschaltet – die App ist direkt auf ihrem Port erreichbar');

  // 7. Zeitplan, Update-Quelle (nur Anzeige: werden bei jedem Lauf aus der Datenbank gelesen)
  add('backup-zeitplan', 'ok', `${c.backup.enabled ? `Sicherung täglich ${c.backup.time}` : 'Automatische Sicherung aus'}, ${c.backup.keep} Sicherungen aufbewahren${c.backup.encrypt ? ', verschlüsselt' : ''}`);
  add('update-quelle', 'ok', c.update.repo ? `${c.update.repo} (${c.update.branch})` : 'Arbeitskopie');

  const bad = steps.some((s) => ['fehler', 'warnung'].includes(s.status));
  if (!dryRun) logger('manager').info(`Abgleich ${needsInput.length ? 'braucht Rückfrage' : bad ? 'mit Hinweisen' : 'erledigt'}: ${steps.filter((s) => s.status === 'fertig').length} Änderung(en)`);
  return { ok: !bad && !needsInput.length, needsInput, restartNeeded, steps };
}
