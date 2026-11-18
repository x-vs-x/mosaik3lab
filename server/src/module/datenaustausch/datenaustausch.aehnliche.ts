import { all, one, run, str, type Db } from '../../kern/db';

// Ähnliche Druckteile (Tabelle artikel_aehnlich, Paar a < b) im Export/Import.
//
// Export: je Druckteil die Liste seiner ähnlichen Druckteile – auch solche, die nicht im Export sind – mit ID, Name und
// Nummer (Name/Nummer nur als Hilfe für Menschen).
// Import: nur hinzufügen, nie löschen (in beiden Modi). Ein Partner wird gefunden über
//   1) dasselbe Druckteil in der Datei (dessen Zuordnung hier), sonst 2) gleiche ID hier, sonst 3) Herkunfts-ID hier
//   (artikel.herkunft_id = ID in der Quelle, Migration 020).
// Fehlt der Partner, wird die Verknüpfung vorgemerkt (artikel_aehnlich_offen) und bei jedem späteren Import aufgelöst,
// sobald der Partner da ist. Verknüpfungen zählen nicht in den Vergleich „gleich/ersetzt“ (siehe datenaustausch.service.ts).

export interface PaketAehnlich {
  id: string;
  name: string;
  nummer: string;
}

const paar = (x: string, y: string) => (x < y ? [x, y] : [y, x]);

/** Ähnliche Druckteile der gewählten Druckteile (eine Abfrage für alle). */
export function aehnlicheFuerExport(db: Db, ids: string[]): Map<string, PaketAehnlich[]> {
  const gewaehlt = new Set(ids);
  const map = new Map<string, PaketAehnlich[]>();
  const rows = all(
    db,
    `SELECT p.a, p.b, xa.name AS name_a, xa.nummer AS nummer_a, xb.name AS name_b, xb.nummer AS nummer_b
       FROM artikel_aehnlich p JOIN artikel xa ON xa.id = p.a JOIN artikel xb ON xb.id = p.b`,
  );
  const add = (von: string, partner: PaketAehnlich) => {
    if (gewaehlt.has(von)) map.set(von, [...(map.get(von) ?? []), partner]);
  };
  for (const r of rows) {
    add(str(r.a), { id: str(r.b), name: str(r.name_b), nummer: str(r.nummer_b) });
    add(str(r.b), { id: str(r.a), name: str(r.name_a), nummer: str(r.nummer_a) });
  }
  for (const l of map.values()) l.sort((x, y) => x.nummer.localeCompare(y.nummer) || x.id.localeCompare(y.id));
  return map;
}

export interface VerknuepfungsZaehler {
  /** Neu angelegte Verknüpfungen (auch früher vorgemerkte, deren Partner jetzt da ist). */
  neu: number;
  /** Verknüpfungen aus der Datei, deren Partner hier noch fehlt (vorgemerkt). */
  wartend: number;
}

/** Druckteil hier zu einer ID aus einer Quelle: gleiche ID, sonst Herkunfts-ID. */
function findePartner(db: Db, quellId: string): string | undefined {
  const r = one(db, 'SELECT id FROM artikel WHERE id = ?', quellId) ?? one(db, "SELECT id FROM artikel WHERE herkunft_id = ? AND herkunft_id <> '' ORDER BY erstellt_am, id LIMIT 1", quellId);
  return r ? str(r.id) : undefined;
}

/**
 * Nach dem Einspielen (in derselben Transaktion): Herkunfts-IDs merken, Verknüpfungen der Datei anlegen oder vormerken,
 * früher vorgemerkte auflösen. `lokal` ordnet jedem Druckteil der Datei sein Druckteil hier zu (eingespielt, ersetzt,
 * gleich oder übersprungen, weil es hier schon vorhanden ist).
 */
export function verknuepfe(db: Db, artikel: { id: string; aehnliche: PaketAehnlich[] }[], lokal: Map<string, string>): VerknuepfungsZaehler {
  const jetzt = new Date().toISOString();
  // 1) Herkunft: nur setzen, wenn noch keine gemerkt ist (nie überschreiben), und nur bei abweichender ID.
  for (const [quellId, id] of lokal) {
    if (quellId !== id) run(db, "UPDATE artikel SET herkunft_id = ? WHERE id = ? AND herkunft_id = ''", quellId, id);
  }
  let neu = 0;
  const wartend = new Set<string>();
  const verbinde = (x: string, y: string) => {
    if (x === y) return;
    neu += Number(run(db, 'INSERT OR IGNORE INTO artikel_aehnlich (a, b) VALUES (?, ?)', ...paar(x, y)).changes);
  };
  // 2) Verknüpfungen der Datei
  for (const a of artikel) {
    const id = lokal.get(a.id);
    if (!id) continue; // Druckteil wurde nicht eingespielt (z. B. unvollständig)
    for (const p of a.aehnliche) {
      const partner = lokal.get(p.id) ?? findePartner(db, p.id);
      if (partner) verbinde(id, partner);
      else {
        run(
          db,
          'INSERT OR IGNORE INTO artikel_aehnlich_offen (artikel_id, partner_herkunft, partner_name, partner_nummer, vorgemerkt_am) VALUES (?, ?, ?, ?, ?)',
          id, p.id, p.name, p.nummer, jetzt,
        );
        wartend.add(`${id}|${p.id}`);
      }
    }
  }
  // 3) Früher vorgemerkte auflösen, deren Partner jetzt da ist.
  for (const o of all(db, 'SELECT artikel_id, partner_herkunft FROM artikel_aehnlich_offen')) {
    const id = str(o.artikel_id);
    const partner = findePartner(db, str(o.partner_herkunft));
    if (!partner) continue;
    verbinde(id, partner);
    run(db, 'DELETE FROM artikel_aehnlich_offen WHERE artikel_id = ? AND partner_herkunft = ?', id, str(o.partner_herkunft));
  }
  return { neu, wartend: wartend.size };
}
