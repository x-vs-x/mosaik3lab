import crypto from 'node:crypto';
import type { User } from '../../domain/types';
import { readMailConfig } from '../../kern/mail/mailConfig';
import { linksNurImSchulnetz } from '../../kern/mail/erreichbarkeit';
import { baseUrl, sendMail, type BuiltMail } from '../../kern/mail/mailer';
import { button, FOOTER_KONTO, para, renderLayout, schulnetzText, small, textFooter } from '../../kern/mail/layout';
import { hashPassword } from '../../kern/auth/password';
import { notFound } from '../../kern/errors';
import type { Storage } from '../../storage';
import type { PasswortLinkErgebnis } from '@mosaik3lab/shared/konten';
import type { PasswortZweck } from './konten.repository';

// Einmal-Links zum Festlegen bzw. Zurücksetzen des Passworts (…/passwort#<token>).
// Gespeichert wird nur der SHA-256 des Tokens; ein neuer Link macht ältere Links desselben Kontos ungültig.
// „Passwort festlegen“ (nach dem Vergeben von Rechten) und Links vom Administrator laufen nicht ab;
// Links aus „Passwort vergessen?“ und nach der Sperre gelten 24 Stunden.

const SELBST_GUELTIG_MS = 24 * 60 * 60 * 1000;

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** Neuen Link anlegen; `ablaufend` = 24 Stunden gültig (selbst angefordert), sonst unbegrenzt bis zur Nutzung. */
export function neuerLink(storage: Storage, user: User, zweck: PasswortZweck, ablaufend: boolean) {
  const token = crypto.randomBytes(32).toString('base64url');
  const gueltigBis = ablaufend ? new Date(Date.now() + SELBST_GUELTIG_MS).toISOString() : null;
  storage.users.saveLink(user.id, hashToken(token), zweck, gueltigBis);
  return token;
}

/** Anlass eines Links zum Zurücksetzen: selbst angefordert/vom Administrator oder nach der Sperre. */
export type PasswortAnlass = 'angefordert' | 'gesperrt';

export function buildPasswortMail(user: User, zweck: PasswortZweck, url: string, ablaufend: boolean, anlass: PasswortAnlass = 'angefordert', nurSchulnetz = false): BuiltMail {
  const einrichten = zweck === 'einrichten';
  const subject = einrichten ? 'Mosaik³LAB: Passwort festlegen' : 'Mosaik³LAB: Passwort zurücksetzen';
  const heading = einrichten ? 'Passwort festlegen' : 'Neues Passwort festlegen';
  const intro = einrichten
    ? 'Sie haben in Mosaik³LAB zusätzliche Rechte bekommen. Dafür brauchen Sie ab jetzt ein Passwort.'
    : anlass === 'gesperrt'
      ? 'Ihr Konto wurde nach zu vielen falschen Passwörtern für eine Stunde gesperrt. Mit einem neuen Passwort geht es sofort wieder.'
      : 'Für Ihr Konto wurde ein neues Passwort angefordert.';
  const gueltig = `${ablaufend ? 'Der Link gilt 24 Stunden und nur einmal.' : 'Der Link gilt nur einmal.'} Das Passwort ist frei wählbar, mindestens 8 Zeichen.`;
  const hinweis = einrichten
    ? ''
    : anlass === 'gesperrt'
      ? 'Waren das nicht Sie? Dann legen Sie am besten jetzt ein neues Passwort fest.'
      : 'Nicht angefordert? Dann ignorieren Sie diese Mail – Ihr bisheriges Passwort bleibt gültig.';
  const hallo = `Hallo ${user.displayName},`;
  const text = [hallo, '', intro, '', `${heading}:`, url, ...schulnetzText(nurSchulnetz), '', gueltig, hinweis, '', textFooter(FOOTER_KONTO)]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');
  const html = renderLayout({
    title: subject,
    preheader: einrichten ? 'Legen Sie Ihr Passwort für Mosaik³LAB fest.' : intro,
    heading,
    contentHtml: para(hallo) + para(intro) + button(heading, url, nurSchulnetz) + small(gueltig) + small(hinweis),
    footer: FOOTER_KONTO,
  });
  return { subject, text, html };
}

/**
 * Link anlegen und an die Person schicken. Geht das nicht (Mailversand aus, keine App-Adresse, Fehler),
 * kommt das Token zurück, damit der Administrator den Link weitergeben kann.
 */
export async function linkVerschicken(
  storage: Storage,
  user: User,
  zweck: PasswortZweck,
  ablaufend = true,
  anlass: PasswortAnlass = 'angefordert',
): Promise<PasswortLinkErgebnis> {
  const token = neuerLink(storage, user, zweck, ablaufend);
  const r = readMailConfig(storage.sqlite.db);
  if (r.state !== 'ok' || !r.config.enabled) return { gesendet: false, token, grund: 'Der Mailversand ist nicht eingerichtet.' };
  const base = baseUrl(r.config.appBaseUrl);
  if (!base) return { gesendet: false, token, grund: 'Im Server-Manager fehlt die Adresse der App für Links in Mails.' };
  try {
    await sendMail(r.config, [user.email], buildPasswortMail(user, zweck, `${base}/passwort#${token}`, ablaufend, anlass, linksNurImSchulnetz(r.config)));
    return { gesendet: true };
  } catch (err) {
    console.warn('[Mail] Passwort-Link an', user.email, 'nicht gesendet:', (err as Error).message);
    return { gesendet: false, token, grund: `Die Mail konnte nicht gesendet werden (${(err as Error).message}).` };
  }
}

/** Gültiger Link → Konto. Abgelaufene Links werden dabei entfernt. */
async function kontoZumLink(storage: Storage, token: string) {
  const link = storage.users.findLink(hashToken(token));
  const ungueltig = notFound('Dieser Link ist ungültig oder wurde schon benutzt. Bitte einen neuen Link anfordern.');
  if (!link) throw ungueltig;
  const user = await storage.users.findById(link.benutzerId);
  if (link.gueltigBis && link.gueltigBis < new Date().toISOString()) {
    storage.users.deleteLinks(link.benutzerId);
    throw notFound('Dieser Link ist abgelaufen. Bitte einen neuen Link anfordern.');
  }
  if (!user || !user.active || user.role === 'lehrkraft') throw ungueltig;
  return { user, zweck: link.zweck };
}

/** Für die Seite „Passwort festlegen“: Für wen ist der Link? */
export async function linkInfo(storage: Storage, token: string) {
  const { user, zweck } = await kontoZumLink(storage, token);
  return { email: user.email, name: user.displayName, zweck };
}

/** Passwort über den Link festlegen: Sperre aufheben, Link verbrauchen, alle anderen Sitzungen beenden. */
export async function passwortSetzen(storage: Storage, token: string, password: string) {
  const { user } = await kontoZumLink(storage, token);
  // Prüfen und Verbrauchen ohne await dazwischen: Von zwei gleichzeitigen Anfragen mit demselben Link kommt nur eine durch.
  if (!storage.users.findLink(hashToken(token))) throw notFound('Dieser Link ist ungültig oder wurde schon benutzt. Bitte einen neuen Link anfordern.');
  storage.users.deleteLinks(user.id);
  const passwordHash = await hashPassword(password);
  await storage.sessions.destroyForUser(user.id);
  return (await storage.users.update(user.id, (u) => ({ ...u, passwordHash, fehlversuche: 0, updatedAt: new Date().toISOString() })))!;
}
