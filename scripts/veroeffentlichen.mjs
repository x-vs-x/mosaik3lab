#!/usr/bin/env node
// Freigegebene Version für die Schulen veröffentlichen: kopiert die drei getesteten Pakete aus dem (privaten) Release vX.Y.Z
// in das öffentliche Repository x-vs-x/mosaik3lab-pakete – dort holt der Server-Manager seine Updates.
//   npm run veroeffentlichen              aktuelle Version aus package.json
//   npm run veroeffentlichen -- 1.2.0     bestimmte Version
// Veröffentlicht wird NUR, wenn: Tag vX.Y.Z existiert, der Installer-Test für dieses Tag auf allen Systemen bestanden hat,
// das private Release keine Vorabversion ist und alle drei Pakete mit genau dieser Version enthält, und die Version
// öffentlich noch nicht existiert. Dazu: SHA256SUMS.txt (prüft der Update-Helfer) und die Änderungen aus CHANGELOG.md.
// Voraussetzung: GitHub CLI (gh), angemeldet.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PRIVAT = 'x-vs-x/mosaik3lab';
export const OEFFENTLICH = 'x-vs-x/mosaik3lab-pakete';
export const SYSTEME = ['windows-x64.zip', 'linux-x64.tar.gz', 'linux-arm64.tar.gz'];
const GH = ['gh', 'C:\\Program Files\\GitHub CLI\\gh.exe'].find((g) => {
  try {
    execFileSync(g, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});
const fail = (msg) => {
  console.error(`✘ ${msg}`);
  process.exit(1);
};
if (!GH) fail('GitHub CLI (gh) nicht gefunden.');
const gh = (...args) => execFileSync(GH, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ghJson = (...args) => JSON.parse(gh(...args));

/** Abschnitt einer Version aus CHANGELOG.md (ohne Überschrift); leer, wenn es ihn nicht gibt. */
export function changelogAbschnitt(text, version) {
  const start = text.indexOf(`## [${version}]`);
  if (start < 0) return '';
  const body = text.indexOf('\n', start) + 1;
  const end = text.indexOf('\n## [', body);
  return text.slice(body, end < 0 ? undefined : end).trim();
}

const version = process.argv[2] ?? JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`„${version}“ ist keine freigegebene Versionsnummer (z. B. 1.2.0).`);
const tag = `v${version}`;
const step = (t) => console.log(`• ${t}`);

// 1. Tag auf GitHub
step(`Tag ${tag} auf GitHub`);
try {
  gh('api', `repos/${PRIVAT}/git/ref/tags/${tag}`);
} catch {
  fail(`Das Tag ${tag} gibt es auf GitHub nicht. Zuerst: npm run release … und git push origin main --follow-tags`);
}

// 2. Installer-Test für dieses Tag: auf allen Systemen bestanden
step('Installer-Test für dieses Tag');
const runs = ghJson('run', 'list', '--repo', PRIVAT, '--workflow', 'installer-test.yml', '--branch', tag, '--event', 'push', '--limit', '5', '--json', 'conclusion,status,databaseId');
const lauf = runs.find((r) => r.status === 'completed');
if (!lauf) fail(`Für ${tag} ist der Installer-Test noch nicht fertig (oder lief nicht). Bitte warten und erneut versuchen.`);
if (lauf.conclusion !== 'success') fail(`Der Installer-Test für ${tag} ist nicht bestanden (${lauf.conclusion}). So wird nichts veröffentlicht.`);
const jobs = ghJson('run', 'view', String(lauf.databaseId), '--repo', PRIVAT, '--json', 'jobs').jobs;
// Je System gibt es einen Release-Job, der nur läuft, wenn ALLE Testrunden dieses Systems bestanden haben
// (Runden laufen parallel: „windows (neu)“, „linux-x64 / test (altformat)“ …) – genau diese drei müssen grün sein.
for (const name of ['windows-release', 'linux-x64 / release', 'linux-arm64 / release']) {
  if (jobs.find((j) => j.name === name)?.conclusion !== 'success') fail(`Im Installer-Test für ${tag} ist „${name}“ nicht bestanden – es wird nichts veröffentlicht.`);
}
const kaputt = jobs.filter((j) => !['success', 'skipped'].includes(j.conclusion)).map((j) => j.name);
if (kaputt.length) fail(`Im Installer-Test für ${tag} sind nicht alle Läufe grün (${kaputt.join(', ')}) – es wird nichts veröffentlicht.`);

// 3. Privates Release: freigegeben, alle drei Pakete mit genau dieser Version
step(`Release ${tag} mit allen drei Paketen`);
let rel;
try {
  rel = ghJson('release', 'view', tag, '--repo', PRIVAT, '--json', 'isPrerelease,isDraft,assets');
} catch {
  fail(`Das Release ${tag} fehlt (wird vom Installer-Test angelegt).`);
}
if (rel.isPrerelease || rel.isDraft) fail(`Das Release ${tag} ist eine Vorabversion oder ein Entwurf – es wird nichts veröffentlicht.`);
const namen = SYSTEME.map((s) => `Mosaik3LAB-Installer-${version}-${s}`);
const fehlt = namen.filter((n) => !rel.assets.some((a) => a.name === n));
if (fehlt.length) fail(`Im Release ${tag} fehlt: ${fehlt.join(', ')}`);

// 4. Öffentlich noch nicht vorhanden
step(`${OEFFENTLICH}: ${tag} noch nicht veröffentlicht`);
let schonDa = true;
try {
  gh('release', 'view', tag, '--repo', OEFFENTLICH, '--json', 'tagName');
} catch {
  schonDa = false;
}
if (schonDa) fail(`${tag} ist bereits veröffentlicht (${OEFFENTLICH}).`);

// 5. Herunterladen, Prüfsummen, Änderungen
const notes = changelogAbschnitt(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'), version);
if (!notes) fail(`In CHANGELOG.md fehlt der Abschnitt „## [${version}]“.`);
const dir = path.join(ROOT, '..', '_pakete', `.veroeffentlichen-${tag}`);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
step('Pakete herunterladen und Prüfsummen bilden');
gh('release', 'download', tag, '--repo', PRIVAT, '--dir', dir, ...namen.flatMap((n) => ['--pattern', n]));
const sums = namen.map((n) => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, n))).digest('hex')}  ${n}`).join('\n') + '\n';
fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), sums);
fs.writeFileSync(path.join(dir, 'notes.md'), notes + '\n');

// 6. Veröffentlichen
step(`veröffentlichen: ${OEFFENTLICH} → ${tag}`);
gh('release', 'create', tag, '--repo', OEFFENTLICH, '--title', `Mosaik³LAB ${version}`, '--notes-file', path.join(dir, 'notes.md'), '--latest', ...namen.map((n) => path.join(dir, n)), path.join(dir, 'SHA256SUMS.txt'));
fs.rmSync(dir, { recursive: true, force: true });
console.log(`✔ Version ${version} ist veröffentlicht: https://github.com/${OEFFENTLICH}/releases/tag/${tag}`);
console.log('  Die Server-Manager zeigen das Update innerhalb eines Tages an (oder sofort über „Nach Updates suchen“).');
