// Alter Tab nach einem Update: Die geladene Seite ist älter als der Server. Dann kann Speichern scheitern, weil sich
// Felder geändert haben (z. B. „Kategorien“ statt „Kategorie“) – statt einer rätselhaften Meldung soll „Seite neu laden“
// erscheinen (components/VersionsHinweis.tsx). Reine Regeln, ohne Browser testbar (client/test/stabilitaet.test.ts).

/** Zwischen zwei Prüfungen liegt mindestens so viel Zeit – eine abgelehnte Eingabe löst sonst jedes Mal eine Anfrage aus. */
export const VERSION_PRUEF_ABSTAND_MS = 60_000;

/**
 * true: Der Server läuft mit einer anderen Version als diese geladene Seite. Im Entwicklungsmodus (keine eingesetzte
 * Nummer) und ohne brauchbare Antwort nie – lieber kein Hinweis als ein falscher.
 */
export function andereVersion(seite: string, server: unknown): boolean {
  if (seite === 'Entwicklung' || typeof server !== 'string') return false;
  return /^\d+\.\d+\.\d+/.test(server) && server !== seite;
}

/** Darf jetzt (wieder) geprüft werden? */
export function versionPruefungFaellig(zuletzt: number, jetzt = Date.now()): boolean {
  return zuletzt === 0 || jetzt - zuletzt >= VERSION_PRUEF_ABSTAND_MS || jetzt < zuletzt;
}
