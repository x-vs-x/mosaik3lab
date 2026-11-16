import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Wurzel des Programms: der nächste Ordner nach oben mit der obersten package.json („mosaik3lab“). Gesucht statt fest
 * gerechnet, weil der Code an zwei Orten liegt: server/src/kern (Entwicklung, tsx) und server/dist (Installer-Paket,
 * gebündelt) – eine feste Anzahl „..“ stimmt nur für einen davon (so war „Was ist neu“ im Paket 1.1.0 leer).
 */
function programmWurzel(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { name?: string };
      if (pkg.name === 'mosaik3lab') return dir;
    } catch {
      /* hier keine package.json */
    }
    dir = path.dirname(dir);
  }
  return null;
}

/** Versionsnummer (eine für alles, oberste package.json – auch im Installer-Paket enthalten). */
export const APP_VERSION: string = (() => {
  const wurzel = programmWurzel();
  try {
    return wurzel ? ((JSON.parse(fs.readFileSync(path.join(wurzel, 'package.json'), 'utf8')) as { version?: string }).version ?? 'unbekannt') : 'unbekannt';
  } catch {
    return 'unbekannt';
  }
})();

/** Nur echte Versionsnummern wie 1.2.0 (keine Vorabstände wie 1.2.0-dev). */
export const istVersion = (v: unknown): v is string => typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v);

/** Numerischer Vergleich (1.10.0 > 1.9.0): negativ, 0 oder positiv. */
export function vergleicheVersion(a: string, b: string): number {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
