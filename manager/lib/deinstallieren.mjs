// Deinstallation: entfernt genau, was im install-manifest steht (Dienste, Firewall-Regeln, Verknüpfungen, Programmordner).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { platform, SERVICE_IDS } from '../platform/index.mjs';
import { INSTALL, PROGRAM_DIR, MANAGER_DIR, layout, isInside, InputError } from './config.mjs';
import { readManifest, manifestFile } from './manifest.mjs';
import { manifestPruefen } from './manifestpruefung.mjs';
import { removeTree } from './dateien.mjs';
import { logger } from './log.mjs';

const log = () => logger('manager');

/**
 * Entfernt alles, was im install-manifest steht: Dienste, Firewall-Regeln, Verknüpfungen, Programmordner.
 * keepData (Standard true): Daten, Sicherungen, Einstellungen und Logs bleiben erhalten.
 */
export async function uninstall({ dataRoot = INSTALL?.dataRoot, managerDir, keepData = true, dryRun = false } = {}) {
  // Manifest: in der Installation bekannt (install.json), sonst <Datenordner>/manager (Linux-Layout)
  managerDir ??= INSTALL && (!dataRoot || dataRoot === INSTALL.dataRoot) ? INSTALL.managerDir : dataRoot && path.join(dataRoot, 'manager');
  const m = managerDir && readManifest(managerDir);
  if (!m) throw new InputError('Keine Installation gefunden (install-manifest.json fehlt).', 'Den Datenordner der Installation angeben: uninstall --data-root <ordner> (bzw. --manager-dir <Programmordner>)');
  // Das Manifest kann (Linux: Datenordner) vom Dienstbenutzer stammen – nur Einträge, die zu Mosaik³LAB passen (manifestpruefung.mjs)
  const geprueft = manifestPruefen(m.entries, { serviceIds: Object.values(SERVICE_IDS), programRoot: INSTALL?.programRoot ?? null });
  for (const v of geprueft.verworfen) log().warn(`Deinstallieren: Eintrag im Manifest übersprungen (${v.grund}): ${JSON.stringify(v.entry).slice(0, 200)}`);
  const by = (t) => geprueft.entries.filter((e) => e.type === t);
  const adminLines = [
    ...by('service').map((e) => platform.services.uninstallScript(e.name, layout({ dataRoot, managerDir }).services)),
    ...by('firewall').map((e) => platform.firewall.removeScript(e.port)),
  ];
  const program = by('folder').find((e) => e.role === 'program')?.path;
  const runningFromProgram = program && isInside(fs.realpathSync(PROGRAM_DIR), program);
  const removeFolders = by('folder').filter((e) => e.role === 'program' || !keepData);
  const plan = {
    services: by('service').map((e) => e.name),
    firewall: by('firewall').map((e) => e.name),
    shortcuts: by('shortcut').map((e) => e.path),
    folders: removeFolders.map((e) => e.path),
    keep: keepData ? by('folder').filter((e) => e.role !== 'program').map((e) => e.path) : [],
    command: adminLines.join('\n'),
  };
  if (dryRun) return { dryRun: true, ...plan };
  if (adminLines.length) {
    const { admin } = await import('./services.mjs');
    await admin(adminLines.join('\n'), 'Dienste und Firewall-Regeln entfernen');
  }
  for (const s of plan.shortcuts) fs.rmSync(s, { force: true });
  for (const dir of new Set(plan.shortcuts.map((s) => path.dirname(s)))) if (/Mosaik(³|3)LAB$/i.test(dir) && fs.existsSync(dir) && !fs.readdirSync(dir).length) fs.rmdirSync(dir);
  for (const f of removeFolders) {
    if (f.path === program && runningFromProgram) {
      // Der Manager läuft gerade aus diesem Ordner: ein eigener Prozess löscht ihn nach Programmende (wiederholt, solange
      // z. B. das Fenster noch offen ist). Mitgeliefertes node.exe liegt selbst im Ordner → vorher eine Kopie im Temp-Ordner starten.
      const code = `import { removeTree } from ${JSON.stringify(pathToFileURL(path.join(MANAGER_DIR, 'lib', 'dateien.mjs')).href)}; let n = 0; const go = () => { try { removeTree(${JSON.stringify(f.path)}); } catch { if (++n < 200) setTimeout(go, 3000); } }; setTimeout(go, 3000);`;
      let node = process.execPath;
      if (isInside(node, f.path) || isInside(fs.realpathSync(node), f.path)) {
        node = path.join(os.tmpdir(), `mosaik3lab-deinstallieren-${process.pid}${path.extname(process.execPath)}`);
        fs.copyFileSync(process.execPath, node);
      }
      spawn(node, ['--input-type=module', '-e', code], { detached: true, stdio: 'ignore', windowsHide: true, cwd: path.dirname(f.path), env: { ...process.env, MOSAIK3LAB_QUIET: '1' } }).unref();
    } else {
      removeTree(f.path);
    }
  }
  if (keepData) fs.rmSync(manifestFile(managerDir), { force: true });
  return { removed: true, ...plan };
}
