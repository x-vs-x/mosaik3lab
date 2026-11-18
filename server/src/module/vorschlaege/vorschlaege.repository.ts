import type { Proposal, ProposalStatus, ProposalUrgency } from '@mosaik3lab/shared/vorschlaege';
import { conflict } from '../../kern/errors';
import { dateiFromRow, dateiName, type FileStore } from '../../kern/files';
import { all, count, json, marks, nextNumber, one, run, str, transaction, type Db } from '../../kern/db';

// Tabelle `vorschlag` (migrations/002_vorschlag.sql). Fotos: Tabelle `datei`, objekttyp 'vorschlag', rolle 'foto'.

export class ProposalRepository {
  constructor(
    private readonly db: Db,
    private readonly files: FileStore,
  ) {}

  private load(where = '', ...params: unknown[]): Proposal[] {
    const rows = all(this.db, `SELECT * FROM vorschlag ${where} ORDER BY erstellt_am, id`, ...params);
    if (rows.length === 0) return [];
    const photos = new Map<string, string[]>();
    // Fotos nur der gefundenen Vorschläge (mit Filter) bzw. aller Vorschläge.
    const ids = rows.map((r) => str(r.id));
    const filter = where ? `AND objekt_id IN (${marks(ids.length)})` : '';
    const fotos = all(this.db, `SELECT * FROM datei WHERE objekttyp = 'vorschlag' AND rolle = 'foto' ${filter} ORDER BY sortierung, erstellt_am`, ...(where ? ids : []));
    for (const d of fotos.map(dateiFromRow)) photos.set(d.objektId, [...(photos.get(d.objektId) ?? []), dateiName(d)]);
    return rows.map((r) => ({
      id: str(r.id),
      number: str(r.nummer),
      requesterId: r.lehrkraft_id == null ? null : str(r.lehrkraft_id),
      requesterEmail: str(r.lehrkraft_email),
      title: str(r.titel),
      description: str(r.beschreibung),
      usage: str(r.einsatz),
      links: json<string[]>(r.links, []),
      quantity: Number(r.menge),
      urgency: str(r.dringlichkeit) as ProposalUrgency,
      status: str(r.status) as ProposalStatus,
      reply: str(r.antwort),
      itemId: r.umgesetzt_artikel_id == null ? null : str(r.umgesetzt_artikel_id),
      photos: photos.get(str(r.id)) ?? [],
      updatedByUserId: str(r.bearbeitet_von),
      createdAt: str(r.erstellt_am),
      updatedAt: str(r.geaendert_am),
    }));
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
    return count(this.db, 'SELECT COUNT(*) AS n FROM vorschlag');
  }
  /** Anzahl je Status – per SQL, ohne die Vorschläge zu laden (Zähler in der Seitenleiste). */
  countByStatus(status: string) {
    return count(this.db, 'SELECT COUNT(*) AS n FROM vorschlag WHERE status = ?', status);
  }
  /** Alle Vorschläge oder nur die mit einem Status. */
  listByStatus(status: string) {
    return status ? this.load('WHERE status = ?', status) : this.load();
  }

  private numberExists = (nummer: string) => !!one(this.db, 'SELECT 1 FROM vorschlag WHERE nummer = ?', nummer);

  async create(p: Omit<Proposal, 'number' | 'photos'>) {
    transaction(this.db, () => {
      if (one(this.db, 'SELECT 1 FROM vorschlag WHERE id = ?', p.id)) throw conflict('ID bereits vergeben.');
      const number = nextNumber(this.db, 'vorschlag', new Date(p.createdAt), this.numberExists);
      const requesterId = p.requesterId && one(this.db, 'SELECT 1 FROM lehrkraft WHERE id = ?', p.requesterId) ? p.requesterId : null;
      run(
        this.db,
        `INSERT INTO vorschlag (id, nummer, lehrkraft_id, lehrkraft_email, titel, beschreibung, einsatz, links, menge, dringlichkeit,
           status, antwort, umgesetzt_artikel_id, bearbeitet_von, erstellt_am, geaendert_am)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        p.id,
        number,
        requesterId,
        p.requesterEmail,
        p.title,
        p.description,
        p.usage,
        JSON.stringify(p.links),
        p.quantity,
        p.urgency,
        p.status,
        p.reply,
        null,
        p.updatedByUserId,
        p.createdAt,
        p.updatedAt,
      );
    });
    return (await this.findById(p.id))!;
  }

  /** Geändert werden nur Status, Antwort und Verknüpfung zum Artikel – der Text der Lehrkraft bleibt unverändert. */
  async update(id: string, change: (current: Proposal) => Proposal) {
    transaction(this.db, () => {
      const current = this.load('WHERE id = ?', id)[0];
      if (!current) return;
      const next = change(structuredClone(current));
      if (next.itemId && !one(this.db, 'SELECT 1 FROM artikel WHERE id = ?', next.itemId)) throw conflict('Der Artikel existiert nicht mehr.');
      run(
        this.db,
        'UPDATE vorschlag SET status = ?, antwort = ?, umgesetzt_artikel_id = ?, bearbeitet_von = ?, geaendert_am = ? WHERE id = ?',
        next.status,
        next.reply,
        next.itemId,
        next.updatedByUserId,
        next.updatedAt,
        id,
      );
    });
    return this.findById(id);
  }

  async delete(id: string) {
    const current = await this.findById(id);
    if (!current) return undefined;
    const removed = transaction(this.db, () => {
      const files = this.files.removeRowsFor('vorschlag', id);
      run(this.db, 'DELETE FROM vorschlag WHERE id = ?', id);
      return files;
    });
    await this.files.unlink(removed);
    return current;
  }
}
