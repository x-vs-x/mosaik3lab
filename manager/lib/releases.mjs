// Versionen im Programmordner: <Programmordner>/releases/<id> + Verweis „current“ auf die aktive Version, Verlauf in
// releases/history.json (für den Rückfall auf die vorige Version). Gebraucht von Einrichtung/Update per Paket (setup.mjs),
// Rückfall (paketupdate.mjs), Update-Helfer und Anzeige.
import fs from 'node:fs';
import path from 'node:path';
import { platform } from '../platform/index.mjs';
import { INSTALL, PROGRAM_DIR, InputError } from './config.mjs';
import { removeTree } from './dateien.mjs';

const ID = /^[\w.-]{1,80}$/;

/** Aktive Version: { id, dir, …(.release.json) } oder null. */
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

/** Installierte Version (Installation) bzw. Version der Arbeitskopie – für die Anzeige. */
export const installedVersion = () => (INSTALL ? currentRelease(INSTALL.programRoot) : { id: 'Arbeitskopie', version: JSON.parse(fs.readFileSync(path.join(PROGRAM_DIR, 'package.json'), 'utf8')).version });
