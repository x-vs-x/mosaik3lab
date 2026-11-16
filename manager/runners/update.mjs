// Update als eigener Prozess, damit sich der Manager beim Umschalten nicht selbst abschießt.
// Fortschritt steht in <logDir>/update.state.json, Details in update.log.
//   node runners/update.mjs --config <datei>
const i = process.argv.indexOf('--config');
if (i > 0) process.env.MANAGER_CONFIG = process.argv[i + 1];
process.env.MOSAIK3LAB_QUIET = '1';

const fs = await import('node:fs');
const path = await import('node:path');
const { resolvePaths } = await import('../lib/config.mjs');
const { logger } = await import('../lib/log.mjs');
const { installUpdate } = await import('../lib/update.mjs');

const log = logger('update');
const file = path.join(resolvePaths().logDir, 'update.state.json');
const state = { pid: process.pid, phase: 'running', startedAt: new Date().toISOString(), steps: [], result: null };
const save = () => fs.writeFileSync(file, JSON.stringify(state));
save();
try {
  state.result = await installUpdate(undefined, (id, status, detail) => {
    const s = state.steps.find((x) => x.id === id) ?? state.steps[state.steps.push({ id }) - 1];
    Object.assign(s, { status, detail });
    log[status === 'fehler' ? 'error' : 'info'](`${id}: ${status}${detail ? ` – ${detail}` : ''}`);
    save();
  });
  state.phase = state.result.ok ? 'done' : 'failed';
  // Neuer Programmstand → Manager neu starten (als Dienst: Neustart durch die Dienststeuerung).
  if (state.result.ok && state.result.id) fs.writeFileSync(path.join(resolvePaths().logDir, 'manager.restart'), '1');
} catch (err) {
  state.phase = 'failed';
  state.result = { ok: false, message: err.message, hint: err.hint };
  log.error(`Update abgebrochen: ${err.message}`);
}
save();
process.exit(state.phase === 'done' ? 0 : 1);
