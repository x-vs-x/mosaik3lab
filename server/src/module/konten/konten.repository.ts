import { newId } from '../../domain/ids';
import type { Bereich } from '@mosaik3lab/shared/konten';
import type { Requester, Role, User } from '../../domain/types';
import { conflict } from '../../kern/errors';
import type { FileStore } from '../../kern/files';
import { all, b, bool, count, one, run, str, transaction, type Db, type Row } from '../../kern/db';

// Konten (Tabelle benutzer + benutzer_bereich) und Lehrkräfte (Tabelle lehrkraft, Besteller-Verzeichnis).

// --- Benutzer ------------------------------------------------------------------------------------------

export class UserRepository {
  constructor(
    private readonly db: Db,
    private readonly files: FileStore,
  ) {}

  /** `bereiche` vorgeladen (Liste: eine Abfrage für alle statt einer je Konto). */
  private toUser(r: Row, bereiche = all(this.db, 'SELECT bereich FROM benutzer_bereich WHERE benutzer_id = ? ORDER BY bereich', r.id)): User {
    return {
      id: str(r.id),
      username: str(r.benutzername),
      email: str(r.email),
      displayName: str(r.anzeigename),
      role: str(r.rolle) as Role,
      passwordHash: str(r.passwort_hash),
      active: bool(r.aktiv),
      isDemo: bool(r.ist_demo),
      createdAt: str(r.erstellt_am),
      updatedAt: str(r.geaendert_am),
      lastLoginAt: r.letzte_anmeldung == null ? null : str(r.letzte_anmeldung),
      teamBereiche: bereiche.map((x) => str(x.bereich) as Bereich),
      fehlversuche: Number(r.fehlversuche ?? 0),
      gesperrtSeit: r.gesperrt_seit == null ? null : str(r.gesperrt_seit),
    };
  }

  async list() {
    const jeKonto = new Map<string, Row[]>();
    for (const b of all(this.db, 'SELECT benutzer_id, bereich FROM benutzer_bereich ORDER BY bereich')) {
      const k = str(b.benutzer_id);
      jeKonto.set(k, [...(jeKonto.get(k) ?? []), b]);
    }
    return all(this.db, 'SELECT * FROM benutzer WHERE entfernt_am IS NULL ORDER BY erstellt_am, id').map((r) => this.toUser(r, jeKonto.get(str(r.id)) ?? []));
  }
  async findById(id: string) {
    const r = one(this.db, 'SELECT * FROM benutzer WHERE id = ?', id);
    return r && this.toUser(r);
  }
  async findByUsername(username: string) {
    const r = one(this.db, 'SELECT * FROM benutzer WHERE benutzername = ?', username.trim().toLowerCase());
    return r && this.toUser(r);
  }
  async findByEmail(email: string) {
    const r = one(this.db, 'SELECT * FROM benutzer WHERE email = ?', email.trim().toLowerCase());
    return r && this.toUser(r);
  }
  async count() {
    return count(this.db, 'SELECT COUNT(*) AS n FROM benutzer');
  }
  /** Aktive Administratoren mit festgelegtem Passwort (Schutz: mindestens einer muss bleiben). */
  countActiveAdmins() {
    return count(this.db, "SELECT COUNT(*) AS n FROM benutzer WHERE rolle = 'admin' AND aktiv = 1 AND passwort_hash <> ''");
  }

  private assertUnique(u: User) {
    if (one(this.db, 'SELECT 1 FROM benutzer WHERE benutzername = ? AND id <> ?', u.username, u.id)) {
      throw conflict('Dieser Benutzername ist bereits vergeben.', { username: 'Bereits vergeben' });
    }
    if (u.email && one(this.db, 'SELECT 1 FROM benutzer WHERE email = ? AND id <> ?', u.email, u.id)) {
      throw conflict('Diese E-Mail-Adresse gehört bereits zu einem anderen Konto.', { email: 'Bereits vergeben' });
    }
  }

  /** Schreibt Konto + Druck-Team-Bereiche (Einfügen oder Aktualisieren). */
  save(u: User) {
    this.assertUnique(u);
    run(
      this.db,
      `INSERT INTO benutzer (id, benutzername, email, anzeigename, rolle, passwort_hash, aktiv, ist_demo, erstellt_am, geaendert_am, letzte_anmeldung, fehlversuche, gesperrt_seit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET benutzername = excluded.benutzername, email = excluded.email, anzeigename = excluded.anzeigename,
         rolle = excluded.rolle, passwort_hash = excluded.passwort_hash, aktiv = excluded.aktiv, ist_demo = excluded.ist_demo,
         erstellt_am = excluded.erstellt_am, geaendert_am = excluded.geaendert_am, letzte_anmeldung = excluded.letzte_anmeldung,
         fehlversuche = excluded.fehlversuche, gesperrt_seit = excluded.gesperrt_seit`,
      u.id,
      u.username,
      u.email || null,
      u.displayName,
      u.role,
      u.passwordHash,
      b(u.active),
      b(u.isDemo),
      u.createdAt,
      u.updatedAt,
      u.lastLoginAt,
      u.fehlversuche ?? 0,
      u.gesperrtSeit ?? null,
    );
    run(this.db, 'DELETE FROM benutzer_bereich WHERE benutzer_id = ?', u.id);
    for (const bereich of new Set(u.teamBereiche ?? [])) {
      run(this.db, 'INSERT INTO benutzer_bereich (benutzer_id, bereich) VALUES (?, ?)', u.id, bereich);
    }
  }

  async create(entity: User) {
    transaction(this.db, () => {
      if (one(this.db, 'SELECT 1 FROM benutzer WHERE id = ?', entity.id)) throw conflict('ID bereits vergeben.');
      this.save(entity);
    });
    return (await this.findById(entity.id))!;
  }

  async update(id: string, change: (current: User) => User) {
    const done = transaction(this.db, () => {
      const r = one(this.db, 'SELECT * FROM benutzer WHERE id = ?', id);
      if (!r) return false;
      const next = change(this.toUser(r));
      this.save({ ...next, id });
      return true;
    });
    return done ? this.findById(id) : undefined;
  }

  /**
   * Als entfernt markieren: Die Zeile bleibt (Bezug für Verlauf und Vorschläge), aber ohne Anmeldung, Rechte und Links.
   * Die E-Mail wird durch einen Platzhalter ersetzt, damit dieselbe Adresse später neu vergeben werden kann.
   */
  markRemoved(id: string, at: string) {
    transaction(this.db, () => {
      run(
        this.db,
        `UPDATE benutzer SET email = ?, benutzername = ?, passwort_hash = '', aktiv = 0, fehlversuche = 0, gesperrt_seit = NULL,
           entfernt_am = ?, geaendert_am = ? WHERE id = ?`,
        `entfernt-${id}`,
        `entfernt-${id}`,
        at,
        at,
        id,
      );
      run(this.db, 'DELETE FROM benutzer_bereich WHERE benutzer_id = ?', id);
      run(this.db, 'DELETE FROM passwort_link WHERE benutzer_id = ?', id);
    });
  }

  async delete(id: string) {
    const user = await this.findById(id);
    if (!user) return undefined;
    const removed = transaction(this.db, () => {
      run(this.db, 'DELETE FROM benutzer WHERE id = ?', id);
      return this.files.removeRowsFor('benutzer', id);
    });
    await this.files.unlink(removed);
    return user;
  }

  // --- Passwort-Links (Tabelle passwort_link, nur der Hash des Tokens) ---

  /** Neuer Link für das Konto; ältere Links des Kontos werden dabei ungültig. */
  saveLink(benutzerId: string, tokenHash: string, zweck: PasswortZweck, gueltigBis: string | null) {
    transaction(this.db, () => {
      run(this.db, 'DELETE FROM passwort_link WHERE benutzer_id = ?', benutzerId);
      run(
        this.db,
        'INSERT INTO passwort_link (token_hash, benutzer_id, zweck, erstellt_am, gueltig_bis) VALUES (?, ?, ?, ?, ?)',
        tokenHash,
        benutzerId,
        zweck,
        new Date().toISOString(),
        gueltigBis,
      );
    });
  }

  findLink(tokenHash: string) {
    const r = one(this.db, 'SELECT * FROM passwort_link WHERE token_hash = ?', tokenHash);
    return r && { benutzerId: str(r.benutzer_id), zweck: str(r.zweck) as PasswortZweck, gueltigBis: r.gueltig_bis == null ? null : str(r.gueltig_bis) };
  }

  hasLink(benutzerId: string) {
    return !!one(this.db, 'SELECT 1 FROM passwort_link WHERE benutzer_id = ?', benutzerId);
  }

  deleteLinks(benutzerId: string) {
    run(this.db, 'DELETE FROM passwort_link WHERE benutzer_id = ?', benutzerId);
  }
}

export type PasswortZweck = 'einrichten' | 'zuruecksetzen';

// --- Lehrkräfte ----------------------------------------------------------------------------------------

const toRequester = (r: Row): Requester => ({
  id: str(r.id),
  email: str(r.email),
  createdAt: str(r.angelegt_am),
  lastOrderAt: str(r.letzte_anfrage_am),
  darfAnfragen: r.darf_anfragen == null || bool(r.darf_anfragen),
  darfVorschlagen: r.darf_vorschlagen == null || bool(r.darf_vorschlagen),
});

export class RequesterRepository {
  constructor(
    private readonly db: Db,
    private readonly files: FileStore,
  ) {}

  async list() {
    return all(this.db, 'SELECT * FROM lehrkraft WHERE entfernt_am IS NULL ORDER BY angelegt_am, id').map(toRequester);
  }
  async findById(id: string) {
    const r = one(this.db, 'SELECT * FROM lehrkraft WHERE id = ? AND entfernt_am IS NULL', id);
    return r && toRequester(r);
  }
  async findByEmail(email: string) {
    const r = one(this.db, 'SELECT * FROM lehrkraft WHERE email = ?', email.trim().toLowerCase());
    return r && toRequester(r);
  }
  async count() {
    return count(this.db, 'SELECT COUNT(*) AS n FROM lehrkraft WHERE entfernt_am IS NULL');
  }

  save(r: Requester) {
    if (one(this.db, 'SELECT 1 FROM lehrkraft WHERE email = ? AND id <> ?', r.email, r.id)) {
      throw conflict('Diese E-Mail-Adresse ist bereits als Lehrkraft eingetragen.', { email: 'Bereits vergeben' });
    }
    run(
      this.db,
      `INSERT INTO lehrkraft (id, email, angelegt_am, letzte_anfrage_am, darf_anfragen, darf_vorschlagen) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET email = excluded.email, angelegt_am = excluded.angelegt_am, letzte_anfrage_am = excluded.letzte_anfrage_am,
         darf_anfragen = excluded.darf_anfragen, darf_vorschlagen = excluded.darf_vorschlagen`,
      r.id,
      r.email.trim().toLowerCase(),
      r.createdAt,
      r.lastOrderAt ?? '',
      b(r.darfAnfragen ?? true),
      b(r.darfVorschlagen ?? true),
    );
  }

  async create(entity: Requester) {
    transaction(this.db, () => {
      if (one(this.db, 'SELECT 1 FROM lehrkraft WHERE id = ?', entity.id)) throw conflict('ID bereits vergeben.');
      this.save(entity);
    });
    return (await this.findById(entity.id))!;
  }

  async update(id: string, change: (current: Requester) => Requester) {
    const done = transaction(this.db, () => {
      const r = one(this.db, 'SELECT * FROM lehrkraft WHERE id = ?', id);
      if (!r) return false;
      this.save({ ...change(toRequester(r)), id });
      return true;
    });
    return done ? this.findById(id) : undefined;
  }

  /** Als entfernt markieren (Anfragen behalten ihren Bezug); E-Mail wird frei für eine spätere Neuanmeldung. */
  markRemoved(id: string, at: string) {
    run(
      this.db,
      'UPDATE lehrkraft SET email = ?, darf_anfragen = 0, darf_vorschlagen = 0, entfernt_am = ? WHERE id = ?',
      `entfernt-${id}`,
      at,
      id,
    );
  }

  async delete(id: string) {
    const found = await this.findById(id);
    if (!found) return undefined;
    const removed = transaction(this.db, () => {
      run(this.db, 'DELETE FROM lehrkraft WHERE id = ?', id);
      return this.files.removeRowsFor('lehrkraft', id);
    });
    await this.files.unlink(removed);
    return found;
  }

  async upsertByEmail(email: string, at: string) {
    const normalized = email.trim().toLowerCase();
    const id = transaction(this.db, () => {
      const r = one(this.db, 'SELECT id FROM lehrkraft WHERE email = ?', normalized);
      if (r) {
        run(this.db, 'UPDATE lehrkraft SET letzte_anfrage_am = ? WHERE id = ?', at, r.id);
        return str(r.id);
      }
      const created = newId();
      run(this.db, 'INSERT INTO lehrkraft (id, email, angelegt_am, letzte_anfrage_am) VALUES (?, ?, ?, ?)', created, normalized, at, at);
      return created;
    });
    return (await this.findById(id))!;
  }
}

