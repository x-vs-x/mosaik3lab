import { json, run, one, type Db } from '../db';

// Sitzungen der Anmeldung (Tabelle sitzung). Adapter für express-session: sessionStore.ts.

export interface StoredSession {
  data: Record<string, unknown>;
  expiresAt: number;
}

export class SessionRepository {
  constructor(private readonly db: Db) {}

  async get(sid: string) {
    const r = one(this.db, 'SELECT daten, laeuft_ab FROM sitzung WHERE id = ?', sid);
    if (!r) return undefined;
    if (Number(r.laeuft_ab) < Date.now()) {
      await this.destroy(sid);
      return undefined;
    }
    return { data: json<Record<string, unknown>>(r.daten, {}), expiresAt: Number(r.laeuft_ab) } satisfies StoredSession;
  }

  async set(sid: string, s: StoredSession) {
    run(
      this.db,
      'INSERT INTO sitzung (id, daten, laeuft_ab, benutzer_id) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET daten = excluded.daten, laeuft_ab = excluded.laeuft_ab, benutzer_id = excluded.benutzer_id',
      sid,
      JSON.stringify(s.data),
      Math.round(s.expiresAt),
      typeof s.data.userId === 'string' ? s.data.userId : null,
    );
  }

  async touch(sid: string, expiresAt: number) {
    run(this.db, 'UPDATE sitzung SET laeuft_ab = ? WHERE id = ?', Math.round(expiresAt), sid);
  }

  async destroy(sid: string) {
    run(this.db, 'DELETE FROM sitzung WHERE id = ?', sid);
  }

  async destroyForUser(userId: string, exceptSid?: string) {
    return Number(run(this.db, 'DELETE FROM sitzung WHERE benutzer_id = ? AND id IS NOT ?', userId, exceptSid ?? null).changes);
  }

  async pruneExpired(now = Date.now()) {
    return Number(run(this.db, 'DELETE FROM sitzung WHERE laeuft_ab < ?', now).changes);
  }
}

