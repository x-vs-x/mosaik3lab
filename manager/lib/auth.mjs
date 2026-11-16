// Anmeldung am Server-Manager = Admin-Konto der App. Ein eigenes Manager-Passwort gibt es nicht.
//   - über die App-Adresse (<pfad>/manager): die Admin-Sitzung der App genügt (Prüfung in remote.mjs, je Anfrage)
//   - direkt am Server (127.0.0.1:<Port>, Notzugang, wenn die App nicht läuft): E-Mail + Passwort eines aktiven
//     Administrators aus der Tabelle „benutzer“ (bcrypt über bcryptjs aus den node_modules der App – der Manager bleibt
//     ohne eigene Abhängigkeiten). Sitzung als HttpOnly-Cookie (SameSite=Strict, 8 h), Login-Bremse.
// Gibt es noch keinen Administrator, legt man ihn direkt am Server an (über das Skript der App, lib/admin.mjs).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getConfig, resolvePaths, InputError, INSTALL } from './config.mjs';
import { checkAdminInput, createAdmin } from './admin.mjs';
import { serviceStatus, startService, stopService } from './services.mjs';

const MAX_AGE_MS = 8 * 3600_000;
const MAX_FAILURES = 5;
const LOCK_MS = 60_000;
const sessions = new Map(); // Sitzungs-ID → gültig bis
let failures = 0;
let lockedUntil = 0;
let dummyHash;

const appDb = () => path.join(resolvePaths().dataDir, 'mosaik3lab.db');

/** Aktive Administratoren der App (Demo-Konten nur, wenn erlaubt); [] ohne Datenbank. */
async function admins(email) {
  if (!fs.existsSync(appDb())) return [];
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(appDb(), { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    // Gleiche Regel wie die App (server/src/config.ts): in der Entwicklung sind Demo-Konten erlaubt,
    // installiert nur mit Schalter.
    const devDemo = !INSTALL && process.env.NODE_ENV !== 'production' && process.env.DISABLE_DEMO_ACCOUNTS !== 'true';
    const demoAllowed = devDemo || getConfig().app.demoAccounts;
    const demo = demoAllowed ? '' : ' AND ist_demo = 0';
    const sql = `SELECT passwort_hash AS hash FROM benutzer WHERE rolle = 'admin' AND aktiv = 1${demo}`;
    return email === undefined ? db.prepare(sql).all() : db.prepare(`${sql} AND lower(email) = lower(?)`).all(email);
  } catch {
    return []; // Tabelle fehlt (App lief noch nie)
  } finally {
    db.close();
  }
}

/** bcryptjs der App (Programmordner/node_modules). */
function bcrypt() {
  try {
    return createRequire(path.join(resolvePaths().programDir, 'server', 'package.json'))('bcryptjs');
  } catch {
    throw new InputError('Anmeldung nicht möglich: die Programmdateien der App fehlen (node_modules).', 'Im Programmordner „npm ci“ ausführen.');
  }
}

const sessionId = (req) => /(?:^|;\s*)m3m\.sid=([a-f0-9]{64})/.exec(req.headers.cookie ?? '')?.[1];
const COOKIE = 'HttpOnly; SameSite=Strict; Path=/';

/** Direkt am Server angemeldet? (Über die App-Adresse entscheidet die App-Sitzung, siehe server.mjs.) */
export function isLoggedIn(req) {
  const id = sessionId(req);
  const until = id && sessions.get(id);
  if (!(until > Date.now())) return false;
  sessions.set(id, Date.now() + MAX_AGE_MS);
  return true;
}

function startSession(res) {
  const id = crypto.randomBytes(32).toString('hex');
  sessions.set(id, Date.now() + MAX_AGE_MS);
  res.setHeader('Set-Cookie', `m3m.sid=${id}; ${COOKIE}; Max-Age=${MAX_AGE_MS / 1000}`);
}

/** { loggedIn, remote, needsAdmin } – needsAdmin: es gibt noch keinen Administrator (nur direkt am Server). */
export async function authStatus(req, remote = null) {
  const managerPort = getConfig().manager.port; // für den Hinweis auf den Notzugang (auch in der App)
  if (remote) return { loggedIn: true, remote: true, needsAdmin: false, managerPort };
  return { loggedIn: isLoggedIn(req), remote: false, needsAdmin: !(await admins()).length, managerPort };
}

const tooMany = (ms) => Object.assign(new InputError(`Zu viele Fehlversuche – bitte ${Math.ceil(ms / 1000)} s warten.`), { status: 429 });

/** Anmelden mit E-Mail + Passwort eines Administrators der App. 5 Fehlversuche → 60 s Sperre. */
export async function login(email, password, res) {
  if (Date.now() < lockedUntil) throw tooMany(lockedUntil - Date.now());
  const found = typeof email === 'string' && typeof password === 'string' ? await admins(email.trim()) : [];
  const lib = bcrypt();
  let ok = false;
  for (const a of found) if (await lib.compare(password, a.hash)) ok = true;
  // Unbekannte E-Mail kostet gleich viel Zeit wie ein falsches Passwort (verrät nicht, welche Adressen Admins sind).
  if (!found.length) await lib.compare(String(password), (dummyHash ??= lib.hashSync('mosaik3lab-dummy-password', 12)));
  if (!ok) {
    if (++failures >= MAX_FAILURES) [failures, lockedUntil] = [0, Date.now() + LOCK_MS];
    throw Object.assign(new InputError('E-Mail oder Passwort ist falsch (Administrator-Konto der App).'), { status: 401 });
  }
  failures = 0;
  startSession(res);
  return { ok: true };
}

/** Erster Administrator (nur solange es keinen gibt, nur direkt am Server) – danach angemeldet. */
export async function firstAdmin(input, res) {
  if ((await admins()).length) throw new InputError('Es gibt bereits einen Administrator – bitte anmelden.');
  const p = resolvePaths();
  checkAdminInput(input);
  // Das Anlegen braucht den Datenbestand allein (Sperre der App) → laufende Web-App kurz anhalten und danach wieder starten
  const running = (await serviceStatus('webapp')).running;
  if (running) await stopService('webapp');
  try {
    await createAdmin({ programDir: p.programDir, dataDir: p.dataDir, ablageDir: p.ablageDir, email: input.email, name: input.name, password: input.password });
  } finally {
    if (running) await startService('webapp');
  }
  startSession(res);
  return { ok: true };
}

export function logout(req, res) {
  sessions.delete(sessionId(req));
  res.setHeader('Set-Cookie', `m3m.sid=; ${COOKIE}; Max-Age=0`);
  return { ok: true };
}
