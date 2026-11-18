// Installer-Paket bauen – immer für das System, auf dem gebaut wird (mitgeliefertes Node.js passt nur dorthin):
//   Windows:          Mosaik3LAB-Installer-<version>-windows-x64.zip                 → Installieren.cmd
//   Linux x64/arm64:  Mosaik3LAB-Installer-<version>-linux-<arch>.tar.gz             → sudo ./installieren.sh
//   <version> = 1.2.3 bei freigegebener Version (Tag v1.2.3), sonst 1.2.3-dev.<commit> (Entwicklungsstand)
//                     (Raspberry Pi OS 64 Bit = linux-arm64; gebaut auf GitHub Actions, .github/workflows/installer-test.yml)
// Inhalt „wie ein normales Programm“ – wenige Dateien, keine node_modules:
//   server/dist/*.mjs      gebündelte Web-App und App-Skripte (npm run bundle -w server, esbuild)
//   server/src/storage/sqlite/migrations/*.sql   Migrationen (die App spielt sie ein, der Manager liest daraus die Schema-Version)
//   client/dist/           fertige Oberfläche
//   manager/               Server-Manager, Installer und Dienste (nur Node-Bordmittel, ohne Tests)
//   node/                  offizielles Node.js von nodejs.org (gleiche Version wie hier, SHA-256 gegen SHASUMS256.txt geprüft)
// Gebaut wird aus dem eingecheckten Stand (HEAD) in einem eigenen Ordner (npm ci, Build, Bündel); ins Paket kommt nur obige Liste.
// Aufruf: npm run paket                    → ../_pakete/ (auf diesem Rechner C:\Entwicklung\_pakete\)
//         npm run paket -- <ausgabeordner>
// Auf dem Zielrechner ruft das Startskript „manager/cli.mjs setup --config Installieren.json“ mit dem mitgelieferten Node auf.
// Nur Node-Bordmittel; gepackt wird mit tar (Windows: tar.exe = bsdtar, kann ZIP).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] ?? path.join(ROOT, '..', '_pakete'));
const WIN = process.platform === 'win32';
if (!WIN && process.platform !== 'linux') throw new Error(`Installer-Pakete gibt es für Windows und Linux, nicht für ${process.platform}.`);
if (!['x64', 'arm64'].includes(process.arch) || (WIN && process.arch !== 'x64')) throw new Error(`Installer-Pakete gibt es nicht für ${process.platform}-${process.arch}.`);
const TARGET = WIN ? 'win-x64' : `linux-${process.arch}`;
const TAR = WIN ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
// Darf nie ins Paket (lokale Einstellungen, Passwörter, Daten)
const FORBIDDEN = ['mosaik3lab.json', 'backup.key', 'manager/manager.config.json', '.claude/settings.local.json', 'storage', 'backups', 'manager/logs', '.git'];
// Entwickler-Dateien: dürfen auch nicht ins Paket (Prüfung über alle Dateien, Pfade mit /)
const DEV_FILES = [
  /(^|\/)(\.claude|\.github|node_modules|test|tests)\//, // Ordner
  /(^|\/)(CLAUDE\.md|tsconfig[^/]*\.json|eslint\.config\.[cm]?js|vite\.config\.[cm]?[jt]s)$/, // Entwickler-Konfiguration
  /\.test\.[cm]?[jt]sx?$/, // Tests
  /^(server|client|shared)\/src\/(?!storage\/sqlite\/migrations\/)/, // Quellen (nur die Migrationen gehören dazu)
];

const run = (cmd, args, cwd = ROOT) => {
  const opts = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] };
  // npm ist unter Windows eine .cmd-Datei → über die Shell (Argumente hier ohne Leerzeichen)
  return (cmd === 'npm' ? execSync(['npm', ...args].join(' '), opts) : execFileSync(cmd, args, opts)).trim();
};
const step = (text) => console.log(`• ${text}`);

/** Node.js für das Ziel holen (einmal, danach aus <ausgabeordner>/.node), gegen die offizielle Prüfsumme prüfen → { file, version, sha256 } */
async function bundledNode() {
  const v = process.version; // gleiche Version wie beim Bauen und Testen
  const base = `https://nodejs.org/dist/${v}/`;
  const cache = path.join(out, '.node', v);
  fs.mkdirSync(cache, { recursive: true });
  const load = async (rel, file) => {
    if (fs.existsSync(file)) return;
    const res = await fetch(base + rel, { signal: AbortSignal.timeout(300_000) });
    if (!res.ok) throw new Error(`Download fehlgeschlagen: ${base + rel} (HTTP ${res.status})`);
    fs.writeFileSync(`${file}.tmp`, Buffer.from(await res.arrayBuffer()));
    fs.renameSync(`${file}.tmp`, file);
  };
  // Windows: node.exe direkt; Linux: offizielles Archiv, daraus nur bin/node
  const rel = WIN ? 'win-x64/node.exe' : `node-${v}-${TARGET}.tar.gz`;
  const sums = path.join(cache, 'SHASUMS256.txt');
  const file = path.join(cache, path.basename(rel));
  await load('SHASUMS256.txt', sums);
  await load(rel, file);
  const want = fs.readFileSync(sums, 'utf8').split('\n').map((l) => l.trim().split(/\s+/)).find((c) => c[1] === rel)?.[0];
  const have = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (!want || want !== have) {
    fs.rmSync(file, { force: true });
    throw new Error(`${rel} ${v}: Prüfsumme stimmt nicht (erwartet ${want ?? '?'}, ist ${have}) – verworfen.`);
  }
  if (WIN) return { file, version: v, sha256: have };
  const bin = `node-${v}-${TARGET}/bin/node`;
  if (!fs.existsSync(path.join(cache, bin))) run(TAR, ['-xzf', file, '-C', cache, bin]);
  return { file: path.join(cache, bin), version: v, sha256: have };
}

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const commit = run('git', ['rev-parse', '--short', 'HEAD']);
// Freigegebene Version = Commit mit Tag v<version> (npm run release): „Mosaik3LAB-Installer-1.0.0-windows-x64“.
// Jeder andere Stand ist klar als Entwicklungsstand markiert: „…-1.0.0-dev.<commit>-…“ (nicht für die Schule gedacht).
const tagged = (() => {
  try {
    return execFileSync('git', ['describe', '--exact-match', '--tags', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === `v${version}`;
  } catch {
    return false;
  }
})();
const label = tagged ? version : `${version}-dev.${commit}`;
const name = `Mosaik3LAB-Installer-${label}-${WIN ? 'windows-x64' : TARGET}`; // System immer im Namen
const archive = path.join(out, `${name}${WIN ? '.zip' : '.tar.gz'}`);
const bau = path.join(out, `.bau-${name}`);
const src = path.join(bau, 'quelle'); // Bauordner: kompletter Stand mit node_modules
const pack = path.join(bau, 'paket');
const work = WIN ? pack : path.join(pack, name); // Linux: ein Ordner im Archiv (tar xzf → <name>/installieren.sh)
// Was aus dem Bauordner ins Paket kommt (alles andere – Quellen, Tests, node_modules – bleibt draußen)
const KEEP = ['package.json', 'package-lock.json', 'shared/package.json', 'client/package.json', 'client/dist', 'server/package.json', 'server/dist', 'server/src/storage/sqlite/migrations', 'manager', 'docs/INSTALLATION.md', 'CHANGELOG.md'];
const SKIP = ['manager/test'];

if (run('git', ['status', '--porcelain', '--untracked-files=no'])) console.log('! Nicht eingecheckte Änderungen kommen NICHT ins Paket (nur der Stand von HEAD).');
fs.mkdirSync(out, { recursive: true });
fs.rmSync(bau, { recursive: true, force: true });
fs.mkdirSync(src, { recursive: true });
fs.mkdirSync(work, { recursive: true });

try {
  step(`eingecheckter Stand ${commit} → ${src} (${TARGET})`);
  run('git', ['archive', '--format=tar', '-o', `${bau}.tar`, 'HEAD']);
  run(TAR, ['-xf', `${bau}.tar`, '-C', src]);
  fs.rmSync(`${bau}.tar`);

  step('Abhängigkeiten (npm ci), Oberfläche (Build), Server bündeln (esbuild)');
  run('npm', ['ci', '--prefer-offline', '--no-audit', '--no-fund', '--loglevel=error'], src);
  run('npm', ['run', 'build', '-w', 'client', '--silent'], src);
  run('npm', ['run', 'bundle', '-w', 'server', '--silent'], src);
  for (const f of ['client/dist/index.html', 'server/dist/server.mjs', 'server/dist/bild-worker.mjs']) if (!fs.existsSync(path.join(src, f))) throw new Error(`Build fehlt: ${f}`);

  step('Programmdateien übernehmen (ohne Quellen, Tests, node_modules)');
  for (const rel of KEEP) fs.cpSync(path.join(src, rel), path.join(work, rel), { recursive: true, filter: (p) => !SKIP.some((s) => path.relative(path.join(src, s), p).split(path.sep)[0] !== '..') });

  const node = await bundledNode();
  step(`Node.js ${node.version} (${TARGET}, SHA-256 geprüft)`);
  fs.mkdirSync(path.join(work, 'node'));
  const nodeDest = path.join(work, 'node', WIN ? 'node.exe' : 'node');
  fs.copyFileSync(node.file, nodeDest);
  if (!WIN) fs.chmodSync(nodeDest, 0o755);

  // Startskript aus dem eingecheckten Stand nach oben legen (Installieren.cmd dort mit CRLF, siehe .gitattributes)
  const starter = WIN ? 'Installieren.cmd' : 'installieren.sh';
  for (const f of [starter, 'Installieren.json']) fs.copyFileSync(path.join(work, 'manager', f), path.join(work, f));
  if (!WIN) fs.chmodSync(path.join(work, starter), 0o755);
  // Kurzanleitung je Ziel (Vorlage scripts/paket-readme/, Windows mit CRLF für den Editor)
  const readme = fs.readFileSync(path.join(src, 'scripts', 'paket-readme', `README-${TARGET}.txt`), 'utf8').replaceAll('{{version}}', label).replaceAll('{{commit}}', commit).replaceAll('{{name}}', name);
  fs.writeFileSync(path.join(work, 'README.txt'), WIN ? readme.replace(/\r?\n/g, '\r\n') : readme);
  fs.writeFileSync(path.join(work, 'paket.json'), `${JSON.stringify({ name, version, release: tagged, commit, node: { version: node.version, platform: TARGET, sha256: node.sha256 }, builtAt: new Date().toISOString() }, null, 2)}\n`);

  const all = fs.readdirSync(work, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.relative(work, path.join(e.parentPath, e.name)).split(path.sep).join('/'));
  const found = [...FORBIDDEN.filter((f) => fs.existsSync(path.join(work, f))), ...all.filter((f) => DEV_FILES.some((re) => re.test(f)))];
  if (found.length) throw new Error(`Darf nicht ins Paket: ${found.slice(0, 10).join(', ')}${found.length > 10 ? ' …' : ''}`);
  const count = all.length;

  step(`packen → ${archive}`);
  fs.rmSync(archive, { force: true });
  if (WIN) run(TAR, ['-a', '-c', '-f', archive, '-C', work, ...fs.readdirSync(work)]);
  else run(TAR, ['-czf', archive, '--owner=0', '--group=0', '-C', pack, name]);
  console.log(`✔ ${archive} (${(fs.statSync(archive).size / 1024 / 1024).toFixed(1)} MB, ${count} Dateien)`);
} finally {
  fs.rmSync(bau, { recursive: true, force: true });
  fs.rmSync(`${bau}.tar`, { force: true });
}
