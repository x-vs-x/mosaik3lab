// Sicherung: EINE Datei pro Sicherung (<Backup-Ziel>/mosaik3lab-<Zeit>-<art>.m3lbackup) mit dem ganzen System:
// Datenbank mit ALLEN Einstellungen und Geheimnissen (Ports, Mail, Passwörter, Benutzer, Anfragen …) und die Ablage
// (Bilder, Videos, Druckdateien). Neue Sicherungen sind immer „komplett“ – eine Art, damit Wiederherstellen und Umziehen
// nie Bilder verlieren. Ältere Sicherungen der Art „daten“ (nur Datenbank) bleiben les- und wiederherstellbar.
// Aufbau der Datei: Kopf (Magic, JSON: Art, Zeit, App-Version, Schema, Verschlüsselung) + tar-Strom mit manifest.json
// (Prüfsummen) und den Dateien; mit Backup-Passwort ist der ganze tar-Strom AES-256-GCM-verschlüsselt (backupcrypto.mjs).
// Jede Sicherung wird direkt nach dem Schreiben geprüft; vor dem Wiederherstellen ebenfalls. Ältere Sicherungen als
// Ordner (backup.json) bleiben les- und wiederherstellbar. Es bleiben die neuesten <backup.keep> Sicherungen, ältere werden gelöscht.
import fs from 'node:fs/promises';
import { existsSync, readFileSync, realpathSync, createReadStream, createWriteStream } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { getConfig, resolvePaths, isInside, requireValidConfig, reloadConfig, InputError } from './config.mjs';
import { logger } from './log.mjs';
import { newEncryption, openEncryption, encryptStream, decryptStream, readBackupPassword } from './backupcrypto.mjs';
import { packTar, unpackTar } from './tar.mjs';
import { dbSchemaVersion } from './schema.mjs';
import * as settingsdb from './settingsdb.mjs';
import { run } from '../platform/common.mjs';

const DB_FILE = 'mosaik3lab.db'; // SQLite-Datenbank der App (<Daten>/mosaik3lab.db)
export const EXT = '.m3lbackup';
const MAGIC = Buffer.from('M3LBAK1\n', 'latin1');
export const KINDS = { komplett: 'Vollständig', daten: 'Nur Datenbank (ältere Art, ohne Bilder)' };
const NAME = /^mosaik3lab-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-\d+)?(-(daten|komplett))?$/;
const SKIP = /(^|[\\/])(\.lock|[^\\/]*\.tmp|sessions\.json(\.bak)?|[^\\/]*\.db(-wal|-shm)?)$/; // Sperrdatei, Sitzungen, Zwischendateien, DB (eigener Schritt)
const log = () => logger(process.env.MOSAIK3LAB_RUNNER === 'backup' ? 'backup' : 'manager');

const stamp = (d = new Date()) => d.toLocaleString('sv-SE').replace(' ', '_').replace(/:/g, '-');
const sha256 = (file) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256');
  createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
});

async function checksums(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of await fs.readdir(dir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || e.name === 'backup.json') continue;
    const full = path.join(e.parentPath ?? e.path, e.name);
    out.push({ path: path.relative(dir, full).split(path.sep).join('/'), size: (await fs.stat(full)).size, sha256: await sha256(full) });
  }
  return out;
}

/** Was gesichert wird: frühere JSON-Dateien (data/), bei „komplett“ auch uploads/ (frühere Ablage) und die Ablage. */
function sources(kind) {
  const { dataDir, ablageDir } = resolvePaths();
  const list = [{ name: 'data', dir: path.join(dataDir, 'data') }];
  if (kind === 'komplett') list.push({ name: 'uploads', dir: path.join(dataDir, 'uploads') }, { name: 'ablage', dir: ablageDir || path.join(dataDir, 'ablage') });
  return list;
}

/**
 * Datenbank konsistent sichern: über das Skript der App (VACUUM INTO, auch im laufenden Betrieb), nicht durch
 * Kopieren der Datei. Ohne Shell (Argumentliste). Gibt es (noch) keine Datenbank, wird dieser Schritt übersprungen.
 */
export async function backupDatabase(sourceFile, targetFile, programDir = resolvePaths().programDir) {
  if (!existsSync(sourceFile)) return null;
  const serverDir = path.join(programDir, 'server');
  let hasScript = false;
  try {
    hasScript = !!JSON.parse(readFileSync(path.join(serverDir, 'package.json'), 'utf8')).scripts?.['db:backup'];
  } catch {
    /* kein Server-Paket */
  }
  if (!hasScript) throw new Error('Datenbank gefunden, aber das App-Skript „db:backup“ fehlt – Sicherung abgebrochen, damit keine inkonsistente Kopie entsteht.');
  await fs.mkdir(path.dirname(targetFile), { recursive: true });
  const r = await run(process.execPath, ['--import', 'tsx', path.join('scripts', 'db-backup.ts'), '--ziel', targetFile, '--quelle', sourceFile], { cwd: serverDir, timeout: 600_000 });
  const line = (r.stdout || '').trim().split(/\r?\n/).pop() ?? ''; // das Skript gibt genau eine Zeile aus: „OK …“ bzw. „FEHLER: …“
  if (r.code !== 0 || !line.startsWith('OK')) throw new Error(`Datenbank-Sicherung fehlgeschlagen: ${line || r.stderr || 'keine Ausgabe'}`);
  return targetFile;
}

function folders() {
  const { dataDir, backupDir } = resolvePaths();
  if (isInside(backupDir, dataDir) || isInside(dataDir, backupDir)) throw new InputError('Datenordner und Backup-Ziel dürfen nicht ineinander liegen.');
  return { dataDir, backupDir };
}

/** App-Version und Git-Commit der laufenden Programmversion (für das Manifest). */
function appInfo() {
  const dir = resolvePaths().programDir;
  let version = null;
  let commit = null;
  try {
    version = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).version ?? null;
  } catch {
    /* ohne package.json */
  }
  try {
    commit = JSON.parse(readFileSync(path.join(realpathSync(dir), '.release.json'), 'utf8')).commit ?? null;
  } catch {
    /* Arbeitskopie: kein .release.json */
  }
  return { version, commit };
}

// ---------- Kopf der Datei ----------
function headBuffer(header) {
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(json.length);
  return Buffer.concat([MAGIC, len, json]);
}

/** Kopf lesen: { header, bodyStart } oder null, wenn es keine Sicherungsdatei ist. */
async function readHead(file) {
  const fd = await fs.open(file, 'r');
  try {
    const pre = Buffer.alloc(MAGIC.length + 4);
    const { bytesRead } = await fd.read(pre, 0, pre.length, 0);
    if (bytesRead < pre.length || !pre.subarray(0, MAGIC.length).equals(MAGIC)) return null;
    const len = pre.readUInt32BE(MAGIC.length);
    if (len > 1 << 20) return null;
    const json = Buffer.alloc(len);
    await fd.read(json, 0, len, pre.length);
    return { header: JSON.parse(json.toString('utf8')), bodyStart: pre.length + len };
  } finally {
    await fd.close();
  }
}

// ---------- Auffinden ----------
/** id → { type: 'datei' | 'ordner', path }; wirft InputError, wenn es die Sicherung nicht gibt. */
function locate(id) {
  const { backupDir } = resolvePaths();
  if (typeof id !== 'string' || !NAME.test(id)) throw new InputError('Sicherung nicht gefunden.');
  if (existsSync(path.join(backupDir, id + EXT))) return { type: 'datei', path: path.join(backupDir, id + EXT) };
  if (existsSync(path.join(backupDir, id, 'backup.json'))) return { type: 'ordner', path: path.join(backupDir, id) };
  throw new InputError('Sicherung nicht gefunden.');
}

export async function listBackups(limit = 1000) {
  const { backupDir } = resolvePaths();
  const names = existsSync(backupDir) ? await fs.readdir(backupDir) : [];
  const out = [];
  for (const n of names) {
    try {
      if (n.endsWith(EXT) && NAME.test(n.slice(0, -EXT.length))) {
        const head = await readHead(path.join(backupDir, n));
        if (!head) continue;
        const h = head.header;
        out.push({ id: n.slice(0, -EXT.length), created: h.created, reason: h.reason, kind: h.kind, files: h.fileCount, bytes: h.bytes, encrypted: !!h.encryption, app: h.app, schemaVersion: h.schemaVersion });
      } else if (NAME.test(n) && existsSync(path.join(backupDir, n, 'backup.json'))) {
        const meta = JSON.parse(await fs.readFile(path.join(backupDir, n, 'backup.json'), 'utf8'));
        out.push({ id: n, created: meta.created, reason: meta.reason, kind: meta.files.some((f) => f.path.startsWith('ablage/')) ? 'komplett' : 'daten', files: meta.files.length, bytes: meta.bytes, encrypted: false, legacy: true });
      }
    } catch {
      /* unvollständig */
    }
  }
  return out.sort((a, b) => b.created.localeCompare(a.created)).slice(0, limit);
}

/** Letzte Sicherung einer Art (oder null). */
export async function lastBackup(kind) {
  return (await listBackups()).find((b) => b.kind === kind) ?? null;
}

// ---------- Lesen / Prüfen / Auspacken ----------
const needKey = (header, password) => (header.encryption ? openEncryption(password ?? readBackupPassword(), header.encryption) : null);

/**
 * Archiv durchlesen und gegen das Manifest prüfen; mit dest zusätzlich auspacken (dest/<pfad>).
 * Rückgabe { manifest, problems[] }. Bei verschlüsselten Dateien prüft der GCM-Tag zusätzlich die Unversehrtheit.
 */
async function readArchive(file, { key, dest = null }) {
  const head = await readHead(file);
  if (!head) throw new InputError('Das ist keine Sicherungsdatei von Mosaik³LAB.');
  const raw = key ? decryptStream(key, file, head.bodyStart) : createReadStream(file, { start: head.bodyStart, highWaterMark: 1 << 20 });
  let manifest = null;
  let expected = new Map();
  const seen = new Set();
  const problems = [];
  await unpackTar(raw, async (name, size) => {
    if (!manifest) {
      if (name !== 'manifest.json') throw new Error('Sicherungsdatei ohne Manifest.');
      const parts = [];
      return {
        write: (c) => void parts.push(Buffer.from(c)),
        end: () => {
          manifest = JSON.parse(Buffer.concat(parts).toString('utf8'));
          expected = new Map(manifest.files.map((f) => [f.path, f]));
        },
      };
    }
    const want = expected.get(name);
    if (!want || seen.has(name)) {
      problems.push(`unerwartet: ${name}`);
      return null;
    }
    seen.add(name);
    const h = crypto.createHash('sha256');
    let n = 0;
    let out = null;
    if (dest) {
      const target = path.join(dest, ...name.split('/'));
      await fs.mkdir(path.dirname(target), { recursive: true });
      out = createWriteStream(target);
    }
    const flush = (chunk) => (out.write(chunk) ? Promise.resolve() : new Promise((r) => out.once('drain', r)));
    return {
      write: async (c) => {
        h.update(c);
        n += c.length;
        if (out) await flush(c);
      },
      end: async () => {
        if (out) await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
        if (n !== want.size || h.digest('hex') !== want.sha256) problems.push(`Prüfsumme falsch: ${name}`);
      },
    };
  });
  if (!manifest) throw new Error('Sicherungsdatei ohne Manifest.');
  for (const p of expected.keys()) if (!seen.has(p)) problems.push(`fehlt: ${p}`);
  return { manifest, problems };
}

/** Prüft Dateien gegen die Prüfsummen einer Ordner-Sicherung (ältere Form); liefert Liste der Probleme. */
async function compare(dir, files) {
  const actual = new Map((await checksums(dir)).map((f) => [f.path, f.sha256]));
  return files.filter((f) => actual.get(f.path) !== f.sha256).map((f) => (actual.has(f.path) ? `Prüfsumme falsch: ${f.path}` : `fehlt: ${f.path}`));
}

export async function verifyBackup(id, opts = {}) {
  const loc = locate(id);
  if (loc.type === 'ordner') {
    const meta = JSON.parse(await fs.readFile(path.join(loc.path, 'backup.json'), 'utf8'));
    const problems = await compare(loc.path, meta.files);
    return { id, ok: !problems.length, checked: meta.files.length, problems: problems.slice(0, 10) };
  }
  const head = await readHead(loc.path);
  if (!head) return { id, ok: false, checked: 0, problems: ['keine Sicherungsdatei'] };
  const key = needKey(head.header, opts.password);
  try {
    const { manifest, problems } = await readArchive(loc.path, { key });
    return { id, ok: !problems.length, checked: manifest.files.length, problems: problems.slice(0, 10) };
  } catch (err) {
    return { id, ok: false, checked: 0, problems: [err.message] };
  }
}

// ---------- Sichern ----------
export async function createBackup(reason = 'manuell', { kind = 'komplett', protect = [] } = {}) {
  requireValidConfig();
  if (!KINDS[kind]) throw new InputError(`Unbekannte Art der Sicherung „${kind}“ (daten oder komplett).`);
  const { dataDir, backupDir } = folders();
  if (!existsSync(path.join(dataDir, 'data')) && !existsSync(path.join(dataDir, DB_FILE))) throw new InputError(`Im Datenordner ${dataDir} liegen keine Daten – nichts zu sichern.`);
  await fs.mkdir(backupDir, { recursive: true });
  let enc = null;
  if (getConfig().backup.encrypt) {
    const pw = readBackupPassword();
    if (!pw) throw new InputError('Die Verschlüsselung der Sicherungen ist eingeschaltet, aber es gibt kein Backup-Passwort.', 'Backup-Passwort festlegen (cli backup password set|generate) oder die Verschlüsselung ausschalten.');
    enc = newEncryption(pw);
  }
  let id = `mosaik3lab-${stamp()}-${kind}`;
  for (let i = 2; existsSync(path.join(backupDir, id + EXT)); i++) id = `mosaik3lab-${stamp()}-${i}-${kind}`;
  const target = path.join(backupDir, id + EXT);
  const temp = path.join(backupDir, `${id}.unfertig`);
  const part = `${target}.teil`;
  try {
    for (const src of sources(kind)) {
      if (existsSync(src.dir)) await fs.cp(src.dir, path.join(temp, src.name), { recursive: true, filter: (s) => !SKIP.test(s) });
    }
    const dbCopy = path.join(temp, 'db', DB_FILE);
    await backupDatabase(path.join(dataDir, DB_FILE), dbCopy);
    const files = await checksums(temp);
    const schemaVersion = existsSync(dbCopy) ? await dbSchemaVersion(dbCopy) : null;
    const created = new Date().toISOString();
    const bytes = files.reduce((s, f) => s + f.size, 0);
    const app = appInfo();
    const manifest = { format: 'm3lbackup/1', kind, created, reason, host: os.hostname(), app, schemaVersion, source: dataDir, bytes, files };
    const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 1), 'utf8');
    const header = { format: 1, kind, created, reason, host: manifest.host, app, schemaVersion, fileCount: files.length, bytes, encryption: enc?.header ?? null };
    const tar = packTar([{ name: 'manifest.json', size: manifestBuf.length, data: manifestBuf }, ...files.map((f) => ({ name: f.path, size: f.size, file: path.join(temp, ...f.path.split('/')) }))]);
    const body = enc ? encryptStream(enc.key, tar) : tar;
    await pipeline(Readable.from((async function* () { yield headBuffer(header); yield* body; })()), createWriteStream(part));
    await renameRetry(part, target);
    const check = await verifyBackup(id);
    if (!check.ok) throw new Error(`Sicherung ${id} ist fehlerhaft: ${check.problems[0]}`);
    log().info(`Sicherung erstellt und geprüft (${reason}, ${KINDS[kind]}): ${id}, ${files.length} Dateien${enc ? ', verschlüsselt' : ''}`);
    await prune([id, ...protect]); // protect: z. B. die Sicherung, die gerade wiederhergestellt wird
    return { id, kind, files: files.length, verified: true, encrypted: !!enc };
  } catch (err) {
    await fs.rm(part, { force: true });
    await fs.rm(target, { force: true });
    log().error(`Sicherung fehlgeschlagen: ${err.message}`);
    throw err;
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

/** Umbenennen mit Wiederholung: Windows sperrt frisch geschriebene Dateien manchmal kurz (Virenscanner, Indexer). */
async function renameRetry(from, to) {
  for (let i = 0; ; i++) {
    try {
      return await fs.rename(from, to);
    } catch (err) {
      if (i >= 10 || !['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) throw err;
      await new Promise((r) => setTimeout(r, 200 * (i + 1)));
    }
  }
}

async function prune(protect) {
  for (const b of (await listBackups()).slice(getConfig().backup.keep)) {
    if (protect.includes(b.id)) continue;
    const loc = locate(b.id);
    await fs.rm(loc.path, { recursive: true, force: true });
    log().info(`Alte Sicherung gelöscht: ${b.id}`);
  }
}

// ---------- Wiederherstellen ----------
const PARTS = ['db', 'ablage', 'data', 'uploads', 'config'];
// Löschen mit Wiederholung: Windows gibt die Datenbank der eben gestoppten App bzw. eine frisch gelesene Datei manchmal erst
// nach einem Moment frei (EBUSY/EPERM – Prozessende, Virenscanner, Indexer). maxRetries wirkt nur mit recursive.
const RM = { recursive: true, force: true, maxRetries: 10, retryDelay: 200 };

/**
 * Teile einer ausgepackten Sicherung (Ordner mit db/, ablage/, data/ …) an einen Ort zurückspielen – unabhängig von der
 * Konfiguration dieses Prozesses (wird auch bei „Aus Backup einrichten“ in einen neuen Datenordner benutzt).
 * only: Namen der Teile; dirs: { dataDir, ablageDir }. Danach Vergleich mit den Prüfsummen. → Liste der Abweichungen.
 */
export async function applyBackup({ folder, meta, dirs, only = PARTS }) {
  const targets = [
    { name: 'data', dir: path.join(dirs.dataDir, 'data') },
    { name: 'uploads', dir: path.join(dirs.dataDir, 'uploads') },
    { name: 'config', dir: path.join(dirs.dataDir, 'config') }, // nur ältere Sicherungen (mail.json) – wird beim Laden in die Datenbank übernommen
    { name: 'ablage', dir: dirs.ablageDir },
    { name: 'db', dir: dirs.dataDir, file: DB_FILE },
  ].filter((t) => only.includes(t.name));
  const present = new Set(meta.files.map((f) => f.path.split('/')[0]));
  for (const t of targets) {
    if (!present.has(t.name) && !(t.name === 'data' && existsSync(path.join(folder, 'data')))) continue; // Teil nicht in der Sicherung → vorhandenen Bestand nicht anfassen
    if (t.file) {
      // Datenbank: Datei ersetzen (WAL-Reste entfernen)
      if (!existsSync(path.join(folder, t.name, t.file))) continue;
      for (const ext of ['', '-wal', '-shm']) await fs.rm(path.join(t.dir, t.file + ext), RM);
      await fs.mkdir(t.dir, { recursive: true });
      await fs.copyFile(path.join(folder, t.name, t.file), path.join(t.dir, t.file));
      continue;
    }
    await fs.rm(t.dir, RM);
    if (existsSync(path.join(folder, t.name))) await fs.cp(path.join(folder, t.name), t.dir, { recursive: true });
  }
  const problems = [];
  for (const f of meta.files) {
    const [name, ...rest] = f.path.split('/');
    const t = targets.find((x) => x.name === name);
    if (!t) continue;
    const file = t.file ? path.join(t.dir, t.file) : path.join(t.dir, ...rest);
    if (!existsSync(file) || (await sha256(file)) !== f.sha256) problems.push(`abweichend: ${f.path}`);
  }
  return problems;
}

/**
 * Sicherung zum Lesen bereitstellen: Dateien → in einen Zwischenordner ausgepackt (und geprüft), alte Ordner-Sicherungen
 * direkt. → { folder, meta, header, cleanup() }. Ein falsches Passwort wird abgelehnt, bevor etwas ausgepackt wird.
 */
export async function openBackup(location, { password, stagingBase }) {
  const isFile = (await fs.stat(location)).isFile();
  if (!isFile) {
    const meta = JSON.parse(await fs.readFile(path.join(location, 'backup.json'), 'utf8'));
    const problems = await compare(location, meta.files);
    if (problems.length) throw new InputError(`Die Sicherung ist beschädigt (${problems[0]}) – abgebrochen.`, 'Eine andere Sicherung wählen.');
    return { folder: location, meta: { ...meta, kind: meta.files.some((f) => f.path.startsWith('ablage/')) ? 'komplett' : 'daten' }, header: null, cleanup: async () => {} };
  }
  const head = await readHead(location);
  if (!head) throw new InputError('Das ist keine Sicherungsdatei von Mosaik³LAB.');
  const key = needKey(head.header, password);
  const staging = path.join(stagingBase, `.auspacken-${process.pid}-${Date.now()}`);
  try {
    const { manifest, problems } = await readArchive(location, { key, dest: staging });
    if (problems.length) throw new InputError(`Die Sicherung ist beschädigt (${problems[0]}) – abgebrochen.`, 'Eine andere Sicherung wählen.');
    return { folder: staging, meta: manifest, header: head.header, cleanup: () => fs.rm(staging, { recursive: true, force: true }) };
  } catch (err) {
    await fs.rm(staging, { recursive: true, force: true });
    if (err instanceof InputError) throw err;
    throw new InputError(`Die Sicherung ist beschädigt oder unlesbar (${err.message}) – abgebrochen.`, 'Eine andere Sicherung wählen.');
  }
}

/** Sperrdatei der App: "<PID> <Systemstart>" (siehe server/src/kern/lock.ts). PID des echten Halters oder null. */
export function lockHolder(content) {
  const [pidText, bootText] = content.trim().split(/\s+/);
  const pid = Number(pidText);
  const boot = Number(bootText);
  if (!pid || (boot && Math.abs(boot - Math.round(Date.now() / 1000 - os.uptime())) > 120)) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch (err) {
    return err.code === 'EPERM' ? pid : null;
  }
}

/**
 * Wiederherstellen (Aufrufer stellt sicher: Web-App gestoppt). Vorher Prüfung (Prüfsummen, bei verschlüsselten
 * Sicherungen das Passwort – ein falsches wird abgelehnt, bevor etwas angefasst wird) + Sicherung des jetzigen Stands.
 * Vollständige Sicherungen ersetzen auch die Ablage; ältere „Nur Datenbank“-Sicherungen lassen sie unberührt
 * (fehlende Dateien: siehe fillMissingFiles). Danach liest der Manager seine Einstellungen aus der wiederhergestellten Datenbank neu ein;
 * den Abgleich des Systems (Firewall, Dienste, Ports …) macht reconcile.mjs.
 * opts: { password } – sonst wird die Datei backup.key der Installation versucht.
 */
export async function restoreBackup(id, confirm, opts = {}) {
  requireValidConfig();
  if (confirm !== id) throw new InputError('Wiederherstellen bitte ausdrücklich bestätigen.');
  const loc = locate(id);
  const { dataDir, backupDir } = folders();
  try {
    const pid = lockHolder(readFileSync(path.join(dataDir, 'data', '.lock'), 'utf8'));
    if (!pid) throw new Error('keine aktive Sperre');
    throw new InputError(`Der Datenordner wird noch von der Web-App benutzt (PID ${pid}).`, 'Web-App zuerst stoppen.');
  } catch (err) {
    if (err instanceof InputError) throw err;
  }
  const opened = await openBackup(loc.path, { password: opts.password, stagingBase: backupDir });
  try {
    const safety = existsSync(path.join(dataDir, 'data')) || existsSync(path.join(dataDir, DB_FILE)) ? await createBackup(`vor Wiederherstellung ${id}`, { protect: [id] }) : null;
    const problems = await applyBackup({ folder: opened.folder, meta: opened.meta, dirs: { dataDir, ablageDir: resolvePaths().ablageDir } });
    if (problems.length) throw new Error(`Wiederherstellung unvollständig (${problems[0]}) – vorheriger Stand liegt in ${safety?.id}.`);
    markFilesState(opened.meta.kind === 'komplett' ? null : { at: new Date().toISOString(), backup: id });
    reloadConfig(); // Einstellungen stammen jetzt aus der wiederhergestellten Datenbank
    log().info(`Wiederhergestellt und geprüft: ${id} (${KINDS[opened.meta.kind]}${opened.header?.encryption ? ', verschlüsselt' : ''}) (vorheriger Stand: ${safety?.id ?? '–'})`);
    return { restored: id, kind: opened.meta.kind, safetyBackup: safety?.id ?? null, encrypted: !!opened.header?.encryption };
  } finally {
    await opened.cleanup();
  }
}

/** Merkt sich (in der Datenbank), dass nach einem Backup „ohne Dateien“ Dateien fehlen dürfen – der doctor meldet sie dann als Hinweis. */
function markFilesState(value) {
  try {
    const file = resolvePaths().dbFile;
    if (existsSync(file)) settingsdb.writeBereich(file, 'betrieb', { 'restore.ohneDateien': value ?? undefined });
  } catch {
    /* nur ein Hinweis – darf die Wiederherstellung nicht stören */
  }
}
export function filesNote() {
  try {
    return settingsdb.readBereich(resolvePaths().dbFile, 'betrieb')['restore.ohneDateien'] ?? null;
  } catch {
    return null;
  }
}

/**
 * Fehlende Dateien aus einer vollständigen Sicherung nachholen (nur über die Kommandozeile, nach Wiederherstellen einer älteren „Nur Datenbank“-Sicherung): nur was in der Ablage fehlt, jede Datei per SHA-256 geprüft;
 * Vorhandenes und die Datenbank bleiben unberührt. → { copied, present, total }.
 */
export async function fillMissingFiles(id, opts = {}) {
  requireValidConfig();
  const loc = locate(id);
  const { backupDir } = folders();
  const opened = await openBackup(loc.path, { password: opts.password, stagingBase: backupDir });
  try {
    if (opened.meta.kind !== 'komplett') throw new InputError('Diese Sicherung enthält keine Bilder und Druckdateien (ältere Art „Nur Datenbank“).', 'Eine vollständige Sicherung wählen.');
    const { ablageDir } = resolvePaths();
    let copied = 0;
    let present = 0;
    const list = opened.meta.files.filter((f) => f.path.startsWith('ablage/'));
    for (const f of list) {
      const target = path.join(ablageDir, ...f.path.split('/').slice(1));
      if (existsSync(target)) {
        present++;
        continue;
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(path.join(opened.folder, ...f.path.split('/')), target);
      if ((await sha256(target)) !== f.sha256) {
        await fs.rm(target, { force: true });
        throw new Error(`Datei nach dem Kopieren abweichend: ${f.path}`);
      }
      copied++;
    }
    markFilesState(null);
    log().info(`Fehlende Dateien aus ${id} nachgeholt: ${copied} neu, ${present} schon vorhanden.`);
    return { copied, present, total: list.length };
  } finally {
    await opened.cleanup();
  }
}

// ---------- Zeitplan ----------
/** Letzter planmäßiger Zeitpunkt (≤ jetzt): täglich um HH:MM, bei weekday ≥ 0 nur an diesem Wochentag (0 = Sonntag). */
export function lastSlot(time, weekday = -1, now = new Date()) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d > now) d.setDate(d.getDate() - 1);
  for (let i = 0; weekday >= 0 && d.getDay() !== weekday && i < 7; i++) d.setDate(d.getDate() - 1);
  return d;
}

/** Nächste automatische Sicherung (täglich zur eingestellten Uhrzeit) oder null, wenn sie ausgeschaltet ist. */
export function nextBackupTime(from = new Date()) {
  const c = getConfig().backup;
  if (!c.enabled) return null;
  const d = lastSlot(c.time, -1, from);
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Ist die tägliche Sicherung fällig (auch eine verpasste, z. B. Rechner war nachts aus)? → [{ kind, slot }] oder [].
 * Zählt jede vollständige Sicherung seit dem letzten planmäßigen Zeitpunkt (auch „Jetzt sichern“).
 */
export async function dueKinds(now = new Date()) {
  const c = getConfig().backup;
  if (!c.enabled) return [];
  const slot = lastSlot(c.time, -1, now);
  const last = await lastBackup('komplett');
  return !last || Date.parse(last.created) < slot.getTime() ? [{ kind: 'komplett', slot }] : [];
}
