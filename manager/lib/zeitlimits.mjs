// Zeitlimits beim Update per Knopfdruck – an EINER Stelle, damit nie ein äußeres Limit eine gesunde, nur langsame
// Arbeit abbricht (Raspberry Pi mit großer Ablage: Sicherung vor dem Update dauert dann lange).
// Von innen nach außen, jedes Limit größer als alles, was es umschließt:
//
//   Sicherung vor dem Update (paketupdate.mjs backupWithInstalled)      SICHERUNG_MAX_MS   2 h
//   Admin-Schritte des Setups (chown/icacls über die Ablage, elevate)    ADMIN_MAX_MS      30 min
//   Setup des Pakets im Update-Helfer (Wächter, aktualisieren.mjs)        SETUP_MAX_MS      3 h  = Sicherung + 1 h (Kopieren, Rechte, Start, Health)
//   ganzer Lauf des Update-Helfers (Linux: TimeoutStartSec der Unit)      HELFER_MAX_MS     4 h  = Setup + 1 h (Prüfen, Entpacken, Rückfall, Besitz)
//   Windows: WinSW kennt kein Start-Zeitlimit – der Helfer begrenzt sich selbst (SETUP_MAX_MS).
//
// Anzeige im Server-Manager (updates.mjs → laufAnzeige):
//   „wartet“ höchstens WARTEN_MAX_MS, bis sich der Helfer zum ersten Mal meldet (er schreibt sofort beim Start) – sonst Fehler.
//   Meldet er „läuft“, gilt das bis HELFER_MAX_MS nach seinem Start als „läuft noch“; erst danach ist er sicher beendet
//   (Linux: von systemd gestoppt) – dann ein klarer Hinweis statt endlosem „läuft“.
// Hinweis: Während Sicherung und Umschalten ist auch der Server-Manager gestoppt; die Seite wartet dann (public/update.js)
// und nennt die Größenordnung aus `zeitlimits` der letzten Antwort.
export const MIN = 60_000;
export const SICHERUNG_MAX_MS = 120 * MIN;
export const ADMIN_MAX_MS = 30 * MIN;
export const SETUP_MAX_MS = SICHERUNG_MAX_MS + 60 * MIN;
export const HELFER_MAX_MS = SETUP_MAX_MS + 60 * MIN;
export const WARTEN_MAX_MS = 10 * MIN;
/** Ab so langer Stille im Status zeigt die Anzeige „läuft noch“ mit Startzeit. */
export const STILL_MS = 2 * MIN;

/** Für die Oberfläche (Minuten). */
export const zeitlimitsMinuten = () => ({ sicherung: SICHERUNG_MAX_MS / MIN, helfer: HELFER_MAX_MS / MIN });

const uhrzeit = (iso) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/**
 * Was zeigt der Server-Manager zum laufenden Update? Reine Entscheidung (ohne Dateien und Uhr).
 *   h         Status des Update-Helfers (update-status.json) oder null
 *   download  Download des Managers { version, startedAt, fertig, fertigAt, error } oder null
 *   now       Zeitpunkt (ms)
 *   von       installierte Version (für „wartet“)
 * → { lauf, fehler? }  lauf = anzuzeigender Lauf (oder null); fehler = { error, hint }, wenn der Helfer nie reagiert hat
 *   (dann setzt der Aufrufer download.error).
 */
export function laufAnzeige(h, download, now, von = null) {
  const lauf = h ? laufendOderHaengt(h, now) : h;
  if (!download?.fertig || download.error) return { lauf };
  if (h && Date.parse(h.at) >= Date.parse(download.startedAt)) return { lauf };
  const seit = Date.parse(download.fertigAt ?? download.startedAt);
  if (now - seit > WARTEN_MAX_MS) {
    return { lauf, fehler: { error: 'Der Update-Helfer hat nicht reagiert – es wurde nichts verändert.', hint: 'Server neu starten und erneut „Jetzt aktualisieren“ wählen; sonst das Paket per USB-Stick installieren.' } };
  }
  return { lauf: { phase: 'wartet', version: download.version, von, meldung: 'Update ist geprüft und wird gleich installiert …', at: download.fertigAt ?? download.startedAt } };
}

/** „läuft“: still, aber im Zeitrahmen → „läuft noch“; über dem Gesamtlimit des Helfers → er ist sicher beendet. */
function laufendOderHaengt(h, now) {
  if (h.phase !== 'läuft') return h;
  const start = Date.parse(h.started ?? h.at);
  if (Number.isFinite(start) && now - start > HELFER_MAX_MS) {
    return { ...h, phase: 'fehler', haengt: true, meldung: `Das Update auf Version ${h.version} wurde nicht beendet (gestartet ${uhrzeit(h.started ?? h.at)}).`, hint: 'Den Server neu starten: Beim Hochfahren prüft der Update-Helfer und stellt bei Bedarf die bisherige Version wieder her. Danach kann erneut aktualisiert werden.' };
  }
  const still = now - Date.parse(h.at);
  if (Number.isFinite(start) && still > STILL_MS) return { ...h, meldung: `${h.meldung ?? 'Update läuft …'} – läuft noch (seit ${uhrzeit(h.started ?? h.at)}; die Sicherung kann bei vielen Bildern und Videos lange dauern).` };
  return h;
}
