// Updates aus dem öffentlichen Paket-Repository (nur freigegebene, auf allen Systemen getestete Versionen – siehe
// scripts/veroeffentlichen.mjs). Der Server-Manager fragt hier nach, lädt das Paket für sein System herunter und prüft
// es gegen SHA256SUMS.txt. Installiert wird vom Update-Helfer (runners/aktualisieren.mjs, mit Adminrechten), der das
// Paket noch einmal selbst gegen die offizielle Prüfsumme prüft.
// Quelle überschreibbar (Tests): MOSAIK3LAB_PAKETQUELLE=<URL der Release-Liste im Format der GitHub-API>
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { compareVersions, parseVersion } from './paketupdate.mjs';
import { sha256Datei as sha256File } from './hilfen.mjs';

export { sha256File };

export const QUELLE = process.env.MOSAIK3LAB_PAKETQUELLE || 'https://api.github.com/repos/x-vs-x/mosaik3lab-pakete/releases?per_page=50';
const HEADERS = { Accept: 'application/vnd.github+json', 'User-Agent': 'Mosaik3LAB-Server-Manager' };

/** Paketendung für dieses System – null, wenn es dafür keine Pakete gibt (dann wird kein Update angeboten). */
export function systemPaket(plat = process.platform, arch = process.arch) {
  if (plat === 'win32' && arch === 'x64') return 'windows-x64.zip';
  if (plat === 'linux' && (arch === 'x64' || arch === 'arm64')) return `linux-${arch}.tar.gz`;
  return null;
}

/** So lange darf ein Download ohne Antwort bzw. ohne neue Daten sein, bevor er abgebrochen wird. */
export const STILL_MS = 90_000;

const fehler = (text, hint) => Object.assign(new Error(text), { hint, friendly: true });

/** Release-Liste holen (offizielle Quelle). Offline/Fehler → verständliche Meldung. */
export async function releases(fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(QUELLE, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
  } catch {
    throw fehler('Keine Verbindung zum Update-Server – der Server hat vermutlich keinen Internetzugang.', 'Updates gehen weiterhin per Paket (USB-Stick). Später erneut „Nach Updates suchen“.');
  }
  if (res.status === 403 || res.status === 429) throw fehler('Der Update-Server bittet kurz um Pause (zu viele Anfragen).', 'In einer Stunde erneut versuchen.');
  if (!res.ok) throw fehler(`Der Update-Server antwortet nicht wie erwartet (Fehler ${res.status}).`, 'Später erneut versuchen.');
  return res.json();
}

/**
 * Freigegebene Versionen für dieses System, neuer als die installierte – älteste zuerst.
 * → { installed, system, versions: [{ version, date, notes, asset: { name, url, size }, sums }], latest }
 */
export function newerVersions(list, installed, system = systemPaket()) {
  const versions = [];
  for (const r of Array.isArray(list) ? list : []) {
    if (r.draft || r.prerelease) continue; // nur freigegebene Versionen
    const version = String(r.tag_name ?? '').replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
    const asset = (r.assets ?? []).find((a) => a.name === `Mosaik3LAB-Installer-${version}-${system}`);
    const sums = (r.assets ?? []).find((a) => a.name === 'SHA256SUMS.txt');
    if (!asset || !sums) continue; // ohne Paket für dieses System oder ohne Prüfsumme: nicht anbieten
    if (installed && compareVersions(version, installed) !== 1) continue;
    versions.push({ version, date: (r.published_at ?? '').slice(0, 10), notes: String(r.body ?? '').trim(), asset: { name: asset.name, url: asset.browser_download_url, size: asset.size }, sums: sums.browser_download_url });
  }
  versions.sort((a, b) => compareVersions(a.version, b.version));
  return { installed, system, versions, latest: versions.at(-1) ?? null };
}

/** Prüfen: gibt es eine neuere freigegebene Version? */
export async function checkPakete(installed, { fetchImpl = fetch, system = systemPaket() } = {}) {
  if (!system) return { installed, system: null, versions: [], latest: null, unsupported: true };
  return newerVersions(await releases(fetchImpl), parseVersion(installed)?.join('.') ?? null, system);
}

/** Offizielle Prüfsumme eines Pakets aus SHA256SUMS.txt. */
export async function officialSum(sumsUrl, name, fetchImpl = fetch) {
  const res = await fetchImpl(sumsUrl, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw fehler('Die Prüfsummen-Datei des Updates ist nicht erreichbar.', 'Später erneut versuchen.');
  const line = (await res.text()).split(/\r?\n/).find((l) => l.trim().endsWith(`  ${name}`));
  const sum = line?.trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/.test(sum ?? '')) throw fehler('Für dieses Paket gibt es keine gültige Prüfsumme – Update abgebrochen.');
  return sum;
}


/** Paket herunterladen (in dir) und gegen die offizielle Prüfsumme prüfen. → Pfad der Datei. */
export async function downloadPaket(v, dir, { fetchImpl = fetch, onProgress, stillMs = STILL_MS } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, v.asset.name);
  const part = `${file}.teil`;
  // Wächter: Kommt so lange gar nichts (keine Antwort, keine Daten), wird abgebrochen – statt bis zu 30 Minuten
  // „wird heruntergeladen …“ ohne Fortschritt (so geschehen bei 1.5.0 → 1.6.0). Gesamtlimit bleibt 30 Minuten.
  const ctrl = new AbortController();
  let still = null;
  const wache = () => {
    clearTimeout(still);
    still = setTimeout(() => ctrl.abort(new Error('still')), stillMs);
  };
  const signal = AbortSignal.any([ctrl.signal, AbortSignal.timeout(30 * 60_000)]);
  const haengt = () =>
    fehler(
      `Der Download kommt nicht voran (seit ${Math.round(stillMs / 1000)} Sekunden keine Daten) – es wurde nichts verändert.`,
      'Erneut „Jetzt aktualisieren“ wählen. Klappt es wieder nicht: Internetzugang des Servers prüfen oder das Paket per USB-Stick installieren.',
    );
  wache();
  try {
    let res;
    try {
      res = await fetchImpl(v.asset.url, { headers: { 'User-Agent': HEADERS['User-Agent'] }, signal });
    } catch (err) {
      if (ctrl.signal.aborted) throw haengt();
      throw fehler(`Das Update ließ sich nicht herunterladen (${err.cause?.code ?? err.name}).`, 'Internetverbindung prüfen und erneut versuchen.');
    }
    if (!res.ok || !res.body) throw fehler(`Das Update ließ sich nicht herunterladen (Fehler ${res.status}).`, 'Internetverbindung prüfen und erneut versuchen.');
    let done = 0;
    const body = Readable.fromWeb(res.body);
    body.on('data', (c) => {
      wache();
      onProgress?.((done += c.length), v.asset.size);
    });
    try {
      await pipeline(body, fs.createWriteStream(part), { signal });
    } catch (err) {
      fs.rmSync(part, { force: true });
      if (ctrl.signal.aborted) throw haengt();
      throw err.friendly ? err : fehler('Der Download wurde unterbrochen – es wurde nichts verändert.', 'Erneut „Jetzt aktualisieren“ wählen.');
    }
  } finally {
    clearTimeout(still);
  }
  const want = await officialSum(v.sums, v.asset.name, fetchImpl);
  if ((await sha256File(part)) !== want) {
    fs.rmSync(part, { force: true });
    throw fehler('Das heruntergeladene Update ist beschädigt (Prüfsumme stimmt nicht) – es wurde nichts verändert.', 'Erneut versuchen; tritt es wieder auf, das Paket per USB-Stick installieren.');
  }
  fs.renameSync(part, file);
  return file;
}
