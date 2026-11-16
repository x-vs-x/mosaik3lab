// Gemeinsamer Rahmen der Dienst-Prozesse (runners/webapp.mjs, runners/backup.mjs):
// Zustandsdatei schreiben und sauber beenden bei Signal (Dienststeuerung), IPC „shutdown“ oder Stopp-Datei.
//   node runners/<dienst>.mjs --config <manager.config.json>
const i = process.argv.indexOf('--config');
if (i > 0) process.env.MANAGER_CONFIG = process.argv[i + 1];
process.env.MOSAIK3LAB_QUIET = '1';

const fs = await import('node:fs');
const path = await import('node:path');
const { stateFile, stopFile, readState, isAlive } = await import('../lib/services.mjs');
const { logger } = await import('../lib/log.mjs');

export function createRunner(key, logName) {
  process.env.MOSAIK3LAB_RUNNER = key;
  const log = logger(logName);
  const prev = readState(key);
  if (prev?.pid !== process.pid && isAlive(prev?.pid) && prev.phase !== 'stopped') {
    log.error(`${key} läuft bereits (PID ${prev.pid}) – zweiter Start abgebrochen.`);
    process.exit(4);
  }
  let state = { key, pid: process.pid, phase: 'starting', startedAt: new Date().toISOString(), lastError: null };
  const update = (patch) => {
    state = { ...state, ...patch };
    try {
      fs.mkdirSync(path.dirname(stateFile(key)), { recursive: true });
      fs.writeFileSync(`${stateFile(key)}.tmp`, JSON.stringify(state));
      fs.renameSync(`${stateFile(key)}.tmp`, stateFile(key));
    } catch {
      /* Log-Ordner nicht beschreibbar */
    }
  };
  fs.rmSync(stopFile(key), { force: true });
  update({});

  let onStop = async () => {};
  let stopping = false;
  const stop = async (why) => {
    if (stopping) return;
    stopping = true;
    log.info(`${key}: wird beendet (${why}).`);
    update({ phase: 'stopping' });
    await onStop().catch((err) => log.error(err.message));
    update({ phase: 'stopped' });
    process.exit(0);
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(sig, () => void stop(sig));
  setInterval(() => fs.existsSync(stopFile(key)) && (fs.rmSync(stopFile(key), { force: true }), void stop('Stopp-Anforderung')), 1000);
  process.on('uncaughtException', (err) => {
    log.error(`${key}: ${err.stack ?? err.message}`);
    update({ phase: 'crashed', lastError: err.message });
    process.exit(1);
  });
  return { log, update, state: () => state, onStop: (fn) => (onStop = fn), stopping: () => stopping };
}
