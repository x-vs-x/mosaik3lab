// Sperre gegen doppeltes Starten: Einrichtung/Update (Installieren.cmd, installieren.sh, Update-Helfer, Setup im Manager)
// läuft nie zweimal gleichzeitig. Sperrdatei <Programmordner>/.einrichtung.lock { pid, wer, seit }.
// Eine Sperre eines beendeten Prozesses (Absturz, Stromausfall), von vor dem letzten Hochfahren oder älter als 3 Stunden gilt
// als verwaist und wird übernommen.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { InputError } from './config.mjs';
import { lebt } from './hilfen.mjs';

const MAX_ALTER_MS = 3 * 3600_000;


/** Sperre nehmen → Funktion zum Freigeben (mehrfach aufrufbar). Läuft schon eine Einrichtung: klare Meldung. */
export function einrichtungSperren(programRoot, wer) {
  const file = path.join(programRoot, '.einrichtung.lock');
  fs.mkdirSync(programRoot, { recursive: true });
  for (let versuch = 0; versuch < 2; versuch++) {
    try {
      fs.writeFileSync(file, JSON.stringify({ pid: process.pid, wer, seit: new Date().toISOString() }), { flag: 'wx' });
      let frei = false;
      return () => {
        if (frei) return;
        frei = true;
        try {
          if (JSON.parse(fs.readFileSync(file, 'utf8')).pid === process.pid) fs.rmSync(file, { force: true });
        } catch {
          /* schon weg */
        }
      };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      let alt = null;
      try {
        alt = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        /* unlesbar → verwaist */
      }
      // Verwaist: Prozess weg, älter als 3 h oder aus der Zeit vor dem letzten Hochfahren (nach einem Neustart kann die
      // Prozessnummer längst neu vergeben sein – dann sähe die Sperre sonst noch „lebendig“ aus)
      const seit = Date.parse(alt?.seit ?? '');
      const hochgefahren = Date.now() - os.uptime() * 1000;
      const verwaist = !alt || !(seit > hochgefahren) || !lebt(alt.pid) || Date.now() - seit > MAX_ALTER_MS;
      if (!verwaist) {
        const seit = new Date(alt.seit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        throw new InputError(`Die Einrichtung läuft bereits (${alt.wer}, seit ${seit} Uhr). Bitte warten, bis sie fertig ist – nicht doppelt starten.`, 'Fortschritt im Server-Manager oder im ersten Fenster ansehen.');
      }
      fs.rmSync(file, { force: true });
    }
  }
  throw new InputError('Die Sperre für die Einrichtung ließ sich nicht setzen.', 'Programmordner prüfen und erneut versuchen.');
}
