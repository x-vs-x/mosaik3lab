// Dienst „Mosaik³LAB Update“ (Windows: Konto System, Linux: root) – ein Durchlauf, dann Ende.
// Startet beim Hochfahren (Notfall-Prüfung nach unterbrochenem Update) und auf Anforderung des Server-Managers.
// Logik und Sicherheiten: lib/aktualisieren.mjs.   node runners/aktualisieren.mjs --config <datei>
// Status und Protokoll stehen im Programmordner (nur Admin/root schreibt) – nie in Ordnern, die der Manager ändern kann.
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
if (process.argv.includes('--config')) process.env.MANAGER_CONFIG = arg('--config');
process.env.MOSAIK3LAB_QUIET = '1';

const fs = await import('node:fs');
const path = await import('node:path');
const { INSTALL, getConfig, resolvePaths } = await import('../lib/config.mjs');
const { logger } = await import('../lib/log.mjs');
const { durchlauf, runPackageSetup, updatesDir, statusDatei } = await import('../lib/aktualisieren.mjs');
const { currentRelease } = await import('../lib/releases.mjs');
const { releases, officialSum, sha256File } = await import('../lib/paketquelle.mjs');
const { rollBack, restoreDbFrom } = await import('../lib/paketupdate.mjs');
const { dbSchemaVersion } = await import('../lib/schema.mjs');
const { fetchHealth } = await import('../lib/services.mjs');
const { listBackups } = await import('../lib/backup.mjs');
const { platform } = await import('../platform/index.mjs');
const { run } = await import('../platform/common.mjs');
const { einrichtungSperren } = await import('../lib/sperre.mjs');

const log = logger('helfer'); // <Programmordner>/update-helfer.log
if (!INSTALL) {
  log.warn('Update-Helfer: keine Installation gefunden – nichts zu tun.');
  process.exit(0);
}
const dir = updatesDir(INSTALL.dataRoot);
const statusFile = statusDatei(INSTALL.programRoot);
const DIENSTE = ['webapp', 'backup', 'portal', 'manager'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const installed = () => {
  const r = currentRelease(INSTALL.programRoot);
  return r ? { id: r.id, version: r.version ?? r.id.split('-')[0] } : null;
};
const dbFile = () => resolvePaths().dbFile;
const alleStarten = async () => {
  for (const k of DIENSTE) await platform.services.control(k, 'start').catch(() => false);
};

/** Antwortet die App (über ihren eigenen Port)? Wartet bis waitMs. */
async function healthy(waitMs) {
  const until = Date.now() + waitMs;
  for (;;) {
    let c;
    try {
      c = getConfig();
    } catch {
      c = null;
    }
    if (c && (await fetchHealth(c.app.port, c.portal.basePath))) return true;
    if (Date.now() > until) return false;
    await sleep(3000);
  }
}

/** Zurück auf die bisherige Version (status.previous): Dienste, „current“, Datenbank aus der Sicherung „vor Update auf …“. */
async function recover(status) {
  const now = installed();
  if (!status.previous || now?.id === status.previous) {
    await alleStarten();
    return (await healthy(120_000)) ? `Die bisherige Version ${now?.version ?? ''} läuft wieder, Ihre Daten sind unverändert.` : 'Mosaik³LAB antwortet noch nicht – bitte den Server neu starten oder die IT benachrichtigen (Protokoll „Update-Helfer“).';
  }
  const backups = await listBackups().catch(() => []);
  const backupId = backups.find((b) => String(b.reason ?? '').startsWith(`vor Update auf ${status.version}`))?.id ?? null;
  let r;
  try {
    r = await rollBack(
      { programRoot: INSTALL.programRoot, previous: status.previous, failed: now?.id, backupId, schemaBefore: status.schemaBefore ?? null, dbFile: dbFile() },
      {
        stop: async () => {
          for (const k of DIENSTE) await platform.services.control(k, 'stop').catch(() => false);
        },
        start: alleStarten,
        healthy: () => healthy(180_000),
        restoreDb: (id) => restoreDbFrom({ backupDir: resolvePaths().backupDir, id, keyFile: resolvePaths().keyFile, dataDir: resolvePaths().dataDir, ablageDir: resolvePaths().ablageDir }),
      },
    );
  } catch (err) {
    await alleStarten(); // nie alles gestoppt zurücklassen
    throw err;
  }
  log.warn(`Update-Helfer: zurückgesetzt auf ${status.previous} (${r.data})`);
  return r.healthy ? `Die bisherige Version ${status.von ?? status.previous} läuft wieder. ${r.data}.` : `Auf die bisherige Version ${status.von ?? status.previous} zurückgeschaltet, sie antwortet aber noch nicht – bitte den Server neu starten (Protokoll „Update-Helfer“).`;
}

async function extract(file, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const r = await run(tar, ['-xf', file, '-C', dest], { timeout: 10 * 60_000 });
  if (r.code !== 0) {
    log.error(`Entpacken fehlgeschlagen: ${r.stderr || r.code}`);
    throw Object.assign(new Error('Das Update-Paket ist beschädigt oder unvollständig – es wurde nichts verändert.'), { friendly: true });
  }
  // Windows-Paket: Dateien direkt im Ordner; Linux-Paket: ein Unterordner
  if (fs.existsSync(path.join(dest, 'manager', 'cli.mjs'))) return dest;
  const sub = fs.readdirSync(dest).map((n) => path.join(dest, n)).find((d) => fs.existsSync(path.join(d, 'manager', 'cli.mjs')));
  if (!sub) throw Object.assign(new Error('Das Update-Paket ist unvollständig – es wurde nichts verändert.'), { friendly: true });
  return sub;
}

async function official(version, name) {
  const rel = (await releases()).find((r) => r.tag_name === `v${version}` && !r.draft && !r.prerelease);
  const sums = rel?.assets?.find((a) => a.name === 'SHA256SUMS.txt');
  if (!sums) throw new Error(`Version ${version} ist nicht offiziell veröffentlicht`);
  return officialSum(sums.browser_download_url, name);
}

/**
 * Linux: Was der Helfer als root angelegt hat (Sicherung, Rückfall), gehört danach root – dem Dienstbenutzer zurückgeben.
 * Streng begrenzt (der Manager kann Pfade in der Datenbank ändern): nur echte Ordner, die schon dem Dienstbenutzer gehören
 * (nie /etc o. Ä.), darin nur Dateien von root, ohne Verknüpfungen zu folgen und ohne Dateien mit mehreren harten Links.
 */
async function besitzZurueckgeben() {
  const uid = Number((await run('id', ['-u', 'mosaik3lab'], { timeout: 10_000 })).stdout.trim());
  if (!uid) return;
  const p = resolvePaths();
  for (const d of new Set([INSTALL.dataRoot, p.backupDir, p.logDir, p.ablageDir])) {
    let st;
    try {
      st = fs.lstatSync(d);
    } catch {
      continue;
    }
    if (!st.isDirectory() || st.uid !== uid) continue;
    await run('find', [d, '-xdev', '-user', 'root', '(', '-type', 'd', '-o', '-links', '1', ')', '-exec', 'chown', '-h', 'mosaik3lab:mosaik3lab', '{}', '+'], { timeout: 5 * 60_000 });
  }
}

const statusSchreiben = (s) => {
  try {
    fs.writeFileSync(statusFile, JSON.stringify({ ...s, at: new Date().toISOString() }, null, 1));
  } catch {
    /* nur Anzeige */
  }
};

// Nie zwei Einrichtungen gleichzeitig (Installieren.cmd/installieren.sh und Update-Helfer teilen sich die Sperre)
let freigeben = () => {};
try {
  freigeben = einrichtungSperren(INSTALL.programRoot, 'Update-Helfer');
} catch (err) {
  // Läuft gerade eine Installation per Paket: Auftrag verwerfen und klar melden (die Anzeige hängt sonst auf „wartet“)
  log.warn(`Update-Helfer: ${err.message}`);
  if (fs.existsSync(path.join(dir, 'auftrag.json'))) {
    fs.rmSync(path.join(dir, 'auftrag.json'), { force: true });
    statusSchreiben({ phase: 'fehler', version: null, meldung: `Das Update wurde nicht gestartet: ${err.message}`, hint: 'Nach dem Ende der laufenden Installation erneut „Jetzt aktualisieren“ wählen.' });
  }
  process.exit(0);
}
try {
  const s = await durchlauf({
    dir,
    sicherDir: path.join(INSTALL.programRoot, '.update'), // nur Helfer (Programmordner: Program Files bzw. /opt, root)
    statusFile,
    installed,
    official,
    sha256: sha256File,
    extract,
    runSetup: (pkgDir, onLine, ms) => {
      freigeben(); // das Setup des Pakets nimmt die Sperre selbst
      return runPackageSetup(pkgDir, onLine, ms, (pid) => platform.killTree(pid));
    },
    healthy,
    recover,
    schemaNow: () => dbSchemaVersion(dbFile()).catch(() => null),
    log: (t) => log.info(t),
  });
  if (s?.phase && s.phase !== 'läuft') log.info(`Update-Helfer: ${s.phase} – ${s.meldung}`);
} catch (err) {
  log.error(`Update-Helfer: ${err.stack ?? err.message}`);
} finally {
  freigeben();
}
if (process.platform === 'linux' && process.getuid?.() === 0) {
  try {
    await besitzZurueckgeben();
  } catch (err) {
    log.warn(`Besitzer der Datenordner nicht zurückgesetzt: ${err.message}`);
  }
}
process.exit(0);
