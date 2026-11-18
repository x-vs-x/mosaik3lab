import { newId } from '../../kern/ids';
import { type Permission } from '@mosaik3lab/shared/konten';
import { isAllowedEmail } from '../einstellungen/einstellungen.vorgaben';
import { type SessionAntwort, type SessionUser } from '@mosaik3lab/shared/konten';
import { type User } from '../../domain/types';
import { canUseAccount, type AuthOptions } from '../../kern/auth/middleware';
import { hashPassword, verifyPassword } from '../../kern/auth/password';
import { badRequest, conflict, forbidden, unauthorized } from '../../kern/errors';
import type { Storage } from '../../storage';
import { emailDomainSchema } from '@mosaik3lab/shared/einstellungen';
import { adminCreateSchema, istGesperrt, MAX_FEHLVERSUCHE } from '@mosaik3lab/shared/konten';
import { schulDomainUebernehmen } from '../einstellungen/einstellungen.service';
import { linkVerschicken } from './passwortlink';

// Regeln für die Anmeldung (Konten mit Passwort, Lehrkräfte per E-Mail), eigenes Passwort und das erste Admin-Konto.
// Personen und Rechte: personen.service.ts, Passwort-Links: passwortlink.ts.

export function sessionPayload(user: SessionUser, permissions: Permission[]): SessionAntwort {
  return { user, permissions };
}

/** Konto, das sich mit Passwort anmeldet (aktiv, Passwort festgelegt). Sonst meldet sich die Adresse als Lehrkraft an. */
export async function findAccount(storage: Storage, email: string) {
  const user = await storage.users.findByEmail(email);
  return user && user.active && user.role !== 'lehrkraft' && user.passwordHash !== '' ? user : undefined;
}

/**
 * „Jetzt Konto anlegen“ für eine unbekannte E-Mail: legt nur eine Lehrkraft (Besteller-Verzeichnis) an.
 * Nur erlaubte Schul-Domains; Konten für Admin/Druck-Team entstehen hier nie.
 */
export async function registerRequester(storage: Storage, email: string) {
  const { orderForm } = await storage.settings.get();
  if (!isAllowedEmail(email, orderForm.allowedEmailDomains)) {
    const list = orderForm.allowedEmailDomains.map((d) => `@${d}`).join(' oder ');
    throw badRequest(`Bitte Ihre Schul-E-Mail-Adresse (${list}) verwenden.`, { email: `Nur Adressen mit ${list}` });
  }
  if (await findAccount(storage, email)) {
    throw conflict('Zu dieser Adresse gibt es bereits ein Konto mit Passwort. Bitte normal anmelden.');
  }
  return (await storage.requesters.findByEmail(email)) ?? createRequester(storage, email);
}

/** Neuer Eintrag im Lehrkräfte-Verzeichnis (beide Häkchen an). lastOrderAt bleibt leer bis zur ersten Anfrage. */
export function createRequester(storage: Storage, email: string) {
  return storage.requesters.create({ id: newId(), email, createdAt: new Date().toISOString(), lastOrderAt: '', darfAnfragen: true, darfVorschlagen: true });
}

const GESPERRT_OHNE_MAIL = 'Das Konto ist nach zu vielen falschen Passwörtern für eine Stunde gesperrt. Bitte in einer Stunde erneut versuchen oder an die Administration wenden.';
const GESPERRT = 'Das Konto ist nach zu vielen falschen Passwörtern für eine Stunde gesperrt. Wir haben eine E-Mail mit einem Link zum Zurücksetzen geschickt – damit geht es sofort wieder. Keine Mail bekommen? In einer Stunde erneut versuchen oder an die Administration wenden.';
// Bei späteren Versuchen wissen wir nicht mehr, ob beim Sperren eine Mail ging – deshalb neutral.
const SCHON_GESPERRT = 'Das Konto ist nach zu vielen falschen Passwörtern für eine Stunde gesperrt. Falls Sie eine E-Mail mit einem Link zum Zurücksetzen bekommen haben, geht es damit sofort wieder. Sonst in einer Stunde erneut versuchen oder an die Administration wenden.';

/**
 * Prüft E-Mail + Passwort eines Kontos. Falsche Eingaben werden je Konto gezählt; ab MAX_FEHLVERSUCHE ist das Konto
 * für SPERRE_MS gesperrt – oder bis über den Link aus der Mail ein neues Passwort festgelegt wird.
 */
export async function checkLogin(storage: Storage, email: string, password: string, opts: AuthOptions) {
  const user = await findAccount(storage, email);
  if (user && istGesperrt(user)) throw forbidden(SCHON_GESPERRT);
  const valid = await verifyPassword(password, user?.passwordHash);
  if (!user) throw unauthorized('E-Mail oder Passwort ist falsch.');
  if (!valid) {
    // Zählen im update-Callback aus dem aktuellen Stand – gleichzeitige Fehlversuche (bcrypt dauert) zählen so alle.
    let gesperrtVonMir = false;
    const next = await storage.users.update(user.id, (u) => {
      if (istGesperrt(u)) return u; // inzwischen von einem parallelen Versuch gesperrt: Sperre nicht anfassen
      // Abgelaufene Sperre: Zählung beginnt von vorn.
      const fehlversuche = (u.fehlversuche >= MAX_FEHLVERSUCHE ? 0 : u.fehlversuche) + 1;
      gesperrtVonMir = fehlversuche >= MAX_FEHLVERSUCHE;
      return { ...u, fehlversuche, gesperrtSeit: gesperrtVonMir ? new Date().toISOString() : null };
    });
    if (gesperrtVonMir) {
      const r = await linkVerschicken(storage, user, 'zuruecksetzen', true, 'gesperrt');
      if (!r.gesendet) console.warn(`[Anmeldung] ${user.email} gesperrt, Mail nicht gesendet: ${r.grund}`);
      throw forbidden(r.gesendet ? GESPERRT : GESPERRT_OHNE_MAIL);
    }
    if (next && istGesperrt(next)) throw forbidden(SCHON_GESPERRT);
    const rest = MAX_FEHLVERSUCHE - (next?.fehlversuche ?? 0);
    throw unauthorized(`E-Mail oder Passwort ist falsch.${rest <= 3 ? ` Noch ${rest} ${rest === 1 ? 'Versuch' : 'Versuche'}, dann wird das Konto gesperrt.` : ''}`);
  }
  if (!canUseAccount(user, opts)) throw forbidden('Demo-Zugänge sind in dieser Umgebung deaktiviert.');
  return user;
}

export async function recordLogin(storage: Storage, user: User) {
  return (await storage.users.update(user.id, (u) => ({ ...u, fehlversuche: 0, gesperrtSeit: null, lastLoginAt: new Date().toISOString() }))) ?? user;
}

/** Eigenes Passwort ändern; andere Sitzungen des Kontos enden (gestohlene Cookies verlieren ihre Gültigkeit). */
export async function changeOwnPassword(storage: Storage, user: User, currentPassword: string, newPassword: string, keepSid: string) {
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw badRequest('Das aktuelle Passwort ist falsch.', { currentPassword: 'Falsches Passwort' });
  }
  const passwordHash = await hashPassword(newPassword);
  await storage.users.update(user.id, (u) => ({ ...u, passwordHash, fehlversuche: 0, updatedAt: new Date().toISOString() }));
  await storage.sessions.destroyForUser(user.id, keepSid);
}

// --- Konten anlegen ----------------------------------------------------------------------------------------

/** Benutzername aus der E-Mail-Adresse (Teil vor dem @), eindeutig durch angehängte Zahl. */
export async function freeUsername(storage: Storage, email: string): Promise<string> {
  const base = (email.split('@')[0] ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '').padEnd(3, '0').slice(0, 28);
  for (let n = 0; ; n++) {
    const name = n === 0 ? base : `${base}${n}`;
    if (!(await storage.users.findByUsername(name))) return name;
  }
}

/**
 * Legt ein Administrator-Konto an (Ersteinrichtung über Server-Manager / Skript user:create-admin).
 * Passwort frei wählbar, mindestens 8 Zeichen.
 * Erster Administrator einer neuen Installation: die erlaubte E-Mail-Domain wird auf schulDomain gesetzt (fehlt sie,
 * auf die Domain seiner Adresse) – nur, solange die Anfrage-Einstellungen noch nie gespeichert wurden.
 */
export async function createAdminAccount(storage: Storage, input: { email: string; name: string; password: string; schulDomain?: string }) {
  const parsed = adminCreateSchema.parse({ email: input.email, displayName: input.name, password: input.password });
  // Eine ausdrücklich angegebene Domain muss gültig sein; die aus der Adresse wird nur übernommen, wenn sie passt.
  const domain = input.schulDomain
    ? emailDomainSchema.parse(input.schulDomain)
    : emailDomainSchema.safeParse(parsed.email.split('@')[1] ?? '').data;
  if (await storage.users.findByEmail(parsed.email)) throw new Error(`Es gibt bereits ein Konto mit der E-Mail ${parsed.email}.`);
  const ersterAdmin = !(await storage.users.list()).some((u) => u.role === 'admin' && u.active);
  const now = new Date().toISOString();
  const user = await storage.users.create({
    id: newId(),
    username: await freeUsername(storage, parsed.email),
    email: parsed.email,
    displayName: parsed.displayName,
    role: 'admin',
    passwordHash: await hashPassword(parsed.password),
    active: true,
    isDemo: false,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    teamBereiche: [],
    fehlversuche: 0,
  });
  if (ersterAdmin && domain) await schulDomainUebernehmen(storage, domain);
  return user;
}
