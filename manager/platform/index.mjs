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
      // Probelauf verhält sich wie ein Rechner mit aktiver Firewall – unabhängig vom echten System (Linux-Runner ohne ufw)
      available: async () => true,
      active: async () => true,
      exists: async (port) => read().rules.includes(Number(port)),
      allowScript: (port) => `PROBELAUF allow ${Number(port)}`,
      removeScript: (port) => `PROBELAUF remove ${Number(port)}`,
      publicNetwork: async () => read().publicNetwork === true,
    },
    // Dienste: Zustand aus der Datei (z. B. { "services": { "updater": { "installed": true } } } für Klicktests), Starts/Stopps nur vermerkt
    services: {
      ...base.services,
      status: async (key) => read().services?.[key] ?? { installed: false, running: false },
      control: async (key, action) => {
        const s = read();
        s.control = [...(s.control ?? []), `${action} ${key}`].slice(-50);
        write(s);
        return true;
      },
    },
    createShortcuts: async () => {}, // nie echte Verknüpfungen auf Desktop/Startmenü (gleiche Namen wie die echte Installation)
    // nur Linux: zu altes polkit (Tests: { "polkitProblem": "…" } in der Datei)
    ...(base.polkitProblem ? { polkitProblem: async () => read().polkitProblem ?? null } : {}),
  };
}

const PLATFORMS = { win32: windows, linux };
const native = PLATFORMS[process.platform] ?? linux; // macOS o. Ä.: Linux-Weg (ungetestet)
export const platform = process.env.MOSAIK3LAB_SYSTEM_DRY_RUN ? dryRun(native, process.env.MOSAIK3LAB_SYSTEM_DRY_RUN) : native;
