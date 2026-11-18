// Automatisches Neuladen, wenn ein Programmteil nicht nachgeladen werden kann (alter Tab nach einem Update: die alte Datei
// gibt es nicht mehr; kurzer WLAN-Abriss). Höchstens einmal je Minute – sonst entstünde bei dauerhaftem Fehler eine
// Endlosschleife. Danach zeigt die Fehlergrenze (components/Fehlergrenze.tsx) „Seite neu laden“.

const KEY = 'm3l.neuGeladenUm';
/** Sperrzeit nach einem automatischen Neuladen. */
export const NEU_LADEN_SPERRE_MS = 60_000;

type Speicher = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * true: jetzt automatisch neu laden (und Sperre gesetzt) · false: gerade erst neu geladen oder kein Speicher
 * (Safari im privaten Modus) – dann nicht automatisch, sonst droht eine Schleife.
 */
export function automatischNeuLadenErlaubt(speicher: Speicher | undefined, jetzt = Date.now()): boolean {
  try {
    if (!speicher) return false;
    const letztes = Number(speicher.getItem(KEY));
    if (letztes && jetzt - letztes >= 0 && jetzt - letztes < NEU_LADEN_SPERRE_MS) return false;
    speicher.setItem(KEY, String(jetzt));
    return speicher.getItem(KEY) === String(jetzt);
  } catch {
    return false;
  }
}

/** Fehler beim Nachladen eines Programmteils (Chrome, Firefox, Safari formulieren ihn verschieden). */
export function istNachladeFehler(err: unknown): boolean {
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Unable to preload|ChunkLoadError|Load failed/i.test(text);
}

const sessionSpeicher = (): Speicher | undefined => {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
};

/** Einmal in main.tsx aufrufen: Vite meldet fehlgeschlagenes Nachladen als Ereignis „vite:preloadError“. */
export function nachladeFehlerBehandeln() {
  window.addEventListener('vite:preloadError', (event) => {
    if (!automatischNeuLadenErlaubt(sessionSpeicher())) return; // Fehler läuft weiter zur Fehlergrenze
    event.preventDefault();
    window.location.reload();
  });
}
