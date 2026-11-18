// Wann die Bildpflege pausiert: während eines Imports oder Exports (in dieser App) und während einer Sicherung des
// Server-Managers. Solange ersetzt auch die Verarbeitung „sofort“ (Hochladen, Abruf) keine Originale, sondern erzeugt nur
// Vorschaubilder – sonst verschwinden Dateien, die der Export oder die Sicherung gerade liest.
// Der Server-Manager legt dafür <ablage>/.sicherung.lock an ("<PID> <Systemstart>", wie die Sperrdatei der App;
// manager/lib/backup.mjs). Eine verwaiste Datei (Prozess beendet, Rechner neu gestartet, älter als 6 Stunden) zählt nicht.
import fs from 'node:fs';
import path from 'node:path';
import { lockHolder } from '../lock';

export const SICHERUNG_MARKER = '.sicherung.lock';
/** Eine Sicherung dauert nie so lange – ältere Markierungen stammen von einem hängengebliebenen Prozess. */
export const SICHERUNG_VERFALL_MS = 6 * 3600_000;

let austausche = 0;

/** Import oder Export beginnt → Funktion zum Beenden (mehrfach aufrufbar). */
export function austauschLaeuft(): () => void {
  austausche++;
  let fertig = false;
  return () => {
    if (fertig) return;
    fertig = true;
    austausche--;
  };
}

/** null = frei, sonst der Grund für die Pause. */
export function bildpflegeWartetAuf(ablageRoot: string): 'Austausch' | 'Sicherung' | null {
  if (austausche > 0) return 'Austausch';
  try {
    const datei = path.join(ablageRoot, SICHERUNG_MARKER);
    if (Date.now() - fs.statSync(datei).mtimeMs < SICHERUNG_VERFALL_MS && lockHolder(fs.readFileSync(datei, 'utf8'))) return 'Sicherung';
  } catch {
    /* keine Sicherung */
  }
  return null;
}
