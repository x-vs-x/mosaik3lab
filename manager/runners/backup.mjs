// Dienst „Backup“: sichert täglich zur eingestellten Uhrzeit das ganze System (mit Prüfung) und räumt alte Sicherungen auf.
// Ist die automatische Sicherung ausgeschaltet (backup.enabled), wartet er nur. Verpasste Sicherungen (Rechner war zur
// Zeit aus) werden beim Start bzw. beim nächsten Prüfen nachgeholt: fällig ist, wenn die letzte Sicherung älter ist als
// der letzte planmäßige Zeitpunkt. Nach einem Fehlschlag wird frühestens
// nach 15 Minuten erneut versucht; der Fehler steht im Status des Dienstes (und damit als Warnung im Manager).
// Liest Änderungen der Einstellungen bei jedem Prüfen (alle 30 Sekunden) neu ein.
import { createRunner } from './runner.mjs';
import { reloadConfig } from '../lib/config.mjs';
import { createBackup, dueKinds, nextBackupTime, KINDS } from '../lib/backup.mjs';

const RETRY_MS = 15 * 60_000;
const runner = createRunner('backup', 'backup');
let busy = false;
const retryAt = new Map(); // Art → frühester nächster Versuch nach einem Fehler

const nextRun = () => {
  reloadConfig();
  return nextBackupTime()?.toISOString() ?? null;
};
runner.update({ phase: 'running', nextRun: nextRun() });
runner.log.info('Backup-Dienst gestartet (verpasste Sicherungen werden nachgeholt).');

async function tick() {
  if (busy) return;
  busy = true;
  try {
    reloadConfig();
    for (const { kind, slot } of await dueKinds()) {
      if (Date.now() < (retryAt.get(kind) ?? 0)) continue;
      const late = Date.now() - slot.getTime() > 5 * 60_000;
      try {
        const r = await createBackup(late ? 'Zeitplan (nachgeholt)' : 'Zeitplan', { kind });
        retryAt.delete(kind);
        runner.update({ lastRun: { ok: true, at: new Date().toISOString(), id: r.id, kind }, lastError: null });
        runner.log.info(`${KINDS[kind]}: ${r.id}${late ? ' (nachgeholt)' : ''}`);
      } catch (err) {
        retryAt.set(kind, Date.now() + RETRY_MS);
        runner.update({ lastRun: { ok: false, at: new Date().toISOString(), kind, error: err.message }, lastError: `${KINDS[kind]}: ${err.message}` });
        runner.log.error(`Sicherung „${KINDS[kind]}“ fehlgeschlagen: ${err.message} – nächster Versuch in 15 Minuten.`);
      }
    }
  } finally {
    busy = false;
    runner.update({ nextRun: nextRun() });
  }
}
setTimeout(tick, 5_000); // gleich nach dem Start: Verpasstes nachholen
setInterval(tick, 30_000);

runner.onStop(async () => {
  for (let i = 0; i < 240 && busy; i++) await new Promise((r) => setTimeout(r, 500)); // laufende Sicherung abwarten
});
