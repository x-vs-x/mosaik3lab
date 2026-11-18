// Dateien und Ordner des Programmordners: sicher löschen (Verweise zuerst, nie verfolgen) und npm-Workspaces neu verknüpfen.
// Eigenes Modul ohne Rückimporte – gebraucht von Einrichtung (setup.mjs), Releases (releases.mjs) und Rückfall (paketupdate.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { platform } from '../platform/index.mjs';

/**
 * Ordner sicher löschen. Verweise (Junctions/Symlinks, z. B. npm-Workspaces) werden nie verfolgt und
 * ZUERST entfernt – sonst würde ihr Ziel vorher gelöscht und der Verweis bliebe verwaist zurück.
 */
export function removeTree(dir) {
  const unlink = (p) => {
    try {
      fs.unlinkSync(p);
    } catch {
      try {
        fs.rmdirSync(p); // Windows-Junction
      } catch {
        if (process.platform === 'win32') execFileSync('cmd.exe', ['/d', '/c', 'rmdir', p], { stdio: 'ignore' });
      }
    }
  };
  const walk = (p, removeLinks) => {
    let st;
    try {
      st = fs.lstatSync(p);
    } catch {
      // Gibt es nicht (mehr) – oder eine Windows-Junction ins Leere (lstat: ENOENT, steht aber noch im Ordner)
      if (removeLinks && fs.existsSync(path.dirname(p)) && fs.readdirSync(path.dirname(p)).includes(path.basename(p))) unlink(p);
      return;
    }
    if (st.isSymbolicLink()) return removeLinks && unlink(p);
    if (!st.isDirectory()) return !removeLinks && fs.rmSync(p, { force: true });
    for (const name of fs.readdirSync(p)) walk(path.join(p, name), removeLinks);
    if (!removeLinks) fs.rmdirSync(p);
  };
  walk(dir, true); // 1. alle Verweise entfernen
  walk(dir, false); // 2. Dateien und Ordner löschen
}

/**
 * npm-Workspaces (z. B. node_modules/@mosaik3lab/shared) auf die Ordner von `dest` verweisen lassen: fehlende anlegen,
 * Verweise auf einen anderen Ort ersetzen (npm ci legt sie mit absolutem Pfad an – nach dem Umbenennen oder
 * Kopieren in einen anderen Ordner zeigen sie sonst ins Leere und die Web-App startet nicht).
 */
export function linkWorkspaces(dest) {
  if (!fs.existsSync(path.join(dest, 'node_modules'))) return;
  for (const ws of JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8')).workspaces ?? []) {
    const name = JSON.parse(fs.readFileSync(path.join(dest, ws, 'package.json'), 'utf8')).name;
    const link = path.join(dest, 'node_modules', ...name.split('/'));
    const target = path.join(dest, ws);
    // Windows: lstat meldet für eine Junction ins Leere ENOENT – im Ordnerinhalt steht sie trotzdem.
    const present = fs.existsSync(path.dirname(link)) && fs.readdirSync(path.dirname(link)).includes(path.basename(link));
    let stat = null;
    try {
      stat = fs.lstatSync(link);
    } catch {
      /* fehlt oder zeigt ins Leere */
    }
    if (stat && !stat.isSymbolicLink()) continue; // echter Ordner (kopiert) – so lassen
    if (present) {
      let ok = false;
      try {
        ok = fs.realpathSync(link) === fs.realpathSync(target);
      } catch {
        /* zeigt ins Leere */
      }
      if (ok) continue;
      platform.unlinkDir(link);
    }
    fs.mkdirSync(path.dirname(link), { recursive: true });
    platform.linkDir(target, link);
  }
}
