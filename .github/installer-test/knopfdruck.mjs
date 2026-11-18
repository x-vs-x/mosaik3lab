// Installer-Test: „Update per Knopfdruck“ Ende zu Ende auf dem Runner (Windows als Administrator, Linux mit sudo).
// Baut aus dem getesteten Paket eine höhere Version (Patch +1), stellt sie über eine Test-Paketquelle bereit (Format der
// GitHub-API, mit SHA256SUMS.txt) und drückt „Jetzt aktualisieren“ mit dem Code des installierten Server-Managers
// (knopf-manager.mjs: suchen, herunterladen, prüfen, Helfer starten). Erwartet: Status „fertig“, neue Version aktiv,
// Dateien aufgeräumt. Daten prüft danach pruefen.* erhalten.
//   node knopfdruck.mjs <entpacktes Paket (v1)> <Programmordner>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';

const [paketDir, programm] = process.argv.slice(2);
const WIN = process.platform === 'win32';
const fail = (t) => {
  console.log(`FEHLER ${t}`);
  process.exit(1);
};
const install = JSON.parse(fs.readFileSync(path.join(programm, 'install.json'), 'utf8'));
const current = fs.realpathSync(path.join(programm, 'current'));
const vorher = JSON.parse(fs.readFileSync(path.join(current, 'package.json'), 'utf8')).version;
const [a, b, c] = vorher.split('.').map(Number);
const neu = `${a}.${b}.${c + 1}`;
const system = WIN ? 'windows-x64.zip' : `linux-${process.arch}.tar.gz`;
const name = `Mosaik3LAB-Installer-${neu}-${system}`;
console.log(`Update per Knopfdruck: ${vorher} → ${neu} (${system})`);

// 1. Paket der neuen Version bauen (Inhalt = getestetes Paket, nur Versionsnummer höher)
const bau = fs.mkdtempSync(path.join(os.tmpdir(), 'knopfdruck-'));
const ordner = path.join(bau, name.replace(/\.(zip|tar\.gz)$/, ''));
fs.cpSync(paketDir, ordner, { recursive: true });
for (const f of ['package.json', 'paket.json']) {
  const p = path.join(ordner, f);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.version = neu;
  if (f === 'paket.json') j.commit = `${j.commit}k`;
  fs.writeFileSync(p, JSON.stringify(j, null, 2));
}
const quelle = path.join(bau, 'quelle');
fs.mkdirSync(quelle);
const archiv = path.join(quelle, name);
const tar = WIN ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
const r = WIN ? spawnSync(tar, ['-a', '-c', '-f', archiv, '-C', ordner, ...fs.readdirSync(ordner)], { stdio: 'inherit' }) : spawnSync(tar, ['czf', archiv, '-C', bau, path.basename(ordner)], { stdio: 'inherit' });
if (r.status !== 0) fail('Testpaket ließ sich nicht packen');
const sum = crypto.createHash('sha256').update(fs.readFileSync(archiv)).digest('hex');
fs.writeFileSync(path.join(quelle, 'SHA256SUMS.txt'), `${sum}  ${name}\n`);

// 2. Test-Paketquelle (nur 127.0.0.1)
const server = http.createServer((q, s) => {
  const f = path.join(quelle, path.basename(decodeURIComponent(new URL(q.url, 'http://x').pathname)));
  if (q.url.startsWith('/releases')) {
    const base = `http://127.0.0.1:${server.address().port}`;
    s.setHeader('Content-Type', 'application/json');
    return s.end(JSON.stringify([{ tag_name: `v${neu}`, draft: false, prerelease: false, published_at: new Date().toISOString(), body: 'Testversion', assets: [{ name, size: fs.statSync(archiv).size, browser_download_url: `${base}/${name}` }, { name: 'SHA256SUMS.txt', browser_download_url: `${base}/SHA256SUMS.txt` }] }]));
  }
  if (!fs.existsSync(f)) return (s.statusCode = 404), s.end();
  fs.createReadStream(f).pipe(s);
});
await new Promise((res) => server.listen(0, '127.0.0.1', res));
const url = `http://127.0.0.1:${server.address().port}/releases`;

// 3. Update-Helfer bekommt die Test-Paketquelle über seine Umgebung (Linux: systemctl set-environment, Windows:
//    WinSW-Konfiguration) – er prüft das Paket selbst noch einmal gegen die Prüfsumme.
const updates = path.join(install.dataRoot, 'updates');
const ID = 'mosaik3lab-updater';
const statusDatei = path.join(programm, 'update-status.json'); // schreibt nur der Helfer (Programmordner)
const start = Date.now();
const xml = path.join(programm, 'dienste', `${ID}.xml`);
if (WIN) fs.writeFileSync(xml, fs.readFileSync(xml, 'utf8').replace('</service>', `  <env name="MOSAIK3LAB_PAKETQUELLE" value="${url}"/>
</service>`));
else spawnSync('systemctl', ['set-environment', `MOSAIK3LAB_PAKETQUELLE=${url}`], { stdio: 'inherit' });

// 4. „Jetzt aktualisieren“ mit dem Code des installierten Server-Managers (suchen, herunterladen, prüfen, Auftrag, Helfer
//    über die Dienststeuerung starten). Linux: als Dienstbenutzer mosaik3lab – prüft auch die polkit-Freigabe.
//    Die Test-Paketquelle in diesem Prozess antwortet dabei weiter (darum asynchron starten).
const skript = path.join(os.tmpdir(), 'mosaik3lab-knopf-manager.mjs');
fs.copyFileSync(path.join(import.meta.dirname, 'knopf-manager.mjs'), skript);
fs.chmodSync(skript, 0o644);
const env = { ...process.env, MOSAIK3LAB_PAKETQUELLE: url };
// mit dem Node der Installation (wie der Manager-Dienst)
const node = path.join(programm, 'current', 'node', WIN ? 'node.exe' : 'node');
const [cmd, args] = WIN ? [node, [skript, programm, neu]] : ['runuser', ['-u', 'mosaik3lab', '--', 'env', `MOSAIK3LAB_PAKETQUELLE=${url}`, node, skript, programm, neu]];
const m = await new Promise((res) => spawn(cmd, args, { stdio: 'inherit', env }).on('close', (status) => res({ status })));
if (m.status !== 0) fail('„Jetzt aktualisieren“ im Server-Manager hat nicht geklappt');
const dienstLaeuft = () =>
  WIN
    ? /RUNNING|START_PENDING|STOP_PENDING/.test(spawnSync('sc.exe', ['query', ID], { encoding: 'utf8' }).stdout)
    : /^(active|activating|deactivating|reloading)/.test(spawnSync('systemctl', ['is-active', ID], { encoding: 'utf8' }).stdout.trim());
// warten, bis der Helfer fertig ist (Status abgeschlossen und Dienst beendet)
const ende = Date.now() + 10 * 60_000; // dauert sonst unter einer Minute – darüber hängt etwas (Zeitlimit des Schritts: 12 Minuten)
for (;;) {
  await new Promise((res) => setTimeout(res, 3000));
  let st = null;
  try {
    st = JSON.parse(fs.readFileSync(statusDatei, 'utf8'));
  } catch {
    /* noch kein Status */
  }
  const fertig = st && ['fertig', 'zurueckgesetzt', 'fehler'].includes(st.phase) && Date.parse(st.at) > start;
  if (fertig && !dienstLaeuft()) break;
  if (Date.now() > ende) {
    console.log(`Letzter Status des Helfers: ${JSON.stringify(st, null, 1)}`);
    fail('Update-Helfer ist nach 10 Minuten nicht fertig');
  }
}
if (WIN) {
  // Konfiguration ohne Test-Quelle
  const jetztXml = fs.readFileSync(xml, 'utf8');
  if (jetztXml.includes('MOSAIK3LAB_PAKETQUELLE')) fs.writeFileSync(xml, jetztXml.replace(/\s*<env name="MOSAIK3LAB_PAKETQUELLE"[^>]*\/>/, ''));
} else spawnSync('systemctl', ['unset-environment', 'MOSAIK3LAB_PAKETQUELLE'], { stdio: 'inherit' });
if (fs.existsSync(path.join(updates, 'status.json'))) fail('Status liegt im vom Manager beschreibbaren Ordner');
server.close();
const status = JSON.parse(fs.readFileSync(statusDatei, 'utf8'));
console.log(`Update-Helfer (Dienst) beendet: ${status.phase} – ${status.meldung}`);
for (const l of status.schritte ?? []) console.log(`  ${l}`);
const jetzt = JSON.parse(fs.readFileSync(path.join(fs.realpathSync(path.join(programm, 'current')), 'package.json'), 'utf8')).version;
if (status.phase !== 'fertig') fail(`Update per Knopfdruck nicht fertig (${status.phase})`);
if (jetzt !== neu) fail(`aktive Version ist ${jetzt}, erwartet ${neu}`);
if (fs.existsSync(path.join(updates, 'auftrag.json'))) fail('Auftrag wurde nicht entfernt');
if (fs.readdirSync(updates).some((f) => f.startsWith('Mosaik3LAB-Installer-'))) fail('Paket wurde nicht aufgeräumt');
if (fs.existsSync(path.join(programm, '.einrichtung.lock'))) fail('Sperre der Einrichtung blieb stehen');
if (fs.existsSync(path.join(programm, '.update'))) fail('geschützter Arbeitsordner .update blieb stehen');
console.log(`OK   Update per Knopfdruck: Version ${neu} aktiv, Auftrag, Paket und Sperre aufgeräumt`);
fs.rmSync(bau, { recursive: true, force: true });
