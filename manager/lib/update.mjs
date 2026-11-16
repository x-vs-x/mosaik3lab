// Updates aus Git, sicher mit automatischem Rollback.
// Ablauf: Backup → neue Version aus Git nach releases/<version>-<commit> (entpacken, npm ci, Build) →
// Dienste stoppen → Verweis „current“ umschalten → starten → /api/health. Antwortet die neue Version nicht,
// wird automatisch auf die vorige zurückgeschaltet. Die vorige Version bleibt erhalten (2 Versionen).
// Datenbank: Hat die neue Version beim Start das Schema verändert und scheitert dann, wird die Sicherung von vorher
// zurückgespielt – die alte Version läuft nie mit einem neueren Schema. Eine Version mit älterem Schema als die
// Datenbank wird nicht installiert (Downgrade verweigert).
import fs from 'node:fs';
import path from 'node:path';
import { platform } from '../platform/index.mjs';
import { runShell } from '../platform/common.mjs';
import { getConfig, resolvePaths, INSTALL, PROGRAM_DIR, requireValidConfig, InputError } from './config.mjs';
import { removeTree, linkWorkspaces } from './setup.mjs';
import { git } from './git.mjs';
import { dbSchemaVersion, releaseSchemaVersion } from './schema.mjs';

const ID = /^[\w.-]{1,80}$/;

export function currentRelease(root) {
  try {
    const dir = fs.realpathSync(path.join(root, 'current'));
    let meta = {};
    try {
      meta = JSON.parse(fs.readFileSync(path.join(dir, '.release.json'), 'utf8'));
    } catch {
      /* ältere Version */
    }
    return { id: path.basename(dir), dir, ...meta };
  } catch {
    return null;
  }
}

/** Verweis „current“ auf eine Version setzen (Dienste sind dabei gestoppt). */
export function switchCurrent(root, id) {
  if (!ID.test(id) || !fs.existsSync(path.join(root, 'releases', id))) throw new InputError(`Version ${id} nicht vorhanden.`);
  const link = path.join(root, 'current');
  try {
    if (!fs.lstatSync(link).isSymbolicLink()) throw new Error(`${link} ist kein Verweis – bitte prüfen.`);
    platform.unlinkDir(link);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  platform.linkDir(path.join(root, 'releases', id), link);
  const hist = path.join(root, 'releases', 'history.json');
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(hist, 'utf8'));
  } catch {
    /* neu */
  }
  fs.writeFileSync(hist, JSON.stringify([id, ...list.filter((x) => x !== id)].slice(0, 10)));
}

export function previousRelease(root) {
  try {
    const cur = currentRelease(root)?.id;
    return JSON.parse(fs.readFileSync(path.join(root, 'releases', 'history.json'), 'utf8')).find((id) => id !== cur && fs.existsSync(path.join(root, 'releases', id))) ?? null;
  } catch {
    return null;
  }
}

/** Nur aktuelle + vorige Version behalten. */
export function prune(root) {
  const keep = new Set([currentRelease(root)?.id, previousRelease(root), 'history.json']);
  for (const n of fs.readdirSync(path.join(root, 'releases'))) if (!keep.has(n)) removeTree(path.join(root, 'releases', n));
}

/** Neue Version suchen. ctx: { root, repo, branch, cache } */
export async function checkUpdate(ctx = defaultContext()) {
  if (!ctx.root) throw new InputError('Updates gibt es nach der Einrichtung. In der Arbeitskopie: git pull.');
  if (!ctx.repo) throw new InputError('Keine Git-Quelle eingestellt.');
  if (!fs.existsSync(path.join(ctx.cache, 'HEAD'))) {
    const r = await git(['clone', '--bare', '--branch', ctx.branch, '--', ctx.repo, ctx.cache]);
    if (r.code !== 0) throw new InputError(`Git-Quelle nicht erreichbar: ${r.stderr || r.error || 'keine Antwort'}`, 'Pfad/Adresse der Quelle und Netzwerk prüfen.');
  } else {
    const r = await git(['-C', ctx.cache, 'fetch', '--prune', 'origin', `+refs/heads/${ctx.branch}:refs/heads/${ctx.branch}`]);
    if (r.code !== 0) throw new InputError(`git fetch fehlgeschlagen (offline?): ${r.stderr || r.error || 'keine Antwort'}`);
  }
  const commit = (await git(['-C', ctx.cache, 'rev-parse', ctx.branch])).stdout;
  let version = '0.0.0';
  try {
    version = JSON.parse((await git(['-C', ctx.cache, 'show', `${commit}:package.json`])).stdout).version;
  } catch {
    /* keine package.json */
  }
  const installed = currentRelease(ctx.root);
  const known = installed?.commit && (await git(['-C', ctx.cache, 'cat-file', '-e', `${installed.commit}^{commit}`])).code === 0;
  const logOut = (await git(['-C', ctx.cache, 'log', '--format=%h %s', '-n', '20', known ? `${installed.commit}..${commit}` : commit])).stdout;
  return { installed, available: { id: `${version}-${commit.slice(0, 7)}`, version, commit, changes: logOut ? logOut.split('\n') : [] }, updateAvailable: installed?.commit !== commit };
}

/**
 * Update installieren. ctx.services = { stopAll(): string[], startAll(keys), healthy(ms): bool } – austauschbar für Tests.
 * report(step, status, detail) meldet Fortschritt.
 */
export async function installUpdate(ctx = defaultContext(), report = () => {}) {
  if (!ctx.check) requireValidConfig(); // Tests übergeben eigene Umgebung
  const step = async (id, fn) => {
    report(id, 'läuft');
    try {
      const r = await fn();
      report(id, 'fertig', typeof r === 'string' ? r : undefined);
      return r;
    } catch (err) {
      report(id, 'fehler', err.message);
      throw err;
    }
  };
  const info = await step('check', () => (ctx.check ?? checkUpdate)(ctx));
  if (!info.updateAvailable) return { ok: true, message: 'Bereits aktuell.' };
  const previous = info.installed?.id;
  const dest = path.join(ctx.root, 'releases', info.available.id);

  const schemaBefore = (await ctx.dbSchema?.()) ?? null; // null = noch keine Datenbank
  const backupId = await step('backup', async () => (await ctx.backup())?.id ?? 'übersprungen');
  await step('prepare', async () => {
    const tmp = `${dest}.unfertig`;
    removeTree(tmp);
    await ctx.fetch(info, tmp);
    fs.writeFileSync(path.join(tmp, '.release.json'), JSON.stringify({ id: info.available.id, version: info.available.version, commit: info.available.commit, at: new Date().toISOString() }));
    await ctx.prepare(tmp);
    const newSchema = ctx.releaseSchema?.(tmp) ?? null;
    if (schemaBefore !== null && newSchema !== null && newSchema < schemaBefore) {
      removeTree(tmp);
      throw new InputError(`Downgrade verweigert: Version ${info.available.version} kennt nur Datenbank-Schema ${newSchema}, die Datenbank hat bereits Schema ${schemaBefore}.`, 'Eine neuere Version installieren oder die Datenbank aus einer älteren Sicherung wiederherstellen.');
    }
    removeTree(dest);
    await renameWithRetry(tmp, dest);
    linkWorkspaces(dest); // Verweise von npm ci zeigen noch auf „.unfertig“
    return info.available.id;
  });
  const running = await step('stop', () => ctx.services.stopAll());
  await step('switch', async () => switchCurrent(ctx.root, info.available.id));
  try {
    await step('start', () => ctx.services.startAll(['webapp', ...running.filter((k) => k !== 'webapp')]));
    await step('health', async () => {
      if (!(await ctx.services.healthy(ctx.healthMs ?? 90_000))) throw new Error('Die neue Version antwortet nicht auf /api/health.');
    });
  } catch (err) {
    if (!previous) throw err;
    await step('rollback', async () => {
      await ctx.services.stopAll();
      let restored = '';
      const schemaNow = (await ctx.dbSchema?.()) ?? null;
      if (backupId && schemaBefore !== null && schemaNow !== schemaBefore) {
        await ctx.restoreDb(backupId); // Schema hat sich geändert → Stand von vor dem Update zurückspielen
        const after = (await ctx.dbSchema?.()) ?? null;
        if (after !== schemaBefore) throw new Error(`Datenbank konnte nicht zurückgespielt werden (Schema ${after}, erwartet ${schemaBefore}) – Sicherung ${backupId} von Hand wiederherstellen.`);
        restored = ` · Datenbank aus Sicherung ${backupId} zurückgespielt (Schema ${schemaNow} → ${schemaBefore})`;
      }
      switchCurrent(ctx.root, previous);
      await ctx.services.startAll(['webapp', ...running.filter((k) => k !== 'webapp')]);
      return (await ctx.services.healthy(ctx.healthMs ?? 90_000)) ? `zurück auf ${previous}${restored}` : `zurück auf ${previous}${restored}, antwortet aber ebenfalls nicht`;
    });
    return { ok: false, rolledBack: true, message: `Update fehlgeschlagen (${err.message}) – automatisch auf ${previous} zurückgesetzt.` };
  }
  if (!running.includes('webapp')) await ctx.services.stopAll(); // war vorher aus → wieder aus
  prune(ctx.root);
  return { ok: true, id: info.available.id, previous, message: `Update auf ${info.available.id} installiert.` };
}

/**
 * Umbenennen mit Wiederholung: Unter Windows sperren Virenscanner oder Indexer einen frisch gebauten Ordner (tausende
 * neue Dateien in node_modules) oft einige Sekunden – rename schlägt dann mit EPERM/EBUSY fehl. Bis ~60 s erneut versuchen.
 */
export async function renameWithRetry(from, to, { tries = 30, waitMs = 2000 } = {}) {
  for (let i = 0; ; i++) {
    try {
      return fs.renameSync(from, to);
    } catch (err) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code) || i >= tries) throw err;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

/** Echte Umgebung: Git-Cache im Datenordner, echte Dienste, echtes Backup. */
export function defaultContext() {
  const c = getConfig();
  return {
    root: INSTALL?.programRoot ?? null,
    repo: c.update.repo,
    branch: c.update.branch || 'main',
    cache: INSTALL ? path.join(INSTALL.dataRoot, 'cache', 'git') : null,
    async backup() {
      return (await import('./backup.mjs')).createBackup('vor Update');
    },
    async dbSchema() {
      return dbSchemaVersion(path.join(resolvePaths().dataDir, 'mosaik3lab.db'));
    },
    releaseSchema: releaseSchemaVersion,
    async restoreDb(id) {
      return (await import('./backup.mjs')).restoreBackup(id, id);
    },
    async fetch(info, dest) {
      const archive = `${dest}.tar.gz`;
      const r = await git(['-C', this.cache, 'archive', '--format=tar.gz', '-o', archive, info.available.commit]);
      if (r.code !== 0) throw new Error(`git archive fehlgeschlagen: ${r.stderr}`);
      try {
        await platform.extract(archive, dest);
      } finally {
        fs.rmSync(archive, { force: true });
      }
    },
    async prepare(dir) {
      for (const cmd of ['npm ci --no-audit --no-fund', 'npm run build -w client']) {
        const r = await runShell(cmd, { cwd: dir });
        if (r.code !== 0) throw new Error(`${cmd} fehlgeschlagen (Code ${r.code}).`);
      }
      const old = currentRelease(this.root);
      const appCfg = old && path.join(old.dir, 'mosaik3lab.config.json'); // Ablagepfade aus der App mitnehmen
      if (appCfg && fs.existsSync(appCfg)) fs.copyFileSync(appCfg, path.join(dir, 'mosaik3lab.config.json'));
    },
    services: {
      async stopAll() {
        const s = await import('./services.mjs');
        const running = [];
        for (const key of s.KEYS) if ((await s.serviceStatus(key)).running) running.push(key) && (await s.stopService(key));
        return running;
      },
      async startAll(keys) {
        const s = await import('./services.mjs');
        for (const key of keys) await s.startService(key);
      },
      async healthy(ms) {
        const s = await import('./services.mjs');
        for (const until = Date.now() + ms; Date.now() < until; await new Promise((r) => setTimeout(r, 1500))) if (await s.checkHealth()) return true;
        return false;
      },
    },
  };
}

export const installedVersion = () => (INSTALL ? currentRelease(INSTALL.programRoot) : { id: 'Arbeitskopie', version: JSON.parse(fs.readFileSync(path.join(PROGRAM_DIR, 'package.json'), 'utf8')).version });
