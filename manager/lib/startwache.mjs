// Warten auf die Web-App nach Einrichten/Update: früh aufgeben, wenn die neue Version eindeutig abstürzt, statt die
// volle Wartezeit (2 Minuten) abzusitzen – dann greift der Rückfall auf die vorige Version sofort.
// Langsame, aber gesunde Starts (Raspberry Pi) bleiben unberührt: Abgebrochen wird nur, wenn sich die Web-App mehrmals
// hintereinander selbst beendet hat (runners/webapp.mjs zählt das in „restarts“ der Zustandsdatei webapp.state.json).

/** Ab so vielen Abstürzen in Folge gilt der Start als gescheitert (Neustarts nach 2, 4, 8 s → etwa 15–20 s). */
export const MAX_ABSTUERZE = 4;

/**
 * Gibt den Grund zurück, warum das Warten auf /api/health abgebrochen werden soll – oder null (weiter warten).
 * state = Inhalt von webapp.state.json (oder null), seit = Zeitpunkt (ms), ab dem die Dienste gestartet wurden.
 * Ein Zustand aus der Zeit davor (alte Version, Dienst noch nicht hochgefahren) zählt nie.
 */
export function startAbbruch(state, { seit, max = MAX_ABSTUERZE } = {}) {
  if (!state || typeof state !== 'object') return null;
  const gestartet = Date.parse(state.startedAt);
  if (!Number.isFinite(gestartet) || (seit != null && gestartet < seit)) return null;
  const n = Number(state.restarts) || 0;
  if (n < max) return null;
  return `die Web-App hat sich ${n}-mal hintereinander beendet${state.lastError ? ` (${String(state.lastError).replace(/\.+$/, '')})` : ''}`;
}
