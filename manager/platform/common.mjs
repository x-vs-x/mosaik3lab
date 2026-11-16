// Gemeinsame Helfer und Namen der Plattformschicht.
import { execFile, spawn } from 'node:child_process';

/** Programm ausführen → { code, stdout, stderr } (wirft nie, keine Shell). */
export function run(file, args = [], { timeout = 20_000, cwd, env } = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, cwd, env, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, error: err && typeof err.code !== 'number' ? err.code || err.message : undefined, stdout: String(stdout ?? '').trim(), stderr: String(stderr ?? '').trim() });
    });
  });
}

/** Feste Befehle über die Shell (npm ist unter Windows eine .cmd-Datei). onOutput bekommt die Ausgabe live. */
export function runShell(command, { cwd, timeout = 900_000, onOutput } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, cwd, windowsHide: true });
    let out = '';
    const timer = setTimeout(() => child.kill(), timeout);
    const take = (d) => {
      out += d;
      onOutput?.(String(d));
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', (err) => resolve({ code: 1, stdout: err.message }));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout: out.trim() });
    });
  });
}

/** Vollständiger Pfad eines Programms im PATH (erste Fundstelle) oder null. */
export async function which(name) {
  const r = process.platform === 'win32' ? await run('where.exe', [name], { timeout: 5000 }) : await run('sh', ['-c', `command -v ${name}`], { timeout: 5000 });
  return r.code === 0 ? r.stdout.split(/\r?\n/)[0].trim() || null : null;
}

export const shQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
export const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

export const SERVICE_IDS = { webapp: 'mosaik3lab-webapp', backup: 'mosaik3lab-backup', portal: 'mosaik3lab-portal', manager: 'mosaik3lab-manager', updater: 'mosaik3lab-updater' };
export const SERVICE_TITLES = { webapp: 'Mosaik³LAB Web-App', backup: 'Mosaik³LAB Backup', portal: 'Mosaik³LAB Portal', manager: 'Mosaik³LAB Server-Manager', updater: 'Mosaik³LAB Update' };
/** Einheitlicher Name der Firewall-Regel – so lässt sie sich finden und entfernen. */
export const FIREWALL_RULE = (port) => `Mosaik3LAB – Web-App (${Number(port)}/TCP)`;
