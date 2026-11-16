// Updates im Server-Manager (Paket-Installationen): prüfen, herunterladen, Update-Helfer beauftragen, Fortschritt melden.
// Der Manager selbst hat keine Adminrechte – installiert wird vom Update-Helfer (runners/aktualisieren.mjs).
// Installationen aus einer Arbeitskopie (ohne paket.json) nutzen weiter das Git-Update (update.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { INSTALL, InputError, resolvePaths } from './config.mjs';
import { logger } from './log.mjs';
import { currentRelease } from './update.mjs';
import { checkPakete, downloadPaket } from './paketquelle.mjs';
import { updatesDir, statusDatei } from './aktualisieren.mjs';
import { platform } from '../platform/index.mjs';

const log = logger('update');
let pruefung = null; // { checkedAt, installed, versions, latest, error?, hint?, unsupported? }
let download = null; // { version, done, total, startedAt, fertig?, error?, hint? }
const WARTEN_MAX_MS = 10 * 60_000; // so lange darf der Helfer nach dem Start brauchen, bis er sich meldet

/** Installation aus einem Installer-Paket? (dann Updates aus der Paketquelle) */
export const istPaketInstallation = () => !!INSTALL && fs.existsSync(path.join(INSTALL.programRoot, 'current', 'paket.json'));

const installiert = () => {
  const r = INSTALL ? currentRelease(INSTALL.programRoot) : null;
  return r ? { id: r.id, version: r.version ?? r.id.split('-')[0] } : null;
};
const dir = () => updatesDir(INSTALL.dataRoot);
/** Status des Update-Helfers – schreibt nur der Helfer (Programmordner), der Manager liest nur. */
const helferStatus = () => {
  try {
    return JSON.parse(fs.readFileSync(statusDatei(INSTALL.programRoot), 'utf8'));
  } catch {
    return null;
  }
};
/**
 * Lauf für die Anzeige: Status des Helfers – oder „wartet“, solange das geprüfte Paket bereitliegt und der Helfer sich seit
 * dem Start noch nicht gemeldet hat. Meldet er sich zu lange nicht, ist das ein Fehler (statt endlos „wartet“).
 */
const lauf = () => {
  const h = helferStatus();
  if (!download?.fertig || download.error) return h;
  const neu = h && Date.parse(h.at) >= Date.parse(download.startedAt);
  if (neu) return h;
  if (Date.now() - Date.parse(download.fertigAt ?? download.startedAt) > WARTEN_MAX_MS) {
    download.error = 'Der Update-Helfer hat nicht reagiert – es wurde nichts verändert.';
    download.hint = 'Server neu starten und erneut „Jetzt aktualisieren“ wählen; sonst das Paket per USB-Stick installieren.';
    log.error('Update: der Update-Helfer hat sich nach dem Start nicht gemeldet.');
    return h;
  }
  return { phase: 'wartet', version: download.version, von: installiert()?.version ?? null, meldung: 'Update ist geprüft und wird gleich installiert …', at: download.fertigAt ?? download.startedAt };
};
/** Läuft gerade ein Update (Download, wartet auf den Helfer oder Helfer arbeitet)? */
const laeuftGerade = () => {
  const l = lauf();
  return l?.phase === 'läuft' || l?.phase === 'wartet' || (!!download && !download.error && !download.fertig);
};
const merkDatei = () => path.join(resolvePaths().logDir, 'update-pruefung.json');

/** Nach neueren freigegebenen Versionen suchen (täglich automatisch und auf Knopfdruck). Offline ist kein Fehler. */
export async function pruefen(opts = {}) {
  const installed = installiert();
  try {
    const r = await checkPakete(installed?.version, opts);
    pruefung = { checkedAt: new Date().toISOString(), installed, versions: r.versions.map(({ version, date, notes }) => ({ version, date, notes })), latest: r.latest, unsupported: !!r.unsupported };
  } catch (err) {
    // Für Admins immer ein verständlicher Satz – technische Einzelheiten nur ins Protokoll
    if (!err.friendly) log.warn(`Update-Prüfung: ${err.message}`);
    pruefung = { checkedAt: new Date().toISOString(), installed, versions: [], latest: null, error: err.friendly ? err.message : 'Die Update-Prüfung ist gerade nicht möglich.', hint: err.friendly ? err.hint : 'Später erneut „Nach Updates suchen“. Updates gehen weiterhin auch per Paket (USB-Stick).' };
  }
  try {
    fs.writeFileSync(merkDatei(), JSON.stringify(pruefung));
  } catch {
    /* nur gemerkt */
  }
  return zustand();
}

/** Alles für die Karte „Updates“ – verständlich aufbereitet. */
export function zustand() {
  if (!pruefung) {
    try {
      pruefung = JSON.parse(fs.readFileSync(merkDatei(), 'utf8'));
    } catch {
      /* noch nie geprüft */
    }
  }
  const installed = installiert();
  // Gemerkte Prüfung gilt nur für die Version, gegen die geprüft wurde (nach einem Update ist sie veraltet)
  const p = pruefung && pruefung.installed?.version === installed?.version ? pruefung : null;
  return {
    paket: istPaketInstallation(),
    installed,
    checkedAt: p?.checkedAt ?? null,
    error: p?.error ?? null,
    hint: p?.hint ?? null,
    unsupported: !!p?.unsupported,
    versions: p?.versions ?? [],
    behind: p?.versions?.length ?? 0,
    latest: p?.latest ? { version: p.latest.version, date: p.latest.date, size: p.latest.asset?.size ?? null } : null,
    download,
    lauf: lauf(),
  };
}

/** „Jetzt aktualisieren“: herunterladen + prüfen, Auftrag schreiben, Update-Helfer starten. Ein Klick, Rest läuft allein. */
export async function starten() {
  if (!istPaketInstallation()) throw new InputError('Updates per Knopfdruck gibt es für Installationen aus einem Installer-Paket.');
  if (laeuftGerade()) throw new InputError('Ein Update läuft bereits – bitte warten.');
  // nur eine Prüfung gegen die installierte Version zählt (nach einem Update ist die alte veraltet)
  const latest = zustand().latest ? pruefung.latest : null;
  if (!latest) throw new InputError('Es ist kein Update verfügbar.', 'Zuerst „Nach Updates suchen“.');
  const helfer = await platform.services.status('updater').catch(() => ({ installed: false }));
  if (!helfer.installed) throw new InputError('Für Updates per Knopfdruck fehlt der Update-Helfer (kommt mit Version 1.1.0).', 'Einmal das neue Paket per USB-Stick installieren (Installieren.cmd bzw. installieren.sh) – danach geht es hier.');
  download = { version: latest.version, done: 0, total: latest.asset?.size ?? null, startedAt: new Date().toISOString() }; // startedAt = Lauf-Kennung
  fs.mkdirSync(dir(), { recursive: true });
  // im Hintergrund: Herunterladen kann dauern, die Seite zeigt den Fortschritt
  (async () => {
    try {
      const file = await downloadPaket(latest, dir(), { onProgress: (done, total) => Object.assign(download, { done, total }) });
      fs.writeFileSync(path.join(dir(), 'auftrag.json'), JSON.stringify({ version: latest.version, file: path.basename(file), at: new Date().toISOString() }));
      // ab jetzt zeigt die Seite „wird gleich installiert“ (lauf()), bis sich der Helfer meldet
      download.fertigAt = new Date().toISOString();
      download.fertig = true;
      log.info(`Update ${latest.version} heruntergeladen und geprüft – Update-Helfer wird gestartet.`);
      if (!(await platform.services.control('updater', 'start'))) throw new Error('Der Update-Helfer ließ sich nicht starten.');
    } catch (err) {
      download.error = err.friendly ? err.message : 'Das Update konnte nicht gestartet werden – es wurde nichts verändert.';
      download.hint = err.friendly ? err.hint : 'Erneut „Jetzt aktualisieren“ versuchen; tritt es wieder auf, das Paket per USB-Stick installieren (Protokoll „Update“).';
      fs.rmSync(path.join(dir(), 'auftrag.json'), { force: true });
      for (const f of fs.readdirSync(dir())) if (f.startsWith('Mosaik3LAB-Installer-')) fs.rmSync(path.join(dir(), f), { force: true }); // nichts installiert
      log.error(`Update ${latest.version}: ${err.message}`);
    }
  })();
  return { started: true, version: latest.version };
}
