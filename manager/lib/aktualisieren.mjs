// Update-Helfer: installiert ein vom Server-Manager heruntergeladenes Paket – mit Adminrechten (Windows: Konto System,
// Linux: root), deshalb streng begrenzt. Ablauf und Sicherheiten:
//   1. Auftrag lesen (<Datenwurzel>/updates/auftrag.json, schreibt der Manager) und sofort entfernen (kein Endlos-Lauf).
//      Alles aus dem Auftrag gilt als fremd und wird geprüft (Versionsnummer, Dateiname).
//   2. Selbst prüfen: Paket in einen nur für den Helfer beschreibbaren Ordner kopieren, Prüfsumme der Kopie = offizielle
//      Prüfsumme (SHA256SUMS.txt der Veröffentlichung, selbst geholt – dem Manager wird nicht vertraut), Version neuer.
//   3. Installieren mit dem Ablauf des Pakets selbst (manager/cli.mjs setup – wie Installieren.cmd): Sicherung, Umschalten,
//      Health-Check, bei Fehler automatisch zurück auf die bisherige Version (inkl. Datenbank aus der Sicherung).
//   4. Wächter: dauert die Installation länger als SETUP_MAX_MS (3 Stunden, lib/zeitlimits.mjs – länger als die Sicherung
//      vor dem Update darf), wird sie (samt Unterprozessen) abgebrochen und der alte Stand wiederhergestellt.
//   5. Notfall: Beim Hochfahren (der Helfer startet dann einmal) wird ein unterbrochenes Update erkannt (Status „läuft“).
//      Antwortet die App nicht, wird auf die bisherige Version zurückgeschaltet.
// Der Status (auch „vorige Version“ für den Rückfall) steht in ctx.statusFile im Programmordner – nur der Helfer schreibt
// dort, der Manager liest nur. So kann ein übernommener Manager weder Status noch Rückfall-Ziel fälschen.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { compareVersions, refuseOlderVersion } from './paketupdate.mjs';
import { SETUP_MAX_MS } from './zeitlimits.mjs';

export const MAX_DAUER_MS = SETUP_MAX_MS;
export const updatesDir = (dataRoot) => path.join(dataRoot, 'updates');
/** Status des Helfers – im Programmordner (nur Admin/root schreibbar, für den Manager lesbar). */
export const statusDatei = (programRoot) => path.join(programRoot, 'update-status.json');
const VERSION = /^\d+\.\d+\.\d+$/;

const lesen = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * Ein Durchlauf des Helfers. ctx = {
 *   dir,                         updates-Ordner (Manager schreibt Paket + Auftrag)
 *   sicherDir,                   Arbeitsordner nur für den Helfer (Programmordner, nicht für den Manager beschreibbar)
 *   statusFile,                  Status des Helfers (Programmordner, nur Helfer schreibt)
 *   installed(): { id, version } installierte Programmversion
 *   official(version, name): Promise<sha256>   offizielle Prüfsumme (aus der Veröffentlichung)
 *   sha256(file): Promise<string>
 *   extract(file, dest): Promise<string>       Paket entpacken → Ordner mit manager/cli.mjs
 *   runSetup(pkgDir, onLine, timeoutMs): Promise<{ code, timedOut }>
 *   healthy(waitMs): Promise<boolean>
 *   recover(status): Promise<string>           zurück auf status.previous (Dienste, „current“, ggf. Datenbank) → Text
 *   schemaNow(): Promise<number|null>
 *   log(text)
 * } → Ergebnis-Status
 */
export async function durchlauf(ctx) {
  const auftragFile = path.join(ctx.dir, 'auftrag.json');
  const save = (s) => {
    fs.mkdirSync(path.dirname(ctx.statusFile), { recursive: true });
    fs.writeFileSync(ctx.statusFile, JSON.stringify({ ...s, at: new Date().toISOString() }, null, 1));
    return s;
  };
  // Zurücksetzen darf den Helfer nie mitten im Satz abbrechen lassen (sonst bliebe alles gestoppt)
  const zurueck = async (status) => {
    try {
      return await ctx.recover(status);
    } catch (err) {
      ctx.log(`Zurücksetzen fehlgeschlagen: ${err.stack ?? err.message}`);
      return 'Das automatische Zurücksetzen ist nicht vollständig gelungen – bitte die IT benachrichtigen (Protokoll „Update-Helfer“).';
    }
  };
  const alt = lesen(ctx.statusFile);
  const auftrag = lesen(auftragFile);
  fs.rmSync(auftragFile, { force: true }); // nie zweimal (auch nicht nach Absturz beim Hochfahren)

  // Notfall: voriger Lauf wurde unterbrochen (Stromausfall, Neustart, abgestürzt)
  if (alt?.phase === 'läuft' && !auftrag) {
    ctx.log(`Unterbrochenes Update auf ${alt.version} erkannt – prüfe, ob Mosaik³LAB läuft.`);
    if (await ctx.healthy(180_000)) {
      const jetzt = ctx.installed();
      const neu = jetzt?.id !== alt.previous;
      return save({ ...alt, phase: neu ? 'fertig' : 'zurueckgesetzt', meldung: neu ? `Version ${jetzt?.version ?? alt.version} ist installiert und läuft.` : `Das Update auf Version ${alt.version} wurde unterbrochen. Die bisherige Version ${jetzt?.version ?? ''} läuft weiter, Ihre Daten sind unverändert.` });
    }
    const text = await zurueck(alt);
    return save({ ...alt, phase: 'zurueckgesetzt', meldung: `Das Update auf Version ${alt.version} wurde unterbrochen. ${text}` });
  }
  if (!auftrag) return alt; // nichts zu tun (normaler Start beim Hochfahren)

  // Auftrag ist fremd: erst prüfen, dann verwenden (auch nicht ungeprüft in Meldungen oder Protokoll)
  const vorher = ctx.installed();
  if (!VERSION.test(String(auftrag.version))) return save({ phase: 'fehler', version: null, von: vorher?.version ?? null, meldung: 'Ungültiger Update-Auftrag – es wurde nichts verändert.' });
  const status = { phase: 'läuft', version: auftrag.version, von: vorher?.version ?? null, previous: vorher?.id ?? null, schemaBefore: await ctx.schemaNow(), started: new Date().toISOString(), schritte: [], meldung: 'Update wird geprüft …' };
  save(status);
  const fail = (meldung, hint) => save({ ...status, phase: 'fehler', meldung, hint });
  try {
    // 2. selbst prüfen
    const file = path.resolve(ctx.dir, path.basename(String(auftrag.file ?? '')));
    if (!auftrag.file || path.dirname(file) !== path.resolve(ctx.dir) || !fs.existsSync(file)) return fail('Das Update-Paket fehlt – es wurde nichts verändert.', 'Im Server-Manager erneut „Jetzt aktualisieren“ wählen.');
    try {
      refuseOlderVersion(vorher?.version ?? null, auftrag.version);
    } catch (err) {
      return fail(err.message, err.hint);
    }
    if (compareVersions(auftrag.version, vorher?.version) === 0) return fail(`Version ${auftrag.version} ist bereits installiert.`);
    // Sicherheit: Der updates-Ordner ist für den Manager (eingeschränktes Konto) beschreibbar. Damit niemand das Paket
    // zwischen Prüfen und Installieren austauschen kann, wird es zuerst in einen Ordner kopiert, in den nur der Helfer
    // schreiben darf (ctx.sicherDir, im Programmordner) – geprüft, entpackt und installiert wird nur diese Kopie.
    fs.rmSync(ctx.sicherDir, { recursive: true, force: true });
    fs.mkdirSync(ctx.sicherDir, { recursive: true, mode: 0o700 });
    const kopie = path.join(ctx.sicherDir, path.basename(file));
    fs.copyFileSync(file, kopie);
    const want = await ctx.official(auftrag.version, path.basename(file));
    if ((await ctx.sha256(kopie)) !== want) return fail('Das Update-Paket stimmt nicht mit der offiziellen Veröffentlichung überein – es wurde nichts verändert.', 'Erneut herunterladen lassen; sonst das Paket per USB-Stick installieren.');
    // 3. installieren
    save({ ...status, meldung: 'Update wird installiert – Mosaik³LAB ist gleich für einige Minuten nicht erreichbar …' });
    const pkgDir = await ctx.extract(kopie, path.join(ctx.sicherDir, 'entpackt'));
    const r = await ctx.runSetup(pkgDir, (line) => {
      status.schritte.push(line);
      save(status);
    }, MAX_DAUER_MS);
    if (r.timedOut) {
      const text = await zurueck(status);
      return save({ ...status, phase: 'zurueckgesetzt', meldung: `Das Update auf Version ${auftrag.version} hat zu lange gedauert und wurde abgebrochen. ${text}` });
    }
    if (r.code === 0 && (await ctx.healthy(120_000))) return save({ ...status, phase: 'fertig', meldung: `Version ${auftrag.version} ist installiert und läuft.` });
    // Fehlschlag oder langsamer Start: was läuft jetzt wirklich? (Der Ablauf des Pakets schaltet bei Fehlern selbst zurück.)
    if (await ctx.healthy(60_000)) {
      const now = ctx.installed();
      if (now?.version === auftrag.version && now?.id !== status.previous) return save({ ...status, phase: 'fertig', meldung: `Version ${auftrag.version} ist installiert und läuft.` });
      return save({ ...status, phase: 'zurueckgesetzt', meldung: `Das Update auf Version ${auftrag.version} hat nicht geklappt. Die bisherige Version ${now?.version ?? status.von} läuft wieder, Ihre Daten sind unverändert.` });
    }
    const text = await zurueck(status);
    return save({ ...status, phase: 'zurueckgesetzt', meldung: `Das Update auf Version ${auftrag.version} hat nicht geklappt. ${text}` });
  } catch (err) {
    ctx.log(`Update-Helfer: ${err.stack ?? err.message}`);
    const text = (await ctx.healthy(60_000)) ? `Die bisherige Version läuft weiter.` : await zurueck(status);
    // Für Admins ein klarer Satz – technische Einzelheiten stehen im Protokoll
    const grund = err.friendly ? ` ${err.message}` : '';
    return save({ ...status, phase: 'fehler', meldung: `Das Update auf Version ${auftrag.version} ist fehlgeschlagen.${grund} ${text}`, hint: 'Einzelheiten stehen im Protokoll „Update-Helfer“. Das Paket kann auch per USB-Stick installiert werden.' });
  } finally {
    fs.rmSync(ctx.sicherDir, { recursive: true, force: true }); // geschützte Kopie und Entpacktes – auch wenn schon das Entpacken scheiterte
    for (const f of fs.readdirSync(ctx.dir)) if (f.startsWith('Mosaik3LAB-Installer-')) fs.rmSync(path.join(ctx.dir, f), { force: true });
  }
}

/**
 * Setup des entpackten Pakets ausführen (wie Installieren.cmd /still) – Zeilen an onLine, nach timeoutMs abbrechen.
 * killTree(pid): beendet den ganzen Prozessbaum (Setup startet z. B. Sicherung und PowerShell als Unterprozesse).
 */
export function runPackageSetup(pkgDir, onLine, timeoutMs, killTree = null) {
  const node = path.join(pkgDir, 'node', process.platform === 'win32' ? 'node.exe' : 'node');
  const env = { ...process.env };
  for (const k of ['MANAGER_CONFIG', 'MOSAIK3LAB_SERVICE', 'NODE_ENV']) delete env[k];
  env.MOSAIK3LAB_UPDATE_HELFER = '1'; // Setup weiß: Update per Knopfdruck (Verknüpfungen und Helfer-Dienst nicht anfassen)
  return new Promise((resolve) => {
    const child = spawn(fs.existsSync(node) ? node : process.execPath, [path.join(pkgDir, 'manager', 'cli.mjs'), 'setup', '--config', path.join(pkgDir, 'Installieren.json')], { cwd: pkgDir, env, windowsHide: true, detached: process.platform !== 'win32' });
    let rest = '';
    const take = (chunk) => {
      const lines = (rest + chunk.toString('utf8')).split(/\r?\n/);
      rest = lines.pop();
      for (const l of lines) if (l.trim()) onLine(l.trim());
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (killTree) Promise.resolve(killTree(child.pid)).catch(() => child.kill());
      else child.kill();
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (rest.trim()) onLine(rest.trim());
      resolve({ code: code ?? 1, timedOut });
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: 1, timedOut: false });
    });
  });
}
