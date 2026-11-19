// Wann die Bildpflege pausiert: während eines Imports oder Exports (in dieser App) und während einer Sicherung des
// Server-Managers. Solange ersetzt auch die Verarbeitung „sofort“ (Hochladen, Abruf) keine Originale, sondern erzeugt nur
// Vorschaubilder – sonst verschwinden Dateien, die der Export oder die Sicherung gerade liest.
// Dasselbe gilt in der Schonfrist nach einer Datenbank-Migration (unten) – die merkt sich der BildDienst (dienst.ts).
// Der Server-Manager legt dafür <ablage>/.sicherung.lock an ("<PID> <Systemstart>", wie die Sperrdatei der App;
// manager/lib/backup.mjs). Eine verwaiste Datei (Prozess beendet, Rechner neu gestartet, älter als 6 Stunden) zählt nicht.
import fs from 'node:fs';
import path from 'node:path';
import { lockHolder } from '../lock';

export const SICHERUNG_MARKER = '.sicherung.lock';
/** Eine Sicherung dauert nie so lange – ältere Markierungen stammen von einem hängengebliebenen Prozess. */
export const SICHERUNG_VERFALL_MS = 6 * 3600_000;

/**
 * Schonfrist nach einer Datenbank-Migration (also nach einem Update): So lange ersetzt die App kein Original – weder die
 * Bildpflege noch Hochladen oder Abruf –, Vorschaubilder entstehen weiter sofort. Grund: Scheitert das Update doch noch,
 * spielt der Server-Manager nur die Datenbank von vorher zurück, nicht die Ablage; ein inzwischen verkleinertes Original
 * (anderer Dateiname bei PNG → JPG, andere Prüfsumme) passte dann nicht mehr zur alten Datenbank.
 * Wie lange kann der Rückfall nach dem Start der neuen Version noch kommen (manager/, Stand 1.8.1)?
 *   Setup wartet auf /api/health (lib/setup.mjs waitHealthy: 60 × (1,5 s Anfrage + 2 s Pause))        bis 3,5 min
 *   danach der Update-Helfer (lib/aktualisieren.mjs: healthy(120 s), dann healthy(60 s), dann Rückfall)  bis 3 min
 *   zusammen rund 7 min (per Paket von Hand: 3,5 min; nach unterbrochenem Update prüft der Helfer 3 min).
 * 15 min liegen mit gut doppeltem Abstand darüber; länger warten kostet nichts (Vorschaubilder gibt es trotzdem).
 * Wer dort die Wartezeiten verlängert, muss diesen Wert mitziehen.
 */
export const SCHONFRIST_NACH_MIGRATION_MS = 15 * 60_000;

/**
 * Bis wann (ms seit 1970) keine Originale ersetzt werden; 0 = keine Schonfrist. Nie länger als die Schonfrist ab jetzt –
 * auch wenn die Uhr beim Einspielen falsch ging (Raspberry Pi ohne Uhr).
 */
export function schonfristBis(letzteMigration: number | null, jetzt = Date.now()): number {
  if (letzteMigration === null) return 0;
  const bis = Math.min(letzteMigration, jetzt) + SCHONFRIST_NACH_MIGRATION_MS;
  return bis > jetzt ? bis : 0;
}

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
