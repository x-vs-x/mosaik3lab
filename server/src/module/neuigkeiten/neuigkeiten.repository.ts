import { getBetrieb, setBetrieb } from '../../kern/betrieb';
import { count, one, run, type Db } from '../../kern/db';

// Versionen für „Was ist neu“: aktuelle und vorherige Version der App (Tabelle betrieb_einstellung, Bereich „betrieb“)
// und je Konto die zuletzt gelesene Version (benutzer.neuigkeiten_gesehen, Migration 015).

const AKTUELL = 'version.aktuell';
const VORHERIGE = 'version.vorherige';

export class NeuigkeitenRepository {
  constructor(private readonly db: Db) {}

  gespeicherteVersion(): unknown {
    return getBetrieb(this.db, 'betrieb', AKTUELL);
  }
  vorherigeVersion(): unknown {
    return getBetrieb(this.db, 'betrieb', VORHERIGE);
  }
  merkeVersion(aktuell: string, vorherige?: string) {
    if (vorherige !== undefined) setBetrieb(this.db, 'betrieb', VORHERIGE, vorherige);
    setBetrieb(this.db, 'betrieb', AKTUELL, aktuell);
  }

  /** Gibt es schon Konten oder Druckteile? (Unterscheidet ein Update von einer Neuinstallation.) */
  hatDaten(): boolean {
    return count(this.db, 'SELECT (SELECT COUNT(*) FROM benutzer) + (SELECT COUNT(*) FROM artikel) AS n') > 0;
  }

  gesehen(benutzerId: string): string | null {
    const r = one(this.db, 'SELECT neuigkeiten_gesehen AS v FROM benutzer WHERE id = ?', benutzerId);
    return typeof r?.v === 'string' ? r.v : null;
  }
  setGesehen(benutzerId: string, version: string) {
    run(this.db, 'UPDATE benutzer SET neuigkeiten_gesehen = ? WHERE id = ?', version, benutzerId);
  }
}
