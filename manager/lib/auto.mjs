// Automatik des Managers – damit die IT möglichst wenig von Hand tun muss:
//   - beim Start: Abgleichen (Ordner, Manager-Port, Web-App mit den Werten aus der Datenbank; Firewall wird dabei nur
//     geprüft, damit keine Windows-Bestätigung ungefragt erscheint) und Backup-Dienst starten (Zeitplan ist standardmäßig an)
//   - im Hintergrund: Update (alle 6 Stunden) und Laufzeit (täglich) prüfen, Abweichungen vom Soll (alle 10 Minuten)
//   - nach Änderungen der Einstellungen: abgleichen (afterChange), dann erneut prüfen
// Die Ergebnisse liegen nur im Speicher und erscheinen im Status nur, wenn etwas zu tun ist.
import { reconcile } from './reconcile.mjs';
import { checkUpdate } from './update.mjs';
import { runtimeStatus } from './runtime.mjs';
import { serviceStatus, readState, startService } from './services.mjs';
import { configErrors, INSTALL } from './config.mjs';
import { logger } from './log.mjs';

const log = () => logger('manager');
const DRIFT_IDS = /^(firewall|manager-port|ordner-|dienst-)/; // Rest (Web-App, Portal) meldet der Status ohnehin selbst
const state = { drift: [], update: null, runtime: [], checkedAt: {} };
export const autoState = () => state;

/** Abweichungen System ↔ Datenbank (nur prüfen). */
export async function checkDrift() {
  const r = await reconcile({ dryRun: true }).catch((err) => ({ steps: [{ id: 'abgleich', status: 'fehler', detail: err.message }] }));
  state.drift = r.steps.filter((s) => DRIFT_IDS.test(s.id) && ['geplant', 'warnung', 'fehler', 'rueckfrage'].includes(s.status));
  state.checkedAt.drift = new Date().toISOString();
  return state.drift;
}

/** Update aus Git prüfen – nur in einer Installation (in der Arbeitskopie: git pull). Offline ist kein Fehler. */
export async function checkUpdates(check = checkUpdate) {
  if (!INSTALL) return (state.update = null);
  try {
    const r = await check();
    state.update = { available: r.updateAvailable, id: r.available.id, changes: r.available.changes.slice(0, 10) };
  } catch (err) {
    state.update = { available: false, error: err.message };
  }
  state.checkedAt.update = new Date().toISOString();
  return state.update;
}

/** Laufzeit (Node.js, Git, Dienst-Wrapper) prüfen; gemerkt werden nur Zeilen mit neuerer Version oder Handlungsbedarf. */
export async function checkRuntime(status = runtimeStatus) {
  let full = { rows: [] };
  try {
    full = await status();
  } catch {
    /* offline o. Ä.: nichts zu melden */
  }
  state.runtime = full.rows.filter((r) => r.action && ['warn', 'error'].includes(r.light));
  state.checkedAt.runtime = new Date().toISOString();
  return full;
}

const age = (iso) => Date.now() - Date.parse(iso);
let refreshing = null;
/**
 * Gemerkte Ergebnisse auffrischen, bevor der Status sie zeigt – damit ein Hinweis verschwindet, sobald die Ursache weg ist
 * (z. B. Firewall von Hand repariert, Node.js aktualisiert). Abweichungen höchstens einmal pro Minute, Laufzeit/Update
 * nur solange sie etwas melden, höchstens alle 10 Minuten. Nur wenn die Automatik läuft (sonst gibt es nichts Gemerktes).
 */
export function refreshStale() {
  if (refreshing) return refreshing;
  const jobs = [];
  if (state.checkedAt.drift && age(state.checkedAt.drift) > 60_000) jobs.push(checkDrift());
  if (state.runtime.length && age(state.checkedAt.runtime) > 10 * 60_000) jobs.push(checkRuntime());
  if (state.update?.available && age(state.checkedAt.update) > 10 * 60_000) jobs.push(checkUpdates());
  if (!jobs.length) return Promise.resolve();
  refreshing = Promise.all(jobs).catch(() => {}).finally(() => (refreshing = null));
  return refreshing;
}

/** Backup-Dienst starten, wenn er nicht läuft und nicht ausdrücklich gestoppt wurde (Zeitplan standardmäßig an). */
export async function ensureBackupService() {
  const s = await serviceStatus('backup');
  if (s.running || s.installed || readState('backup')?.phase === 'stopped') return false;
  await startService('backup');
  log().info('Backup-Dienst automatisch gestartet (täglicher Zeitplan).');
  return true;
}

/** Nach einer Änderung der Einstellungen: System angleichen (Firewall inklusive), dann neu prüfen. */
export async function afterChange(opts = {}) {
  const r = await reconcile({ restart: true, ...opts });
  await checkDrift();
  return r;
}

/** Beim Start des Managers (server.mjs). Fehler landen nur im Protokoll – der Manager startet immer. */
export async function startAutomation() {
  if (configErrors().length) return;
  try {
    await reconcile({ restart: true, firewall: false });
    await ensureBackupService();
  } catch (err) {
    log().warn(`Automatik beim Start: ${err.message}`);
  }
  await checkDrift();
  const every = (ms, fn) => setInterval(() => fn().catch(() => {}), ms).unref();
  setTimeout(() => Promise.all([checkUpdates(), checkRuntime()]).catch(() => {}), 10_000).unref();
  every(10 * 60_000, checkDrift);
  every(6 * 3600_000, checkUpdates);
  every(24 * 3600_000, checkRuntime);
}
