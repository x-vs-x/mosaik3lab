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
