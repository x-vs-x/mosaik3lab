// Update per Installer-Paket absichern – so sicher wie das Git-Update (update.mjs) und mit denselben Bausteinen:
// Downgrade verweigern (Versionsnummer nach SemVer und Datenbank-Schema, schema.mjs), Sicherung mit der bisherigen Version direkt vor dem Umschalten, bei Fehlschlag
// automatisch zurück auf die vorige Version (switchCurrent). Hat die neue Version das Datenbank-Schema schon verändert,
// wird die Datenbank aus genau dieser Sicherung zurückgespielt – die alte Version läuft nie mit einem neueren Schema.
// Aufrufer: install() in setup.mjs (erneutes Einrichten = Update).
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { InputError } from './config.mjs';
import { dbSchemaVersion, releaseSchemaVersion } from './schema.mjs';
import { openBackup, applyBackup, EXT } from './backup.mjs';
import { SICHERUNG_MAX_MS } from './zeitlimits.mjs'; // Sicherung vor dem Update: großzügig (Pi, große Ablage), kleiner als die äußeren Limits

/** Versionsnummer nach SemVer: „1.2.3“, „1.2.3-dev.abc1234“, „1.2.3-abc1234“ → [1, 2, 3] (Zusätze zählen nicht); null = unlesbar. */
export function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v ?? ''));
  return m ? m.slice(1).map(Number) : null;
}

/** a < b → -1, gleich → 0, a > b → 1; null, wenn eine Seite unlesbar ist. */
export function compareVersions(a, b) {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/**
 * Vor jeder Änderung: ein Paket mit älterer Versionsnummer als die installierte wird abgelehnt – auch wenn das
 * Datenbank-Schema gleich ist. Gleiche Version = Reparatur/erneut installieren, neuere = Update.
 * installed: Version der installierten Programmversion (null = Neuinstallation); allowOlder: bewusst zurück (CLI --aeltere-version).
 */
export function refuseOlderVersion(installed, mine, { allowOlder = false } = {}) {
  if (allowOlder || compareVersions(mine, installed) !== -1) return;
  throw new InputError(
    `Älteres Paket abgelehnt: Installiert ist Version ${parseVersion(installed).join('.')}, dieses Paket ist Version ${parseVersion(mine).join('.')}. Es wurde nichts verändert.`,
    'Das Paket mit der installierten oder einer neueren Version verwenden. Bewusst zurück auf eine ältere Version (nur wenn nötig, vorher sichern): manager/cli.mjs setup --config Installieren.json --aeltere-version',
  );
}

/** Vor jeder Änderung: ein Paket mit älterem Schema als die vorhandene Datenbank wird abgelehnt. → Schema der Datenbank (null = keine). */
export async function refuseDowngrade(dbFile, programDir, label) {
  const db = await dbSchemaVersion(dbFile);
  const mine = releaseSchemaVersion(programDir);
  if (db !== null && mine !== null && mine < db) {
    throw new InputError(`Downgrade verweigert: Dieses Paket (${label}) kennt nur Datenbank-Schema ${mine}, die installierte Datenbank hat schon Schema ${db} (neuere Version installiert). Es wurde nichts verändert.`, 'Ein Paket mit gleicher oder neuerer Version verwenden – oder die Datenbank aus einer Sicherung der älteren Version wiederherstellen.');
  }
  return db;
}

/** Sicherung mit der installierten (bisherigen) Version, wie „cli backup run“. Dienste sind dabei gestoppt. → Sicherungs-ID */
export async function backupWithInstalled(programRoot, reason = 'vor Update') {
  const current = path.join(programRoot, 'current');
  const bundled = path.join(current, 'node', path.basename(process.execPath));
  const env = { ...process.env };
  delete env.MANAGER_CONFIG; // die installierte Version findet ihre Einstellungen selbst (install.json)
  const { code, stdout } = await new Promise((resolve) =>
    execFile(fs.existsSync(bundled) ? bundled : process.execPath, [path.join(current, 'manager', 'cli.mjs'), 'backup', 'run', '--json', '--reason', reason], { cwd: programRoot, env, windowsHide: true, timeout: SICHERUNG_MAX_MS, maxBuffer: 16 * 1024 * 1024 }, (err, out) => resolve({ code: err ? (err.code ?? 1) : 0, stdout: out })),
  );
  let r = null;
  try {
    r = JSON.parse(stdout);
  } catch {
    /* keine JSON-Ausgabe */
  }
  if (code !== 0 || !r?.id) throw new InputError(`Sicherung vor dem Update fehlgeschlagen${r?.error ? ` (${r.error})` : ''} – es wurde nichts umgestellt, die bisherige Version läuft weiter.`, r?.hint ?? 'Platz und Backup-Ziel prüfen (Protokoll „Manager“), dann das Paket erneut installieren.');
  return r.id;
}

/** Nur die Datenbank aus einer Sicherung zurückspielen (Web-App gestoppt). Passwort aus backup.key, falls verschlüsselt. */
export async function restoreDbFrom({ backupDir, id, keyFile, dataDir, ablageDir }) {
  let password;
  try {
    password = fs.readFileSync(keyFile, 'utf8').trim() || undefined;
  } catch {
    /* unverschlüsselt */
  }
  const opened = await openBackup(path.join(backupDir, id + EXT), { password, stagingBase: backupDir });
  try {
    const problems = await applyBackup({ folder: opened.folder, meta: opened.meta, dirs: { dataDir, ablageDir }, only: ['db'] });
    if (problems.length) throw new Error(`Datenbank nicht vollständig zurückgespielt (${problems[0]})`);
  } finally {
    await opened.cleanup();
  }
}

/**
 * Rückfall nach einem fehlgeschlagenen Update: Dienste stoppen → „current“ auf die vorige Version → bei geändertem Schema
 * Datenbank aus der Sicherung → Dienste starten → Health. Die kaputte Version wird entfernt (nicht mehr auswählbar).
 * u = { programRoot, previous, failed, backupId, schemaBefore, dbFile }
 * ops = { stop(), start(), healthy() → bool, restoreDb(id) } – austauschbar für Tests.
 * → { healthy, data } (data: was mit der Datenbank passiert ist, als Text für die IT)
 */
export async function rollBack(u, ops) {
  const { switchCurrent } = await import('./update.mjs');
  const { removeTree } = await import('./setup.mjs');
  await ops.stop();
  switchCurrent(u.programRoot, u.previous);
  const schemaNow = await dbSchemaVersion(u.dbFile);
  let data = 'Daten unverändert (Datenbank-Schema gleich geblieben)';
  if (u.schemaBefore !== null && schemaNow !== u.schemaBefore) {
    if (!u.backupId) throw new Error(`Datenbank-Schema hat sich geändert (${u.schemaBefore} → ${schemaNow}), es gibt aber keine Sicherung von vor dem Update.`);
    await ops.restoreDb(u.backupId);
    const after = await dbSchemaVersion(u.dbFile);
    if (after !== u.schemaBefore) throw new Error(`Datenbank konnte nicht zurückgespielt werden (Schema ${after}, erwartet ${u.schemaBefore}) – Sicherung ${u.backupId} von Hand wiederherstellen.`);
    data = `Daten unverändert: Datenbank aus der Sicherung ${u.backupId} von direkt vor dem Update zurückgespielt (Schema ${schemaNow} → ${u.schemaBefore})`;
  }
  try {
    removeTree(path.join(u.programRoot, 'releases', u.failed));
  } catch {
    /* gesperrt – beim nächsten Update aufgeräumt */
  }
  await ops.start();
  return { healthy: await ops.healthy(), data };
}
