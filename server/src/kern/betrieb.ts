import crypto from 'node:crypto';
import type { Db } from './db';

// Betriebs-, Mail- und Manager-Einstellungen (Tabelle betrieb_einstellung, Migration 006).
// Die App liest hier Mail-Konfiguration und Session-Geheimnis; Ports/Pfade bekommt sie als Umgebungsvariablen
// vom Server-Manager, der dieselbe Tabelle direkt pflegt (docs/DATENMODELL.md).

export type BetriebBereich = 'betrieb' | 'mail' | 'manager';

export function getBetrieb(db: Db, bereich: BetriebBereich, schluessel: string): unknown {
  const row = db.prepare('SELECT wert FROM betrieb_einstellung WHERE bereich = ? AND schluessel = ?').get(bereich, schluessel) as
    | { wert: string }
    | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.wert);
  } catch {
    return undefined;
  }
}

export function getBereich(db: Db, bereich: BetriebBereich): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of db.prepare('SELECT schluessel, wert FROM betrieb_einstellung WHERE bereich = ?').all(bereich) as { schluessel: string; wert: string }[]) {
    try {
      out[r.schluessel] = JSON.parse(r.wert);
    } catch {
      /* unlesbarer Wert → wie nicht vorhanden */
    }
  }
  return out;
}

export function setBetrieb(db: Db, bereich: BetriebBereich, schluessel: string, wert: unknown, geheim = false) {
  db.prepare(
    `INSERT INTO betrieb_einstellung (bereich, schluessel, wert, geheim, geaendert_am) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (bereich, schluessel) DO UPDATE SET wert = excluded.wert, geheim = excluded.geheim, geaendert_am = excluded.geaendert_am`,
  ).run(bereich, schluessel, JSON.stringify(wert), geheim ? 1 : 0, new Date().toISOString());
}

/** Nur anlegen, wenn es den Schlüssel noch nicht gibt (Rennen zwischen zwei Prozessen bleibt harmlos). */
export function setBetriebWennNeu(db: Db, bereich: BetriebBereich, schluessel: string, wert: unknown, geheim = false): boolean {
  const r = db
    .prepare('INSERT OR IGNORE INTO betrieb_einstellung (bereich, schluessel, wert, geheim, geaendert_am) VALUES (?, ?, ?, ?, ?)')
    .run(bereich, schluessel, JSON.stringify(wert), geheim ? 1 : 0, new Date().toISOString());
  return Number(r.changes) > 0;
}

export function hatBereich(db: Db, bereich: BetriebBereich): boolean {
  return !!db.prepare('SELECT 1 FROM betrieb_einstellung WHERE bereich = ? LIMIT 1').get(bereich);
}

/** Session-Geheimnis aus der Datenbank; beim ersten Start wird ein zufälliges angelegt. */
export function sessionGeheimnis(db: Db): string {
  const vorhanden = getBetrieb(db, 'betrieb', 'sessionSecret');
  if (typeof vorhanden === 'string' && vorhanden.length >= 32) return vorhanden;
  setBetriebWennNeu(db, 'betrieb', 'sessionSecret', crypto.randomBytes(48).toString('hex'), true);
  const neu = getBetrieb(db, 'betrieb', 'sessionSecret');
  if (typeof neu !== 'string' || neu.length < 32) throw new Error('Session-Geheimnis konnte nicht gespeichert werden.');
  return neu;
}
