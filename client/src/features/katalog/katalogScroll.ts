/**
 * Scrollposition des Katalogs je Adresse (Suche/Filter) – damit man nach einem Druckteil auf derselben Höhe
 * weiterliest. Der Browser kann das allein nicht: Nach „Zurück“ lädt die Liste neu und ist im Moment der
 * Wiederherstellung noch leer (die Seite zu kurz).
 */
const PREFIX = 'mosaik3lab:katalog-scroll:';

/** Zuletzt besuchte Seite (Pfad), von `Layout` bei jedem Seitenwechsel gemeldet. */
let vorigePfad: string | undefined;
let aktuellerPfad: string | undefined;

export function meldeSeitenwechsel(pfad: string) {
  if (pfad === aktuellerPfad) return;
  vorigePfad = aktuellerPfad;
  aktuellerPfad = pfad;
}

/** War die vorige Seite ein Druckteil (`/katalog/<id>`)? */
export function kommtVomDruckteil(pfad = vorigePfad) {
  return !!pfad && /^\/katalog\/[^/]+$/.test(pfad);
}

/** Wiederherstellen bei „Zurück“ (POP) und wenn man vom Druckteil per Link/Navigation zum Katalog wechselt. */
export function sollPositionWiederherstellen(navigationType: string, vorige = vorigePfad) {
  return navigationType === 'POP' || kommtVomDruckteil(vorige);
}

function speicher(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined; // z. B. gesperrt im privaten Modus
  }
}

export function merkePosition(adresse: string, y: number) {
  try {
    speicher()?.setItem(PREFIX + adresse, String(Math.max(0, Math.round(y))));
  } catch {
    /* voll oder gesperrt – dann eben ohne */
  }
}

export function ladePosition(adresse: string): number | null {
  try {
    const wert = speicher()?.getItem(PREFIX + adresse);
    if (wert == null) return null;
    const y = Number(wert);
    return Number.isFinite(y) && y >= 0 ? y : null;
  } catch {
    return null;
  }
}

/** Der Katalog zeigt zuerst so viele Druckteile und lädt beim Runterscrollen je so viele nach. */
export const KATALOG_SEITE = 50;
const PREFIX_ANZAHL = 'mosaik3lab:katalog-anzahl:';

/** Wie viele Druckteile angezeigt waren – damit „Zurück“ auch weit unten wieder an derselben Stelle landet. */
export function merkeAnzahl(adresse: string, anzahl: number) {
  try {
    speicher()?.setItem(PREFIX_ANZAHL + adresse, String(Math.round(anzahl)));
  } catch {
    /* voll oder gesperrt – dann eben ohne */
  }
}

/** Gemerkte Anzahl, mindestens eine Seite; ohne Eintrag oder bei Unsinn eine Seite. */
export function ladeAnzahl(adresse: string): number {
  try {
    const n = Number(speicher()?.getItem(PREFIX_ANZAHL + adresse));
    return Number.isFinite(n) && n > KATALOG_SEITE ? Math.round(n) : KATALOG_SEITE;
  } catch {
    return KATALOG_SEITE;
  }
}

/** Nächste Anzahl beim Nachladen: eine Seite mehr, höchstens alle. */
export function naechsteAnzahl(angezeigt: number, gesamt: number) {
  return Math.min(gesamt, angezeigt + KATALOG_SEITE);
}
