import { defaultOrderStatuses, STATUS_CATALOG } from '../../domain/orderStatuses';
import type { MasterData } from '../../domain/settings';
import { all, b, bool, count, run, str, type Db } from '../../kern/db';
import { conflict } from '../../kern/errors';
import type { MasterDataList } from '@mosaik3lab/shared/stammdaten';

// Stammdaten: Tabellen kategorie, einsatzbereich, material, filament und statusart (feste Liste, nur an/aus).
// Gelesen/geschrieben zusammen mit den Einstellungen (module/einstellungen/einstellungen.repository.ts).

/** Wo ein Stammdateneintrag in Druckteilen verwendet wird (Kategorie/Material/Einsatzbereich per Name, Farbrolle per ID). */
const USAGE_SQL: Record<MasterDataList, string> = {
  categories: 'SELECT DISTINCT a.id FROM artikel a JOIN kategorie k ON k.id = a.kategorie_id WHERE k.name = ?',
  materials: 'SELECT DISTINCT a.id FROM artikel a JOIN material m ON m.id = a.material_id WHERE m.name = ?',
  useAreas:
    'SELECT DISTINCT ae.artikel_id AS id FROM artikel_einsatzbereich ae JOIN einsatzbereich e ON e.id = ae.einsatzbereich_id WHERE e.name = ?',
  filaments:
    'SELECT DISTINCT fb.artikel_id AS id FROM artikel_farbbereich_filament ff JOIN artikel_farbbereich fb ON fb.id = ff.farbbereich_id WHERE ff.filament_id = ?',
};

export class MasterDataRepository {
  constructor(private readonly db: Db) {}

  /** Feste Status immer vollständig eintragen (neue Datenbank und nach Updates). */
  initStatuses() {
    STATUS_CATALOG.forEach((t, i) =>
      run(this.db, 'INSERT INTO statusart (id, aktiv, sortierung) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET sortierung = excluded.sortierung', t.id, b(t.defaultActive), i),
    );
  }

  read(): MasterData {
    const aktiv = new Map(all(this.db, 'SELECT id, aktiv FROM statusart').map((r) => [str(r.id), bool(r.aktiv)]));
    return {
      categories: all(this.db, 'SELECT * FROM kategorie ORDER BY sortierung').map((r) => ({
        id: str(r.id),
        name: str(r.name),
        color: str(r.farbe) as never,
        icon: str(r.symbol) as never,
      })),
      useAreas: all(this.db, 'SELECT * FROM einsatzbereich ORDER BY sortierung').map((r) => ({ id: str(r.id), name: str(r.name) })),
      materials: all(this.db, 'SELECT * FROM material ORDER BY sortierung').map((r) => ({ id: str(r.id), name: str(r.name) })),
      filaments: all(this.db, 'SELECT * FROM filament ORDER BY sortierung').map((r) => ({
        id: str(r.id),
        brand: str(r.marke),
        line: str(r.linie),
        colorName: str(r.farbname),
        hex: str(r.hex),
        herstellerNummer: str(r.hersteller_nummer),
        available: bool(r.verfuegbar),
        katalogId: r.katalog_id == null ? null : str(r.katalog_id),
        herstellerName: str(r.hersteller_name),
        weggefallen: bool(r.weggefallen),
      })),
      orderStatuses: defaultOrderStatuses().map((s) => ({ ...s, active: aktiv.get(s.id) ?? s.active })),
    };
  }

  /** Schreibt alle Listen (Zeilen behalten ihre ID, entfernte werden gelöscht). Innerhalb einer Transaktion aufrufen. */
  write(md: MasterData) {
    const list = <T extends { id: string }>(table: string, entries: T[], cols: (e: T) => Record<string, unknown>) => {
      const keep = new Set(entries.map((e) => e.id));
      for (const r of all(this.db, `SELECT id FROM ${table}`)) {
        if (keep.has(str(r.id))) continue;
        try {
          run(this.db, `DELETE FROM ${table} WHERE id = ?`, r.id);
        } catch (err) {
          if (/FOREIGN KEY/i.test((err as Error).message)) throw conflict('Ein entfernter Eintrag wird noch verwendet.');
          throw err;
        }
      }
      entries.forEach((e, i) => {
        const row = { ...cols(e), sortierung: i };
        const c = Object.keys(row);
        run(
          this.db,
          `INSERT INTO ${table} (id, ${c.join(', ')}) VALUES (?, ${c.map(() => '?').join(', ')})
           ON CONFLICT (id) DO UPDATE SET ${c.map((x) => `${x} = excluded.${x}`).join(', ')}`,
          e.id,
          ...Object.values(row),
        );
      });
    };
    list('kategorie', md.categories, (e) => ({ name: e.name, farbe: e.color, symbol: e.icon }));
    list('einsatzbereich', md.useAreas, (e) => ({ name: e.name }));
    list('material', md.materials, (e) => ({ name: e.name }));
    list('filament', md.filaments, (e) => ({
      marke: e.brand,
      linie: e.line,
      farbname: e.colorName,
      hex: e.hex,
      verfuegbar: b(e.available !== false),
      katalog_id: e.katalogId ?? null,
      hersteller_nummer: e.herstellerNummer ?? '',
      hersteller_name: e.herstellerName ?? '',
      weggefallen: b(!!e.weggefallen),
    }));
    for (const st of md.orderStatuses) run(this.db, 'UPDATE statusart SET aktiv = ? WHERE id = ?', b(st.active), st.id);
  }

  /** Anzahl der Druckteile, die den Eintrag verwenden (`value` = Name bzw. bei Farbrollen die Filament-ID). */
  countItemsUsing(list: MasterDataList, value: string) {
    return count(this.db, `SELECT COUNT(*) AS n FROM (${USAGE_SQL[list]})`, value);
  }

  /** IDs der Druckteile, die den Eintrag verwenden. */
  itemIdsUsing(list: MasterDataList, value: string) {
    return all(this.db, USAGE_SQL[list], value).map((r) => str(r.id));
  }
}
