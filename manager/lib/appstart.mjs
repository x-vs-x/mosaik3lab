// Wie Web-App und App-Skripte gestartet werden – für beide Programmformen:
//   Arbeitskopie / Git-Update / ältere Pakete: TypeScript über tsx (node_modules)
//   Installer-Paket (gebündelt):               server/dist/<name>.mjs ohne node_modules (npm run bundle -w server)
// tsx hat Vorrang, damit in der Entwicklung nie ein veraltetes Bündel läuft.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const hasTsx = (dir) => fs.existsSync(path.join(dir, 'node_modules', 'tsx'));
const bundled = (dir, name) => path.join(dir, 'server', 'dist', `${name}.mjs`);

/** Ist die Programmversion startbereit (tsx oder Bündel vorhanden)? */
export const appRunnable = (dir) => hasTsx(dir) || fs.existsSync(bundled(dir, 'server'));

/**
 * Argumente für `node` (Arbeitsordner: <dir>/server). name: 'server' (Web-App) oder ein Skript aus server/scripts
 * ('create-admin', 'db-backup', 'mail-test'). imports: zusätzliche --import-Module (vor der App geladen).
 */
export function appArgs(dir, name, args = [], imports = []) {
  const pre = imports.flatMap((m) => ['--import', m]);
  if (hasTsx(dir) || !fs.existsSync(bundled(dir, name))) return ['--import', 'tsx', ...pre, name === 'server' ? path.join('src', 'index.ts') : path.join('scripts', `${name}.ts`), ...args];
  return [...pre, bundled(dir, name), ...args];
}

/** bcryptjs der App: aus node_modules oder aus dem Bündel (server/dist/bcryptjs.cjs). Fehlt beides → Fehler. */
export function appBcrypt(dir) {
  const req = createRequire(path.join(dir, 'server', 'package.json'));
  try {
    return req('bcryptjs');
  } catch {
    return req('./dist/bcryptjs.cjs');
  }
}
