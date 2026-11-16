// Git zuverlässig finden. Als Dienst (Konto „Lokaler Dienst“) ist git oft nicht im PATH, obwohl es installiert ist.
// Reihenfolge: gemerkter Pfad aus der Konfiguration → PATH (als vollständiger Pfad) → Standardorte der Plattform.
// Der gefundene Pfad wird in der Konfiguration (update.gitPath) gemerkt.
import fs from 'node:fs';
import { platform } from '../platform/index.mjs';
import { run, which } from '../platform/common.mjs';
import { getConfig, updateConfig, configErrors, InputError } from './config.mjs';

const VERSION = /git version (\d+(?:\.\d+)+)/;

async function probe(file) {
  const r = await run(file, ['--version'], { timeout: 8000 });
  const m = r.code === 0 ? VERSION.exec(r.stdout) : null;
  return m ? { path: file, version: m[1] } : null;
}

/** → { path, version } oder null. Bei Fund wird der Pfad in der Konfiguration gemerkt (falls sie gültig ist). */
export async function findGit({ remember = true } = {}) {
  const configured = getConfig().update.gitPath;
  const candidates = [configured, await which('git'), ...platform.gitCandidates()].filter(Boolean);
  for (const c of new Set(candidates)) {
    if (!c.includes('/') && !c.includes('\\')) continue; // nur vollständige Pfade
    if (!fs.existsSync(c)) continue;
    const found = await probe(c);
    if (!found) continue;
    if (remember && found.path !== configured && !configErrors().length) {
      try {
        updateConfig({ update: { gitPath: found.path } });
      } catch {
        /* Konfiguration nicht beschreibbar – Pfad wird beim nächsten Mal wieder gesucht */
      }
    }
    return found;
  }
  return null;
}

/** Fehler mit Klartext und Installationshinweis, wenn Git fehlt. */
export function gitMissing() {
  return new InputError('Git wurde nicht gefunden (nicht im PATH und nicht an den üblichen Orten).', `Git installieren (${platform.gitInstall}) – oder im Manager unter „Laufzeit“ → Git → Installieren. Danach „Nach Updates suchen“ erneut.`);
}

let cached = null;
/** Pfad zu git (zwischengespeichert); wirft gitMissing(). */
export async function requireGit() {
  if (cached && fs.existsSync(cached)) return cached;
  cached = (await findGit())?.path ?? null;
  if (!cached) throw gitMissing();
  return cached;
}
export const forgetGit = () => {
  cached = null;
};

/** git ausführen; ENOENT → verständliche Meldung. */
export async function git(args, timeout = 300_000) {
  const bin = await requireGit();
  const r = await run(bin, args, { timeout });
  if (r.error === 'ENOENT') {
    forgetGit();
    throw gitMissing();
  }
  return r;
}
