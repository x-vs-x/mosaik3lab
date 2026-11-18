// Server für das Installer-Paket bündeln: je Einstieg eine ESM-Datei in server/dist/ – ohne node_modules lauffähig.
//   server.mjs        Web-App (src/index.ts)
//   bild-worker.mjs   Rechen-Thread der Bildverarbeitung (src/kern/bilder/worker.ts, mit jpeg-js/pngjs); die App lädt ihn
//                     aus demselben Ordner (kern/bilder/rechner.ts)
//   create-admin.mjs  db-backup.mjs  mail-test.mjs   Skripte für den Server-Manager
//   bcryptjs.cjs      Passwortprüfung des Server-Managers (manager/lib/auth.mjs)
// Node-Bordmittel (auch node:sqlite) bleiben extern. Migrationen bleiben als Dateien unter src/storage/sqlite/migrations
// (der Server-Manager liest dort die Schema-Version); Pfade laufen über ROOT_DIR (config.ts) und passen ab dist/ genauso.
// Aufruf: npm run bundle -w server  (die Entwicklung läuft weiter über tsx)
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build, type BuildOptions } from 'esbuild';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(SERVER, 'dist');
fs.rmSync(out, { recursive: true, force: true });

const common: BuildOptions = { bundle: true, platform: 'node', target: 'node24', legalComments: 'none', logLevel: 'warning', absWorkingDir: SERVER };
await build({
  ...common,
  entryPoints: { server: 'src/index.ts', 'bild-worker': 'src/kern/bilder/worker.ts', 'create-admin': 'scripts/create-admin.ts', 'db-backup': 'scripts/db-backup.ts', 'mail-test': 'scripts/mail-test.ts' },
  outdir: out,
  outExtension: { '.js': '.mjs' },
  format: 'esm',
  splitting: true, // gemeinsamer Code der Einstiege nur einmal (chunk-*.mjs)
  chunkNames: 'chunk-[hash]',
  // CommonJS-Pakete (express, multer, nodemailer …) rufen require() für Node-Bordmittel auf
  banner: { js: "import { createRequire as __m3lRequire } from 'node:module'; const require = __m3lRequire(import.meta.url);" },
});
await build({ ...common, entryPoints: [createRequire(path.join(SERVER, 'package.json')).resolve('bcryptjs')], outfile: path.join(out, 'bcryptjs.cjs'), format: 'cjs' });

const files = fs.readdirSync(out);
const kb = files.reduce((s, f) => s + fs.statSync(path.join(out, f)).size, 0) / 1024;
console.log(`✔ server/dist: ${files.length} Dateien, ${(kb / 1024).toFixed(1)} MB`);
