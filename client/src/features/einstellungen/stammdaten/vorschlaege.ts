// Vorschläge für „Marke“ und „Linie“ der Farbrollen – aus den vorhandenen Farbrollen, keine eigenen Stammdaten.

interface MitMarke {
  brand: string;
  line: string;
}

const schluessel = (s: string) => s.trim().toLocaleLowerCase('de');
const alphabetisch = (a: string, b: string) => a.localeCompare(b, 'de', { sensitivity: 'base' });

/** Eindeutig (Groß-/Kleinschreibung zusammengefasst, erste Schreibweise gewinnt), ohne Leere, alphabetisch. */
export function eindeutig(werte: string[]): string[] {
  const seen = new Map<string, string>();
  for (const w of werte) {
    const k = schluessel(w);
    if (k && !seen.has(k)) seen.set(k, w.trim());
  }
  return [...seen.values()].sort(alphabetisch);
}

export const markenVorschlaege = (rollen: MitMarke[]) => eindeutig(rollen.map((r) => r.brand));

/** Linien: zuerst die der gewählten Marke, danach alle übrigen (ohne Marke: alle alphabetisch). */
export function linienVorschlaege(rollen: MitMarke[], marke: string): string[] {
  const m = schluessel(marke);
  const eigene = m ? eindeutig(rollen.filter((r) => schluessel(r.brand) === m).map((r) => r.line)) : [];
  const schon = new Set(eigene.map(schluessel));
  return [...eigene, ...eindeutig(rollen.map((r) => r.line)).filter((l) => !schon.has(schluessel(l)))];
}

/** Was unter dem Feld angeboten wird: passend zur Eingabe, ohne den schon eingetragenen Wert, höchstens `max`. */
export function passendeVorschlaege(vorschlaege: string[], eingabe: string, max = 8): string[] {
  const e = schluessel(eingabe);
  return vorschlaege.filter((v) => schluessel(v) !== e && schluessel(v).includes(e)).slice(0, max);
}
