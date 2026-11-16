import { withBase } from './basePath';

// Ersteinrichtung: Solange es noch keinen Administrator gibt, führt jeder Aufruf der App direkt zur Einrichtungsseite
// des Server-Managers (<pfad>/manager/ – dort E-Mail, Name, Passwort festlegen). Der Manager antwortet auf
// GET <pfad>/manager/api/auth mit { needsAdmin }; danach (Administrator vorhanden) antwortet er 403 oder ist gar nicht
// erreichbar (Entwicklung ohne Manager) → die App startet normal. Ist einmal ein Administrator da, fragt dieser Tab
// nicht erneut (sessionStorage).
const KEY = 'm3l.adminVorhanden';

/** → true: App normal starten · false: es wird gerade zur Einrichtung weitergeleitet. */
export async function ersteinrichtungPruefen(): Promise<boolean> {
  try {
    if (sessionStorage.getItem(KEY)) return true;
  } catch {
    /* kein Speicher (privates Fenster) – dann eben jedes Mal fragen */
  }
  try {
    const res = await fetch(withBase('/manager/api/auth'), { credentials: 'same-origin', signal: AbortSignal.timeout(3000) });
    const data = res.ok ? ((await res.json()) as { needsAdmin?: boolean }) : null;
    if (data?.needsAdmin) {
      window.location.replace(withBase('/manager/'));
      return false;
    }
    if (res.ok || res.status === 403) {
      try {
        sessionStorage.setItem(KEY, '1');
      } catch {
        /* egal */
      }
    }
  } catch {
    /* Manager nicht erreichbar → App normal starten */
  }
  return true;
}
