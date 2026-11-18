// Wann die Bildpflege pausiert: während eines Imports (in dieser App) und während einer Sicherung des Server-Managers.
// Der Server-Manager legt dafür <ablage>/.sicherung.lock an ("<PID> <Systemstart>", wie die Sperrdatei der App;
// manager/lib/backup.mjs). Eine verwaiste Datei (Prozess beendet, Rechner neu gestartet) zählt nicht.
import fs from 'node:fs';
import path from 'node:path';
import { lockHolder } from '../lock';

export const SICHERUNG_MARKER = '.sicherung.lock';

let importe = 0;

/** Import beginnt → Funktion zum Beenden (mehrfach aufrufbar). */
export function importLaeuft(): () => void {
  importe++;
  let fertig = false;
  return () => {
    if (fertig) return;
    fertig = true;
    importe--;
  };
}

/** null = frei, sonst der Grund für die Pause. */
export function bildpflegeWartetAuf(ablageRoot: string): string | null {
  if (importe > 0) return 'Import';
  try {
    if (lockHolder(fs.readFileSync(path.join(ablageRoot, SICHERUNG_MARKER), 'utf8'))) return 'Sicherung';
  } catch {
    /* keine Sicherung */
  }
  return null;
}
