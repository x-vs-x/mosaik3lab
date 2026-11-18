import session from 'express-session';
import type { SessionRepository } from './sitzungen';

type Callback = (err?: unknown, value?: unknown) => void;

/** Adapter: express-session ↔ SessionRepository (Tabelle sitzung). */
export class RepositorySessionStore extends session.Store {
  private readonly pruneTimer: NodeJS.Timeout;

  constructor(
    private readonly repo: SessionRepository,
    private readonly defaultMaxAgeMs: number,
  ) {
    super();
    this.pruneTimer = setInterval(() => repo.pruneExpired().catch((err: Error) => console.warn(`[Sitzungen] Aufräumen fehlgeschlagen: ${err.message}`)), 15 * 60 * 1000);
    this.pruneTimer.unref();
  }

  private expiry(sess: session.SessionData) {
    const expires = sess.cookie?.expires;
    return expires ? new Date(expires).getTime() : Date.now() + this.defaultMaxAgeMs;
  }

  override get(sid: string, cb: (err: unknown, session?: session.SessionData | null) => void) {
    this.repo
      .get(sid)
      .then((s) => cb(null, s ? (s.data as unknown as session.SessionData) : null))
      .catch(cb);
  }

  override set(sid: string, sess: session.SessionData, cb?: Callback) {
    this.repo
      .set(sid, { data: JSON.parse(JSON.stringify(sess)), expiresAt: this.expiry(sess) })
      .then(() => cb?.())
      .catch((e) => cb?.(e));
  }

  override touch(sid: string, sess: session.SessionData, cb?: Callback) {
    this.repo
      .touch(sid, this.expiry(sess))
      .then(() => cb?.())
      .catch((e) => cb?.(e));
  }

  override destroy(sid: string, cb?: Callback) {
    this.repo
      .destroy(sid)
      .then(() => cb?.())
      .catch((e) => cb?.(e));
  }

  stop() {
    clearInterval(this.pruneTimer);
  }
}
