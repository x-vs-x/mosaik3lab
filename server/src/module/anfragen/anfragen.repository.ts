import type { Order } from '@mosaik3lab/shared/anfragen';
import { conflict } from '../../kern/errors';
import { all, b, bool, count, json, marks, nextNumber, one, run, str, syncRows, transaction, type Db, type Row } from '../../kern/db';

// Anfragen (Tabelle anfrage mit Farben, Feldwerten und Statusverlauf; Tabellen siehe docs/DATENMODELL.md).

export class OrderRepository {
  constructor(private readonly db: Db) {}

  load(where = '', ...params: unknown[]): Order[] {
    const rows = all(this.db, `SELECT * FROM anfrage ${where} ORDER BY erstellt_am, id`, ...params);
    if (rows.length === 0) return [];
    // Mit Filter nur die Kindzeilen der gefundenen Anfragen lesen (Index auf anfrage_id).
    const ids = rows.map((r) => str(r.id));
    const group = (table: string) => {
      const m = new Map<string, Row[]>();
      const sql = `SELECT * FROM ${table} ${where ? `WHERE anfrage_id IN (${marks(ids.length)})` : ''} ORDER BY sortierung`;
      for (const x of all(this.db, sql, ...(where ? ids : []))) m.set(str(x.anfrage_id), [...(m.get(str(x.anfrage_id)) ?? []), x]);
      return m;
    };
    const farben = group('anfrage_farbe');
    const werte = group('anfrage_feldwert');
    const verlauf = group('anfrage_statusverlauf');
    return rows.map((r) => {
      const id = str(r.id);
      return {
        id,
        number: str(r.nummer),
        itemId: str(r.artikel_id),
        itemName: str(r.artikel_name),
        quantity: Number(r.menge),
        color: str(r.farbe),
        colorId: str(r.farbe_id),
        colorHex: str(r.farbe_hex),
        colorChoices: (farben.get(id) ?? []).map((f) => ({
          areaId: str(f.bereich_schluessel),
          area: str(f.bereich),
          colorId: str(f.filament_id),
          color: str(f.farbe),
          colorHex: str(f.hex),
        })),
        colorVariants: json<Order['colorVariants']>(r.farbvarianten, []),
        size: str(r.groesse),
        classOrTeam: str(r.klasse),
        customization: str(r.bemerkung),
        personalization: (werte.get(id) ?? []).map((w) => ({ fieldId: str(w.feld_schluessel), label: str(w.bezeichnung), value: str(w.wert) })),
        status: str(r.status),
        history: (verlauf.get(id) ?? []).map((h) => ({
          status: str(h.status),
          at: str(h.zeitpunkt),
          byUserId: str(h.von_benutzer_id),
          byName: str(h.von_name),
          comment: str(h.kommentar),
        })),
        requesterId: r.lehrkraft_id == null ? null : str(r.lehrkraft_id),
        requesterEmail: str(r.besteller_email),
        requesterName: str(r.besteller_name),
        trackingCode: str(r.abruf_code),
        isDemo: bool(r.ist_demo),
        ...(r.wiederholt_von ? { repeatOf: str(r.wiederholt_von) } : {}),
        createdAt: str(r.erstellt_am),
        updatedAt: str(r.geaendert_am),
      } satisfies Order;
    });
  }

  async list() {
    return this.load();
  }
  async findById(id: string) {
    return this.load('WHERE id = ?', id)[0];
  }
  async listByRequester(requesterId: string) {
    return this.load('WHERE lehrkraft_id = ?', requesterId);
  }
  async count() {
    return count(this.db, 'SELECT COUNT(*) AS n FROM anfrage');
  }
  /** Alle Anfragen oder nur die mit einem Status. */
  listByStatus(status: string) {
    return status ? this.load('WHERE status = ?', status) : this.load();
  }
  /** Anfragen zu Abruf-Codes (Statusabfrage der Lehrkräfte). */
  listByTrackingCodes(codes: string[]) {
    return codes.length ? this.load(`WHERE abruf_code IN (${marks(codes.length)})`, ...codes) : [];
  }
  /** Die neuesten Anfragen (für die Übersicht). */
  latest(limit: number) {
    return this.load('WHERE id IN (SELECT id FROM anfrage ORDER BY erstellt_am DESC, id LIMIT ?)', limit);
  }
  /** Anzahl je Status (Zählung per SQL). */
  countByStatus(): Record<string, number> {
    return Object.fromEntries(all(this.db, 'SELECT status, COUNT(*) AS n FROM anfrage GROUP BY status').map((r) => [str(r.status), Number(r.n)]));
  }
  /** Anzahl der Anfragen je Lehrkraft (Zählung per SQL). */
  countByRequester(): Map<string, number> {
    return new Map(all(this.db, 'SELECT lehrkraft_id, COUNT(*) AS n FROM anfrage WHERE lehrkraft_id IS NOT NULL GROUP BY lehrkraft_id').map((r) => [str(r.lehrkraft_id), Number(r.n)]));
  }

  /** Schreibt eine Anfrage mit Farben, Feldwerten und Statusverlauf (innerhalb einer Transaktion aufrufen). */
  save(o: Order) {
    const artikelId = o.itemId && one(this.db, 'SELECT 1 FROM artikel WHERE id = ?', o.itemId) ? o.itemId : null;
    const lehrkraftId = o.requesterId && one(this.db, 'SELECT 1 FROM lehrkraft WHERE id = ?', o.requesterId) ? o.requesterId : null;
    run(
      this.db,
      `INSERT INTO anfrage (id, nummer, lehrkraft_id, artikel_id, artikel_name, menge, farbe, farbe_id, farbe_hex, groesse, klasse,
         bemerkung, status, besteller_email, besteller_name, abruf_code, ist_demo, wiederholt_von, erstellt_am, geaendert_am, farbvarianten)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET lehrkraft_id = excluded.lehrkraft_id, artikel_id = excluded.artikel_id,
         artikel_name = excluded.artikel_name, menge = excluded.menge, farbe = excluded.farbe, farbe_id = excluded.farbe_id,
         farbe_hex = excluded.farbe_hex, farbvarianten = excluded.farbvarianten, groesse = excluded.groesse, klasse = excluded.klasse, bemerkung = excluded.bemerkung,
         status = excluded.status, besteller_email = excluded.besteller_email, besteller_name = excluded.besteller_name,
         abruf_code = excluded.abruf_code, ist_demo = excluded.ist_demo, geaendert_am = excluded.geaendert_am`,
      o.id,
      o.number,
      lehrkraftId,
      artikelId,
      o.itemName ?? '',
      Number(o.quantity) || 1,
      o.color ?? '',
      o.colorId ?? '',
      o.colorHex ?? '',
      o.size ?? '',
      o.classOrTeam ?? '',
      o.customization ?? '',
      o.status,
      o.requesterEmail ?? '',
      o.requesterName ?? '',
      o.trackingCode ?? '',
      b(!!o.isDemo),
      o.repeatOf ?? null,
      o.createdAt,
      o.updatedAt,
      JSON.stringify(o.colorVariants ?? []),
    );
    syncRows(
      this.db,
      'anfrage_farbe',
      'anfrage_id',
      o.id,
      'sortierung',
      (o.colorChoices ?? []).map((c, i) => ({
        bereich_schluessel: c.areaId,
        bereich: c.area,
        filament_id: c.colorId,
        farbe: c.color,
        hex: c.colorHex ?? '',
        sortierung: i,
      })),
    );
    syncRows(
      this.db,
      'anfrage_feldwert',
      'anfrage_id',
      o.id,
      'sortierung',
      (o.personalization ?? []).map((p, i) => ({ feld_schluessel: p.fieldId, bezeichnung: p.label, wert: p.value, sortierung: i })),
    );
    syncRows(
      this.db,
      'anfrage_statusverlauf',
      'anfrage_id',
      o.id,
      'sortierung',
      (o.history ?? []).map((h, i) => ({
        status: h.status,
        zeitpunkt: h.at,
        von_benutzer_id: h.byUserId ?? '',
        von_name: h.byName ?? '',
        kommentar: h.comment ?? '',
        sortierung: i,
      })),
    );
  }

  private numberExists = (nummer: string) => !!one(this.db, 'SELECT 1 FROM anfrage WHERE nummer = ?', nummer);

  /** Vergibt die lesbare Nummer ANF-<Jahr>-<laufend> (Jahr der Anfrage). */
  async create(order: Omit<Order, 'number'>) {
    const id = transaction(this.db, () => {
      if (one(this.db, 'SELECT 1 FROM anfrage WHERE id = ?', order.id)) throw conflict('ID bereits vergeben.');
      const number = nextNumber(this.db, 'anfrage', new Date(order.createdAt), this.numberExists);
      this.save({ ...order, number });
      return order.id;
    });
    return (await this.findById(id))!;
  }

  async update(id: string, change: (current: Order) => Order) {
    const done = transaction(this.db, () => {
      const current = this.load('WHERE id = ?', id)[0];
      if (!current) return false;
      this.save({ ...change(structuredClone(current)), id, number: current.number });
      return true;
    });
    return done ? this.findById(id) : undefined;
  }
}

