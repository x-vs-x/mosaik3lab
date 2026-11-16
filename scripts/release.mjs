#!/usr/bin/env node
// Neue Version freigeben (SemVer): eine Versionsnummer für alles – App, Server, Manager, Installer-Pakete.
//   npm run release -- patch     Fehlerbehebung          1.0.0 → 1.0.1
//   npm run release -- minor     neue Funktion           1.0.0 → 1.1.0
//   npm run release -- major     große Umstellung        1.0.0 → 2.0.0
//   npm run release -- 1.2.3     genau diese Version (muss höher sein)
// Ablauf: sauberer Stand auf main → Version in allen package.json (+ package-lock.json) → CHANGELOG.md: „Unveröffentlicht“
// wird zum Abschnitt der neuen Version → Commit „Version x.y.z“ + Tag vx.y.z. Danach: git push origin main --follow-tags
// (das Tag startet auf GitHub den Installer-Test; bestanden → Release vx.y.z mit allen drei Paketen).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILES = ['package.json', 'client/package.json', 'server/package.json', 'shared/package.json'];
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const fail = (msg) => {
  console.error(`✘ ${msg}`);
  process.exit(1);
};
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const write = (f, data) => fs.writeFileSync(path.join(ROOT, f), `${JSON.stringify(data, null, 2)}\n`);

const arg = process.argv[2];
if (!arg) fail('Art angeben: npm run release -- patch | minor | major | <x.y.z>');
const current = read('package.json').version;
const [ma, mi, pa] = current.split('.').map(Number);
const next = { patch: `${ma}.${mi}.${pa + 1}`, minor: `${ma}.${mi + 1}.0`, major: `${ma + 1}.0.0` }[arg] ?? arg;
if (!/^\d+\.\d+\.\d+$/.test(next)) fail(`„${arg}“ ist keine Version (patch, minor, major oder z. B. 1.2.3).`);
const higher = next.split('.').map(Number).reduce((r, n, i) => r || (n !== [ma, mi, pa][i] ? (n > [ma, mi, pa][i] ? 1 : -1) : 0), 0);
if (higher !== 1) fail(`${next} ist nicht höher als die aktuelle Version ${current}.`);

if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') fail('Versionen nur auf main freigeben.');
if (git('status', '--porcelain')) fail('Es gibt noch nicht eingecheckte Änderungen – erst committen.');
if (git('tag', '--list', `v${next}`)) fail(`Das Tag v${next} gibt es schon.`);
for (const f of FILES) if (read(f).version !== current) fail(`${f} hat Version ${read(f).version}, erwartet ${current} – bitte angleichen.`);

// CHANGELOG: alles unter „## [Unveröffentlicht]“ wird zum Abschnitt der neuen Version
const changelogFile = path.join(ROOT, 'CHANGELOG.md');
const changelog = fs.readFileSync(changelogFile, 'utf8');
const HEAD = '## [Unveröffentlicht]';
const start = changelog.indexOf(HEAD);
if (start < 0) fail(`In CHANGELOG.md fehlt die Überschrift „${HEAD}“.`);
const after = changelog.indexOf('\n## [', start + HEAD.length);
const notes = changelog.slice(start + HEAD.length, after < 0 ? undefined : after).trim();
if (!notes) fail('Unter „Unveröffentlicht“ in CHANGELOG.md steht nichts – bitte kurz eintragen, was sich ändert.');
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(changelogFile, `${changelog.slice(0, start)}${HEAD}\n\n## [${next}] – ${today}\n\n${notes}\n${after < 0 ? '' : changelog.slice(after)}`);

// Versionen setzen (alle Teilpakete gleich; interne Abhängigkeiten stehen auf „*“ = Version im eigenen Projekt) und
// package-lock.json von npm selbst nachrechnen lassen – scheitert das (z. B. unauflösbare Abhängigkeit), bricht die Freigabe ab.
for (const f of FILES) {
  const pkg = read(f);
  for (const deps of [pkg.dependencies, pkg.devDependencies]) {
    for (const name of Object.keys(deps ?? {})) if (name.startsWith('@mosaik3lab/') && deps[name] !== '*') fail(`${f}: interne Abhängigkeit ${name} muss „*“ sein (ist „${deps[name]}“).`);
  }
  write(f, { ...pkg, version: next });
}
try {
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
} catch {
  git('checkout', '--', ...FILES, 'package-lock.json', 'CHANGELOG.md');
  fail('package-lock.json ließ sich nicht neu berechnen – nichts geändert. Fehler oben ansehen.');
}

git('add', ...FILES, 'package-lock.json', 'CHANGELOG.md');
git('commit', '-q', '-m', `Version ${next}`);
git('tag', '-a', `v${next}`, '-m', `Version ${next}`);
console.log(`✔ Version ${next} (vorher ${current}): Commit und Tag v${next} angelegt.`);
console.log('  Jetzt hochladen:  git push origin main --follow-tags');
console.log(`  → GitHub testet auf Windows, Linux und Raspberry Pi und legt das Release v${next} mit allen drei Paketen an.`);
