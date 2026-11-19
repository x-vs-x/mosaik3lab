// Sicherung: EINE Datei pro Sicherung (<Backup-Ziel>/mosaik3lab-<Zeit>-<art>.m3lbackup) mit dem ganzen System:
// Datenbank mit ALLEN Einstellungen und Geheimnissen (Ports, Mail, Passwörter, Benutzer, Anfragen …) und die Ablage
// (Bilder, Videos, Druckdateien). Neue Sicherungen sind immer „komplett“ – eine Art, damit Wiederherstellen und Umziehen
// nie Bilder verlieren. Ältere Sicherungen der Art „daten“ (nur Datenbank) bleiben les- und wiederherstellbar.
// Aufbau der Datei: Kopf (Magic, JSON: Art, Zeit, App-Version, Schema, Verschlüsselung) + tar-Strom mit manifest.json
// (Prüfsummen) und den Dateien; mit Backup-Passwort ist der ganze tar-Strom AES-256-GCM-verschlüsselt (backupcrypto.mjs).
// Jede Sicherung wird direkt nach dem Schreiben geprüft; vor dem Wiederherstellen ebenfalls. Es bleiben die neuesten
// <backup.keep> Sicherungen, ältere werden gelöscht.
import fs from 'node:fs/promises';
import { existsSync, readFileSync, realpathSync, createReadStream, createWriteStream, writeFileSync, rmSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { getConfig, resolvePaths, isInside, requireValidConfig, reloadConfig, InputError } from './config.mjs';
import { logger } from './log.mjs';
import { newEncryption, openEncryption, encryptStream, decryptStream, readBackupPassword } from './backupcrypto.mjs';
import { packTar, unpackTar } from './tar.mjs';
import { dbSchemaVersion, releaseSchemaVersion } from './schema.mjs';
import * as settingsdb from './settingsdb.mjs';
import { run } from '../platform/common.mjs';
import { appArgs } from './appstart.mjs';
import { lebt, paketVersion, sha256Datei } from './hilfen.mjs';

const DB_FILE = settingsdb.DB_NAME; // SQLite-Datenbank der App (<Daten>/mosaik3lab.db)
export const EXT = '.m3lbackup';
const MAGIC = Buffer.from('M3LBAK1\n', 'latin1');
const FORMAT = 1; // Aufbau der Sicherungsdatei – ändert ihn eine neuere Version, erhöht sie die Zahl; ältere lehnen dann klar ab
export const KINDS = { komplett: 'Vollständig', daten: 'Nur Datenbank (ältere Art, ohne Bilder)' };
const NAME = /^mosaik3lab-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-\d+)?(-(daten|komplett))?$/;
// Sperrdatei, Sitzungen, Zwischendateien (auch *.neu der App beim Ersetzen eines Bildes), DB (eigener Schritt)
const SKIP = /(^|[\\/])(\.lock|[^\\/]*\.tmp|[^\\/]*\.neu|sessions\.json(\.bak)?|[^\\/]*\.db(-wal|-shm)?)$/;
// Aus der Ablage nicht gesichert: Vorschaubilder (vorschau/, jederzeit neu berechenbar – die Bildpflege der App erzeugt sie
// nach dem Wiederherstellen neu), die Markierung „Sicherung läuft“ (siehe sicherungMarkieren) und der Zwischenordner eines
// laufenden Imports (.import-tmp – Dateien verschwinden dort jederzeit; die App räumt ihn beim Start auf).
export const ABLAGE_AUSGENOMMEN = new Set(['vorschau', '.sicherung.lock', '.import-tmp']);
const ablageAusgenommen = (ablageDir, file) => ABLAGE_AUSGENOMMEN.has(path.relative(ablageDir, file).split(path.sep)[0]);

/**
 * Ordner rekursiv kopieren wie fs.cp, aber robust gegen Dateien, die während des Kopierens verschwinden (z. B. ein Bild
 * wird in der App gelöscht): die werden mit Log-Zeile übersprungen. Jeder andere Fehler – auch ENOENT, wenn die Quelle
 * noch da ist – bricht weiter ab. filter(quelle) wie bei fs.cp.
 */
export async function kopiereOrdner(src, dest, filter = () => true) {
  const weg = (err, p) => err?.code === 'ENOENT' && !existsSync(p);
  const ueberspringen = (p) => log().warn(`Sicherung: übersprungen, inzwischen gelöscht: ${p}`);
  let eintraege;
  try {
    eintraege = await fs.readdir(src, { withFileTypes: true });
  } catch (err) {
    if (weg(err, src)) return ueberspringen(src);
    throw err;
  }
  await fs.mkdir(dest, { recursive: true });
  for (const e of eintraege) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (!filter(s)) continue;
    if (e.isDirectory()) {
      await kopiereOrdner(s, d, filter);
      continue;
    }
    try {
      await fs.cp(s, d); // Datei oder Verweis, wie bisher fs.cp
    } catch (err) {
      if (weg(err, s)) ueberspringen(s);
      else throw err;
    }
  }
}

/**
 * Während der Sicherung <ablage>/.sicherung.lock anlegen ("<PID> <Systemstart>", wie die Sperrdatei der App): solange
 * pausiert die Bildpflege der App (server/src/kern/bilder/sperre.ts). Scheitert das, läuft die Sicherung trotzdem.
 * → Funktion zum Entfernen.
 */
function sicherungMarkieren(ablageDir) {
  const file = path.join(ablageDir, '.sicherung.lock');
  try {
    if (!ablageDir || !existsSync(ablageDir)) return () => {};
    writeFileSync(file, `${process.pid} ${Math.round(Date.now() / 1000 - os.uptime())}`);
  } catch {
    return () => {};
  }
  return () => {
    try {
      rmSync(file, { force: true });
    } catch {
      /* verwaist harmlos: die App erkennt eine Markierung eines beendeten Prozesses */
    }
  };
}

const log = () => logger(process.env.MOSAIK3LAB_RUNNER === 'backup' ? 'backup' : 'manager');

const stamp = (d = new Date()) => d.toLocaleString('sv-SE').replace(' ', '_').replace(/:/g, '-');
const sha256 = sha256Datei;

async function checksums(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of await fs.readdir(dir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile()) continue;
    const full = path.join(e.parentPath ?? e.path, e.name);
    out.push({ path: path.relative(dir, full).split(path.sep).join('/'), size: (await fs.stat(full)).size, sha256: await sha256(full) });
  }
  return out;
}

/** Was neben der Datenbank gesichert wird: <Daten>/data (ohne Sperrdatei), bei „komplett“ auch uploads/ (falls vorhanden) und die Ablage. */
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
  const r = await run(process.execPath, appArgs(programDir, 'db-backup', ['--ziel', targetFile, '--quelle', sourceFile]), { cwd: serverDir, timeout: 600_000 });
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
  const version = paketVersion(dir);
  let commit = null;
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
/** id → { path } der Sicherungsdatei; wirft InputError, wenn es die Sicherung nicht gibt. */
function locate(id) {
  const { backupDir } = resolvePaths();
  if (typeof id !== 'string' || !NAME.test(id)) throw new InputError('Sicherung nicht gefunden.');
  if (existsSync(path.join(backupDir, id + EXT))) return { path: path.join(backupDir, id + EXT) };
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
      }
    } catch {
      /* unvollständig */
    }
  }
  // Kopf ohne Zeitangabe (fremde oder beschädigte Datei): ans Ende statt die ganze Liste scheitern zu lassen – sonst
  // stünden Status, Aufräumen und der Backup-Dienst (dueKinds) wegen einer einzigen Datei still
  return out.sort((a, b) => String(b.created ?? '').localeCompare(String(a.created ?? ''))).slice(0, limit);
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
 * auspacken(name): nur diese Einträge auf die Platte schreiben – geprüft (Prüfsumme) wird trotzdem jeder.
 */
async function readArchive(file, { key, dest = null, auspacken = () => true }) {
  const head = await readHead(file);
  if (!head) throw new InputError('Das ist keine Sicherungsdatei von Mosaik³LAB.');
  const raw = key ? decryptStream(key, file, head.bodyStart) : createReadStream(file, { start: head.bodyStart, highWaterMark: 1 << 20 });
  let manifest = null;
  let expected = new Map();
  const seen = new Set();
  const problems = [];
  await unpackTar(raw, async (name) => {
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
    if (dest && auspacken(name)) {
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

export async function verifyBackup(id, opts = {}) {
  const loc = locate(id);
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
/** So alt muss ein Rest sein, bevor er gelöscht wird – eine laufende Sicherung (höchstens 2 h vor einem Update) bleibt unberührt. */
export const REST_MAX_ALTER_MS = 6 * 3600_000;
const REST = [/^mosaik3lab-[\w-]+\.unfertig$/, /^mosaik3lab-[\w-]+\.m3lbackup\.teil$/, /^\.auspacken-\d+-\d+$/];

/**
 * Reste abgebrochener Sicherungen aus dem Backup-Ziel entfernen: Zwischenordner „….unfertig“ (eine volle Kopie der Ablage!),
 * halbe Dateien „….m3lbackup.teil“ und Auspack-Ordner „.auspacken-…“. Sie bleiben liegen, wenn der Prozess mitten in der
 * Sicherung beendet wird (Stromausfall, Dienst gestoppt, Zeitlimit) – ohne Aufräumen füllt jeder solche Abbruch die Platte
 * um die Größe der Ablage, bis keine Sicherung mehr passt. Läuft vor jeder Sicherung (auch wenn die Platte schon voll ist).
 * Wirft nie. → Namen der entfernten Reste.
 */
export async function resteEntfernen(backupDir, { now = Date.now(), maxAlterMs = REST_MAX_ALTER_MS } = {}) {
  const weg = [];
  let namen = [];
  try {
    namen = await fs.readdir(backupDir);
  } catch {
    return weg;
  }
  for (const n of namen) {
    if (!REST.some((re) => re.test(n))) continue;
    const voll = path.join(backupDir, n);
    try {
      if (now - (await fs.stat(voll)).mtimeMs < maxAlterMs) continue;
      await fs.rm(voll, RM);
      weg.push(n);
      log().warn(`Rest einer abgebrochenen Sicherung entfernt: ${voll}`);
    } catch (err) {
      log().warn(`Rest einer abgebrochenen Sicherung konnte nicht entfernt werden (${voll}: ${err.message}).`);
    }
  }
  return weg;
}

export async function createBackup(reason = 'manuell', { kind = 'komplett', protect = [], aufraeumen = prune } = {}) {
  requireValidConfig();
  if (!KINDS[kind]) throw new InputError(`Unbekannte Art der Sicherung „${kind}“ (daten oder komplett).`);
  const { dataDir, backupDir } = folders();
  if (!existsSync(path.join(dataDir, 'data')) && !existsSync(path.join(dataDir, DB_FILE))) throw new InputError(`Im Datenordner ${dataDir} liegen keine Daten – nichts zu sichern.`);
  await fs.mkdir(backupDir, { recursive: true });
  await resteEntfernen(backupDir);
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
  let files = [];
  const markierungEntfernen = sicherungMarkieren(sources(kind).find((s) => s.name === 'ablage')?.dir ?? '');
  try {
    for (const src of sources(kind)) {
      const ablage = src.name === 'ablage';
      if (existsSync(src.dir)) await kopiereOrdner(src.dir, path.join(temp, src.name), (s) => !SKIP.test(s) && !(ablage && ablageAusgenommen(src.dir, s)));
    }
    const dbCopy = path.join(temp, 'db', DB_FILE);
    await backupDatabase(path.join(dataDir, DB_FILE), dbCopy);
    files = await checksums(temp);
    const schemaVersion = existsSync(dbCopy) ? await dbSchemaVersion(dbCopy) : null;
    const created = new Date().toISOString();
    const bytes = files.reduce((s, f) => s + f.size, 0);
    const app = appInfo();
    const manifest = { format: 'm3lbackup/1', kind, created, reason, host: os.hostname(), app, schemaVersion, source: dataDir, bytes, files };
    const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 1), 'utf8');
    const header = { format: FORMAT, kind, created, reason, host: manifest.host, app, schemaVersion, fileCount: files.length, bytes, encryption: enc?.header ?? null };
    const tar = packTar([{ name: 'manifest.json', size: manifestBuf.length, data: manifestBuf }, ...files.map((f) => ({ name: f.path, size: f.size, file: path.join(temp, ...f.path.split('/')) }))]);
    const body = enc ? encryptStream(enc.key, tar) : tar;
    await pipeline(Readable.from((async function* () { yield headBuffer(header); yield* body; })()), createWriteStream(part));
    await renameRetry(part, target);
    const check = await verifyBackup(id);
    if (!check.ok) throw new Error(`Sicherung ${id} ist fehlerhaft: ${check.problems[0]}`);
    log().info(`Sicherung erstellt und geprüft (${reason}, ${KINDS[kind]}): ${id}, ${files.length} Dateien${enc ? ', verschlüsselt' : ''}`);
  } catch (err) {
    await fs.rm(part, { force: true });
    await fs.rm(target, { force: true });
    log().error(`Sicherung fehlgeschlagen: ${err.message}`);
    throw err;
  } finally {
    markierungEntfernen();
    await fs.rm(temp, { recursive: true, force: true });
  }
  // Erst nach der fertigen, geprüften Sicherung alte löschen – scheitert das (z. B. eine alte Datei ist unter Windows kurz
  // gesperrt), bleibt die neue Sicherung trotzdem gültig; aufgeräumt wird beim nächsten Mal.
  try {
    await aufraeumen([id, ...protect]); // protect: z. B. die Sicherung, die gerade wiederhergestellt wird
  } catch (err) {
    log().warn(`Alte Sicherungen konnten nicht gelöscht werden (${err.message}) – neue Sicherung ${id} ist gültig, beim nächsten Mal wird erneut aufgeräumt.`);
  }
  return { id, kind, files: files.length, verified: true, encrypted: !!enc };
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
  const all = await listBackups();
  // Die jüngste Sicherung von direkt vor einem Update bleibt immer – damit man nach einem Update sicher zurück kann
  const beforeUpdate = all.find((b) => String(b.reason ?? '').startsWith('vor Update'))?.id;
  for (const b of all.slice(getConfig().backup.keep)) {
    if (protect.includes(b.id) || b.id === beforeUpdate) continue;
    try {
      await fs.rm(locate(b.id).path, RM);
      log().info(`Alte Sicherung gelöscht: ${b.id}`);
    } catch (err) {
      log().warn(`Alte Sicherung ${b.id} konnte nicht gelöscht werden (${err.message}) – nächster Versuch bei der nächsten Sicherung.`);
    }
  }
}

// ---------- Wiederherstellen ----------
/**
 * Eine Sicherung aus einer neueren Version (höheres Datenbank-Schema) nicht in eine ältere Version zurückspielen – die App
 * würde die Datenbank nicht verstehen. Ältere Sicherungen sind erlaubt: die App bringt sie beim Start auf den neuen Stand.
 */
export function refuseNewerBackup(meta, programDir = resolvePaths().programDir) {
  const mine = releaseSchemaVersion(programDir);
  if (mine === null || !(Number(meta?.schemaVersion) > mine)) return;
  const from = meta.app?.version ? `Version ${meta.app.version}` : 'einer neueren Version';
  const installed = installedAppVersion(programDir);
  throw new InputError(`Diese Sicherung stammt von ${from} und ist neuer als die installierte Version${installed ? ` ${installed}` : ''}. Es wurde nichts verändert.`, 'Zuerst Mosaik³LAB aktualisieren, dann die Sicherung wiederherstellen.');
}
const installedAppVersion = paketVersion;

const PARTS = ['db', 'ablage', 'data', 'uploads'];
// Löschen mit Wiederholung: Windows gibt die Datenbank der eben gestoppten App bzw. eine frisch gelesene Datei manchmal erst
// nach einem Moment frei (EBUSY/EPERM – Prozessende, Virenscanner, Indexer). maxRetries wirkt nur mit recursive.
const RM = { recursive: true, force: true, maxRetries: 10, retryDelay: 200 };

/**
 * Teile einer ausgepackten Sicherung (Ordner mit db/, ablage/, data/ …) an einen Ort zurückspielen – unabhängig von der
 * Konfiguration dieses Prozesses (wird auch bei „Aus Backup einrichten“ in einen neuen Datenordner benutzt).
 * only: Namen der Teile; dirs: { dataDir, ablageDir }. Danach Vergleich mit den Prüfsummen. → Liste der Abweichungen.
 * kopieren: Ersatz für fs.copyFile (Tests stellen damit einen vollen Datenträger nach).
 */
export async function applyBackup({ folder, meta, dirs, only = PARTS, kopieren = fs.copyFile }) {
  const targets = [
    { name: 'data', dir: path.join(dirs.dataDir, 'data') },
    { name: 'uploads', dir: path.join(dirs.dataDir, 'uploads') },
    { name: 'ablage', dir: dirs.ablageDir },
    { name: 'db', dir: dirs.dataDir, file: DB_FILE },
  ].filter((t) => only.includes(t.name));
  const present = new Set(meta.files.map((f) => f.path.split('/')[0]));
  for (const t of targets) {
    if (!present.has(t.name) && !(t.name === 'data' && existsSync(path.join(folder, 'data')))) continue; // Teil nicht in der Sicherung → vorhandenen Bestand nicht anfassen
    if (t.file) {
      // Datenbank: erst vollständig daneben kopieren, dann tauschen (WAL-Reste entfernen). Scheitert das Kopieren
      // (Datenträger voll, Datei gesperrt), bleibt die bisherige Datenbank stehen – früher war sie dann schon gelöscht,
      // und die Web-App hätte beim nächsten Start mit einer leeren Datenbank begonnen.
      if (!existsSync(path.join(folder, t.name, t.file))) continue;
      const ziel = path.join(t.dir, t.file);
      const neu = `${ziel}.neu`;
      await fs.mkdir(t.dir, { recursive: true });
      try {
        await kopieren(path.join(folder, t.name, t.file), neu);
        for (const ext of ['-wal', '-shm']) await fs.rm(ziel + ext, RM);
        await renameRetry(neu, ziel); // ersetzt die bisherige Datei in einem Schritt
      } catch (err) {
        await fs.rm(neu, { force: true }).catch(() => {});
        throw err;
      }
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
 * Sicherung zum Lesen bereitstellen: in einen Zwischenordner ausgepackt (und geprüft). → { folder, meta, header, cleanup() }. Ein falsches Passwort wird abgelehnt, bevor etwas ausgepackt wird.
 * nur: Teile, die ausgepackt werden (z. B. ['db']) – der Rest wird nur geprüft. So braucht der Rückfall nach einem Update
 * nur Platz für die Datenbank und schreibt nicht die ganze Ablage ein zweites Mal auf die Platte.
 */
export async function openBackup(location, { password, stagingBase, nur = null }) {
  const head = (await fs.stat(location)).isFile() ? await readHead(location) : null;
  if (!head) throw new InputError('Das ist keine Sicherungsdatei von Mosaik³LAB.');
  if (Number(head.header.format) > FORMAT) throw new InputError(`Diese Sicherung stammt aus einer neueren Version von Mosaik³LAB${head.header.app?.version ? ` (${head.header.app.version})` : ''} und kann hier nicht gelesen werden. Es wurde nichts verändert.`, 'Zuerst Mosaik³LAB auf die neueste Version aktualisieren, dann wiederherstellen.');
  const key = needKey(head.header, password);
  const staging = path.join(stagingBase, `.auspacken-${process.pid}-${Date.now()}`);
  try {
    const { manifest, problems } = await readArchive(location, { key, dest: staging, auspacken: nur ? (name) => nur.includes(name.split('/')[0]) : undefined });
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
  return lebt(pid) ? pid : null;
}

/**
 * Wiederherstellen (Aufrufer stellt sicher: Web-App gestoppt). Vorher Prüfung (Prüfsummen, bei verschlüsselten
 * Sicherungen das Passwort – ein falsches wird abgelehnt, bevor etwas angefasst wird) + Sicherung des jetzigen Stands.
 * Vollständige Sicherungen ersetzen auch die Ablage; ältere „Nur Datenbank“-Sicherungen lassen sie unberührt
 * (fehlende Dateien: siehe fillMissingFiles). Danach liest der Manager seine Einstellungen aus der wiederhergestellten Datenbank neu ein;
 * den Abgleich des Systems (Firewall, Dienste, Ports …) macht reconcile.mjs.
 * Scheitert das Zurückspielen mittendrin, wird der eben gesicherte Stand automatisch wieder eingespielt.
 * opts: { password } – sonst wird die Datei backup.key der Installation versucht; anwenden: Ersatz für applyBackup (Tests).
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
    refuseNewerBackup(opened.meta);
    const safety = existsSync(path.join(dataDir, 'data')) || existsSync(path.join(dataDir, DB_FILE)) ? await createBackup(`vor Wiederherstellung ${id}`, { protect: [id] }) : null;
    const dirs = { dataDir, ablageDir: resolvePaths().ablageDir };
    try {
      const problems = await (opts.anwenden ?? applyBackup)({ folder: opened.folder, meta: opened.meta, dirs });
      if (problems.length) throw new Error(`Wiederherstellung unvollständig (${problems[0]})`);
    } catch (err) {
      // Halb ersetzt (Datenträger voll, Datei gesperrt …): den Stand von eben automatisch zurückspielen
      throw new Error(`${err.message} – ${await zurueckAufStand(safety?.id, dirs)}`);
    }
    markFilesState(opened.meta.kind === 'komplett' ? null : { at: new Date().toISOString(), backup: id });
    reloadConfig(); // Einstellungen stammen jetzt aus der wiederhergestellten Datenbank
    log().info(`Wiederhergestellt und geprüft: ${id} (${KINDS[opened.meta.kind]}${opened.header?.encryption ? ', verschlüsselt' : ''}) (vorheriger Stand: ${safety?.id ?? '–'})`);
    return { restored: id, kind: opened.meta.kind, safetyBackup: safety?.id ?? null, encrypted: !!opened.header?.encryption };
  } finally {
    await opened.cleanup();
  }
}

/** Nach einer gescheiterten Wiederherstellung: Sicherheitskopie von direkt davor zurückspielen. → Satz für die Meldung */
async function zurueckAufStand(safetyId, dirs) {
  if (!safetyId) return 'es gab keinen vorherigen Stand zum Zurückspielen.';
  try {
    const back = await openBackup(locate(safetyId).path, { stagingBase: folders().backupDir });
    try {
      const problems = await applyBackup({ folder: back.folder, meta: back.meta, dirs });
      if (problems.length) throw new Error(problems[0]);
    } finally {
      await back.cleanup();
    }
    log().warn(`Wiederherstellung gescheitert – vorheriger Stand ${safetyId} automatisch zurückgespielt.`);
    return `der vorherige Stand wurde automatisch zurückgespielt (Sicherung ${safetyId}), es ist nichts verloren.`;
  } catch (e) {
    log().error(`Vorherigen Stand ${safetyId} zurückspielen gescheitert: ${e.message}`);
    return `der vorherige Stand konnte nicht automatisch zurückgespielt werden (${e.message}) – er liegt in der Sicherung ${safetyId}, bitte diese wiederherstellen.`;
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
/** Letzter planmäßiger Zeitpunkt (≤ jetzt): täglich um HH:MM. */
export function lastSlot(time, now = new Date()) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d > now) d.setDate(d.getDate() - 1);
  return d;
}

/** Nächste automatische Sicherung (täglich zur eingestellten Uhrzeit) oder null, wenn sie ausgeschaltet ist. */
export function nextBackupTime(from = new Date()) {
  const c = getConfig().backup;
  if (!c.enabled) return null;
  const d = lastSlot(c.time, from);
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
  const slot = lastSlot(c.time, now);
  const last = await lastBackup('komplett');
  return !last || Date.parse(last.created) < slot.getTime() ? [{ kind: 'komplett', slot }] : [];
}
