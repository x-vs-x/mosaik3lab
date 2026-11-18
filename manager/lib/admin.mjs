// Erstes Administrator-Konto: legt es über das App-Skript „user:create-admin“ an (Passwort nur über die Umgebung, nie als Argument)
// und prüft für den doctor, ob es einen aktiven Administrator gibt.
import fs from 'node:fs';
import path from 'node:path';
import { run } from '../platform/common.mjs';
import { InputError } from './config.mjs';
import { appArgs } from './appstart.mjs';

/** Zahl aktiver Administrator-Konten; null = keine Datenbank (oder nicht lesbar). */
export async function activeAdminCount(dbFile) {
  if (!fs.existsSync(dbFile)) return null;
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbFile, { readOnly: true });
    try {
      db.exec('PRAGMA busy_timeout = 5000');
      return db.prepare("SELECT COUNT(*) AS n FROM benutzer WHERE rolle = 'admin' AND aktiv = 1").get().n;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

// Gleich wie in shared/src/einstellungen.ts (emailDomainSchema) – der Manager ist reines .mjs (Test: abgleich-app.test.mjs)
export const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/;
/** Schul-Domain (nur der Teil nach dem @) wie in shared/src/einstellungen.ts (emailDomainSchema). '' = ungültig. */
export function normalizeDomain(d) {
  const v = String(d ?? '').trim().toLowerCase().replace(/^@/, '');
  return DOMAIN_RE.test(v) ? v : '';
}

/** { email, name, password, schulDomain? } prüfen, bevor etwas passiert (die App prüft zusätzlich). */
export function checkAdminInput(a) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a?.email ?? '')) throw new InputError('Bitte eine gültige E-Mail-Adresse für das Admin-Konto angeben.');
  if ((a.name ?? '').trim().length < 2) throw new InputError('Bitte einen Namen für das Admin-Konto angeben (mindestens 2 Zeichen).');
  if ((a.password ?? '').length < 8) throw new InputError('Das Admin-Passwort braucht mindestens 8 Zeichen.');
  if (a.schulDomain !== undefined && a.schulDomain !== '' && !normalizeDomain(a.schulDomain)) throw new InputError('Ungültige Domain der Schule – nur der Teil nach dem @, z. B. schule.example.');
}

/**
 * Legt den Administrator an. programDir: Ordner mit server/, dataDir: Datenordner der App (STORAGE_DIR).
 * schulDomain (optional): erlaubte E-Mail-Domain bei einer neuen Installation – sonst übernimmt die App die Domain der Adresse.
 */
export async function createAdmin({ programDir, dataDir, ablageDir, email, name, password, schulDomain }) {
  checkAdminInput({ email, name, password, schulDomain });
  const serverDir = path.join(programDir, 'server');
  const env = { ...process.env, STORAGE_DIR: dataDir, M3L_ADMIN_PASSWORD: password };
  if (ablageDir) env.ABLAGE_DIR = ablageDir;
  delete env.MANAGER_CONFIG;
  const domain = normalizeDomain(schulDomain);
  const args = ['--email', email, '--name', name, ...(domain ? ['--domain', domain] : [])];
  const r = await run(process.execPath, appArgs(programDir, 'create-admin', args), { cwd: serverDir, env, timeout: 120_000 });
  const line = (r.stdout || '').trim().split(/\r?\n/).pop() ?? '';
  if (r.code !== 0 || !line.startsWith('OK')) throw new InputError(`Admin-Konto konnte nicht angelegt werden: ${line.replace(/^FEHLER: /, '') || r.stderr || 'keine Ausgabe'}`, 'Eingaben prüfen und „Einrichten“ erneut starten (bereits erledigte Schritte werden übersprungen).');
  return line;
}
