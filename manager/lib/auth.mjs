// Anmeldung am Server-Manager = Admin-Konto der App. Ein eigenes Manager-Passwort gibt es nicht.
//   - über die App-Adresse (<pfad>/manager): die Admin-Sitzung der App genügt (Prüfung in remote.mjs, je Anfrage)
//   - direkt am Server (127.0.0.1:<Port>, Notzugang, wenn die App nicht läuft): E-Mail + Passwort eines aktiven
//     Administrators aus der Tabelle „benutzer“ (bcrypt über bcryptjs aus den node_modules der App – der Manager bleibt
//     ohne eigene Abhängigkeiten). Sitzung als HttpOnly-Cookie (SameSite=Strict, 8 h), Login-Bremse.
// Gibt es noch keinen Administrator, legt man ihn beim ersten Öffnen an (über das Skript der App, lib/admin.mjs):
// direkt am Server und über das Schulnetz (wer die Seite nach der Installation zuerst öffnet, legt ihn an).
import crypto from 'node:crypto';
import fs from 'node:fs';
import { appBcrypt } from './appstart.mjs';
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

const appDb = () => resolvePaths().dbFile;

/**
 * Aktive Administratoren der App (Demo-Konten nur, wenn erlaubt); [] ohne Datenbank bzw. ohne Tabelle „benutzer“.
 * strict: jeder andere Lesefehler (gesperrt, beschädigt) wird geworfen statt als „keine Administratoren“ gewertet.
 */
async function admins(email, strict = false) {
  if (!fs.existsSync(appDb())) return [];
  const { DatabaseSync } = await import('node:sqlite');
  let db;
  try {
    db = new DatabaseSync(appDb(), { readOnly: true });
  } catch (err) {
    if (strict) throw err;
    return [];
  }
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    // Gleiche Regel wie die App (server/src/config.ts): in der Entwicklung sind Demo-Konten erlaubt,
    // installiert nur mit Schalter.
    const devDemo = !INSTALL && process.env.NODE_ENV !== 'production' && process.env.DISABLE_DEMO_ACCOUNTS !== 'true';
    const demoAllowed = devDemo || getConfig().app.demoAccounts;
    const demo = demoAllowed ? '' : ' AND ist_demo = 0';
    const sql = `SELECT passwort_hash AS hash FROM benutzer WHERE rolle = 'admin' AND aktiv = 1${demo}`;
    return email === undefined ? db.prepare(sql).all() : db.prepare(`${sql} AND lower(email) = lower(?)`).all(email);
  } catch (err) {
    if (strict && !/no such table: benutzer/.test(err.message)) throw err;
    return []; // Tabelle fehlt (App lief noch nie)
  } finally {
    db.close();
  }
}

/** bcryptjs der App (node_modules bzw. Bündel im Installer-Paket). */
function bcrypt() {
  try {
    return appBcrypt(resolvePaths().programDir);
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

/**
 * Gibt es noch keinen aktiven Administrator? Nur dann ist die Ersteinrichtung offen (direkt und über das Netz).
 * Bei jedem Lesefehler bleibt sie zu – eine gesperrte oder beschädigte Datenbank öffnet sie nie.
 */
export async function needsAdmin() {
  try {
    return !(await admins(undefined, true)).length;
  } catch {
    return false;
  }
}
let creating = false; // gleichzeitige Anfragen legen nie zwei „erste“ Administratoren an

/**
 * { loggedIn, remote, needsAdmin, managerPort } – über das Netz zusätzlich { appBase }, solange es noch
 * keinen Administrator gibt (sonst kommt man dort nur mit Admin-Sitzung der App hin, siehe server.mjs).
 */
export async function authStatus(req, remote = null) {
  const managerPort = getConfig().manager.port; // für den Hinweis auf den Notzugang (auch in der App)
  const open = await needsAdmin();
  if (remote) return open ? { loggedIn: false, remote: true, needsAdmin: true, appBase: remote.appBase, managerPort } : { loggedIn: true, remote: true, needsAdmin: false, managerPort };
  return { loggedIn: isLoggedIn(req), remote: false, needsAdmin: open, managerPort };
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

/**
 * Erster Administrator (nur solange es keinen gibt). Direkt am Server: danach im Manager angemeldet.
 * Über das Netz (remote): danach meldet sich der Browser selbst in der App an (gleiches Konto) – dann gilt die
 * Admin-Sitzung der App. Sobald ein Administrator existiert, ist dieser Weg geschlossen.
 */
export async function firstAdmin(input, res, remote = null) {
  if (!(await needsAdmin())) throw new InputError('Es gibt bereits einen Administrator – bitte anmelden.');
  const p = resolvePaths();
  checkAdminInput(input);
  if (creating) throw Object.assign(new InputError('Der Administrator wird gerade angelegt – bitte kurz warten.'), { status: 409 });
  creating = true;
  try {
    // Das Anlegen braucht den Datenbestand allein (Sperre der App) → laufende Web-App kurz anhalten und danach wieder starten
    const running = (await serviceStatus('webapp')).running;
    if (running) await stopService('webapp');
    try {
      await createAdmin({ programDir: p.programDir, dataDir: p.dataDir, ablageDir: p.ablageDir, email: input.email, name: input.name, password: input.password, schulDomain: input.schulDomain });
    } finally {
      if (running) await startService('webapp');
    }
  } finally {
    creating = false;
  }
  if (!remote) startSession(res);
  return { ok: true };
}

export function logout(req, res) {
  sessions.delete(sessionId(req));
  res.setHeader('Set-Cookie', `m3m.sid=; ${COOKIE}; Max-Age=0`);
  return { ok: true };
}
