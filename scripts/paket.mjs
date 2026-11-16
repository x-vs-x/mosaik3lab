// Installer-Paket bauen – immer für das System, auf dem gebaut wird (node_modules mit den passenden nativen Teilen, z. B. esbuild):
//   Windows:          Mosaik3LAB-Installer-<version>-<commit>.zip                    → Installieren.cmd
//   Linux x64/arm64:  Mosaik3LAB-Installer-<version>-<commit>-linux-<arch>.tar.gz    → sudo ./installieren.sh
//                     (Raspberry Pi OS 64 Bit = linux-arm64; gebaut auf GitHub Actions, .github/workflows/installer-test.yml)
// Inhalt: eingecheckter Stand (HEAD), fertige Oberfläche, node_modules und das offizielle Node.js von nodejs.org
// (gleiche Version wie hier, SHA-256 gegen SHASUMS256.txt geprüft).
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
const name = `Mosaik3LAB-Installer-${version}-${commit}${WIN ? '' : `-${TARGET}`}`;
const archive = path.join(out, `${name}${WIN ? '.zip' : '.tar.gz'}`);
const bau = path.join(out, `.bau-${name}`);
const work = WIN ? bau : path.join(bau, name); // Linux: ein Ordner im Archiv (tar xzf → <name>/installieren.sh)

if (run('git', ['status', '--porcelain', '--untracked-files=no'])) console.log('! Nicht eingecheckte Änderungen kommen NICHT ins Paket (nur der Stand von HEAD).');
fs.mkdirSync(out, { recursive: true });
fs.rmSync(bau, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

try {
  step(`eingecheckter Stand ${commit} → ${work} (${TARGET})`);
  run('git', ['archive', '--format=tar', '-o', `${bau}.tar`, 'HEAD']);
  run(TAR, ['-xf', `${bau}.tar`, '-C', work]);
  fs.rmSync(`${bau}.tar`);

  step('Abhängigkeiten (npm ci) und Oberfläche (Build)');
  run('npm', ['ci', '--prefer-offline', '--no-audit', '--no-fund', '--loglevel=error'], work);
  run('npm', ['run', 'build', '-w', 'client', '--silent'], work);
  if (!fs.existsSync(path.join(work, 'client', 'dist', 'index.html'))) throw new Error('Build fehlt: client/dist/index.html');

  // ZIP kann keine Verweise: npm-Workspaces (node_modules/@mosaik3lab/*) entfernen – das Setup legt sie neu an.
  for (const dir of [path.join(work, 'node_modules'), ...fs.readdirSync(path.join(work, 'node_modules')).filter((n) => n.startsWith('@')).map((n) => path.join(work, 'node_modules', n))]) {
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      if (!fs.lstatSync(p).isSymbolicLink()) continue;
      try {
        fs.unlinkSync(p);
      } catch {
        fs.rmdirSync(p); // Windows-Junction (nur der Verweis, nie das Ziel)
      }
    }
  }

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
  fs.writeFileSync(path.join(work, 'paket.json'), `${JSON.stringify({ name, version, commit, node: { version: node.version, platform: TARGET, sha256: node.sha256 }, builtAt: new Date().toISOString() }, null, 2)}\n`);

  const found = FORBIDDEN.filter((f) => fs.existsSync(path.join(work, f)));
  if (found.length) throw new Error(`Darf nicht ins Paket: ${found.join(', ')}`);

  step(`packen → ${archive}`);
  fs.rmSync(archive, { force: true });
  if (WIN) run(TAR, ['-a', '-c', '-f', archive, '-C', work, ...fs.readdirSync(work)]);
  else run(TAR, ['-czf', archive, '--owner=0', '--group=0', '-C', bau, name]);
  console.log(`✔ ${archive} (${(fs.statSync(archive).size / 1024 / 1024).toFixed(1)} MB)`);
} finally {
  fs.rmSync(bau, { recursive: true, force: true });
  fs.rmSync(`${bau}.tar`, { force: true });
}
