// Laufzeit-Update (Node.js, Dienst-Wrapper) als eigener Prozess, damit sich der Manager nicht selbst abschießt.
// Fortschritt steht in <logDir>/runtime.state.json, Details in update.log.
//   node runners/runtime.mjs --config <datei> --what <node|wrapper>
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
if (process.argv.includes('--config')) process.env.MANAGER_CONFIG = arg('--config');
process.env.MOSAIK3LAB_QUIET = '1';

const fs = await import('node:fs');
const path = await import('node:path');
const { resolvePaths } = await import('../lib/config.mjs');
const { logger } = await import('../lib/log.mjs');
const { updateRuntime } = await import('../lib/runtime.mjs');

const log = logger('update');
const what = arg('--what');
const file = path.join(resolvePaths().logDir, 'runtime.state.json');
const state = { pid: process.pid, what, phase: 'running', startedAt: new Date().toISOString(), steps: [], result: null };
const save = () => fs.writeFileSync(file, JSON.stringify(state));
save();
try {
  state.result = await updateRuntime(what, {}, (id, status, detail) => {
    const s = state.steps.find((x) => x.id === id) ?? state.steps[state.steps.push({ id }) - 1];
    Object.assign(s, { status, detail });
    log[status === 'fehler' ? 'error' : 'info'](`Laufzeit ${what} – ${id}: ${status}${detail ? ` – ${detail}` : ''}`);
    save();
  });
  state.phase = state.result.ok ? 'done' : 'failed';
} catch (err) {
  state.phase = 'failed';
  state.result = { ok: false, message: err.message, hint: err.hint };
  log.error(`Laufzeit-Update abgebrochen: ${err.message}`);
}
save();
process.exit(state.phase === 'done' ? 0 : 1);
