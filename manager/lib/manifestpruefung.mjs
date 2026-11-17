// Deinstallieren läuft mit Adminrechten (root/Administrator) und arbeitet das install-manifest.json ab. Unter Linux liegt
// es im Datenordner (/var/lib/mosaik3lab/manager), den der Dienstbenutzer schreiben kann – ein übernommener Manager könnte
// dort Einträge unterschieben (z. B. einen Dienstnamen mit Shell-Befehl oder „/etc“ als Programmordner). Deshalb gilt nur,
// was zu Mosaik³LAB passt; alles andere wird übersprungen und gemeldet. Reine Entscheidung, ohne Dateizugriff.
import path from 'node:path';

const SHORTCUT_EXT = new Set(['.lnk', '.url', '.desktop']);

/**
 * entries: Einträge des Manifests. opts = { serviceIds: erlaubte Dienstnamen, programRoot: bekannter Programmordner (aus
 * install.json im Programmordner, nur Admin schreibt) oder null }. → { entries: gültige, verworfen: [{ entry, grund }] }
 */
export function manifestPruefen(entries, { serviceIds, programRoot = null } = {}) {
  const ok = [];
  const verworfen = [];
  const weg = (entry, grund) => verworfen.push({ entry, grund });
  const gleich = (a, b) => path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || typeof e !== 'object') continue;
    if (e.type === 'service') {
      if (!serviceIds.includes(e.name)) weg(e, 'unbekannter Dienstname');
      else ok.push(e);
    } else if (e.type === 'firewall') {
      const port = Number(e.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) weg(e, 'ungültiger Port');
      else ok.push({ ...e, port });
    } else if (e.type === 'shortcut') {
      const p = String(e.path ?? '');
      if (!path.isAbsolute(p) || !SHORTCUT_EXT.has(path.extname(p).toLowerCase())) weg(e, 'keine Verknüpfung');
      else ok.push(e);
    } else if (e.type === 'folder') {
      const p = String(e.path ?? '');
      if (!path.isAbsolute(p) || path.dirname(p) === p) weg(e, 'ungültiger Ordner');
      else if (e.role === 'program' && programRoot && !gleich(p, programRoot)) weg(e, 'nicht der Programmordner dieser Installation');
      else ok.push(e);
    } else ok.push(e); // acl, file … – beim Deinstallieren ohne Wirkung
  }
  return { entries: ok, verworfen };
}
