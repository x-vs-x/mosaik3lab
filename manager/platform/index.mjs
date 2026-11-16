// Plattformschicht: alles Betriebssystem-Spezifische liegt in windows.mjs bzw. linux.mjs (auch Raspberry Pi).
// Der Rest des Managers benutzt nur `platform`.
import fs from 'node:fs';
import { windows } from './windows.mjs';
import { linux } from './linux.mjs';

export * from './common.mjs';
export { windows, linux };

/**
 * Probelauf für Tests und Klicktests (MOSAIK3LAB_SYSTEM_DRY_RUN=<datei.json>): keine Windows-Bestätigung, keine Verknüpfungen, keine echte
 * Firewall-Regel, keine Betriebssystem-Dienste, kein winget/apt. Firewall-Regeln werden nur in der Datei vermerkt,
 * damit „Im Schulnetz erreichbar“ und „Abgleichen“ sich wie echt verhalten.
 */
function dryRun(base, file) {
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return { rules: [], scripts: [] };
    }
  };
  const write = (s) => fs.writeFileSync(file, JSON.stringify(s, null, 1));
  return {
    ...base,
    dryRun: true,
    isAdmin: async () => false,
    async elevate(script) {
      const s = read();
      for (const [, verb, port] of script.matchAll(/^PROBELAUF (allow|remove) (\d+)$/gm)) {
        s.rules = verb === 'allow' ? [...new Set([...s.rules, Number(port)])] : s.rules.filter((p) => p !== Number(port));
      }
      s.scripts = [...s.scripts, script].slice(-20);
      write(s);
      return { ok: true, code: 0, output: 'Probelauf' };
    },
    firewall: {
      exists: async (port) => read().rules.includes(Number(port)),
      allowScript: (port) => `PROBELAUF allow ${Number(port)}`,
      removeScript: (port) => `PROBELAUF remove ${Number(port)}`,
      publicNetwork: async () => read().publicNetwork === true,
    },
    services: { ...base.services, status: async () => ({ installed: false, running: false }), control: async () => true },
    createShortcuts: async () => {}, // nie echte Verknüpfungen auf Desktop/Startmenü (gleiche Namen wie die echte Installation)
  };
}

const PLATFORMS = { win32: windows, linux };
const native = PLATFORMS[process.platform] ?? linux; // macOS o. Ä.: Linux-Weg (ungetestet)
export const platform = process.env.MOSAIK3LAB_SYSTEM_DRY_RUN ? dryRun(native, process.env.MOSAIK3LAB_SYSTEM_DRY_RUN) : native;
