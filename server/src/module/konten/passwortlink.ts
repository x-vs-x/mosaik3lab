import crypto from 'node:crypto';
import type { User } from '../../domain/types';
import { readMailConfig } from '../../kern/mail/mailConfig';
import { baseUrl, escapeHtml, sendMail, type BuiltMail } from '../../kern/mail/mailer';
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

export function buildPasswortMail(user: User, zweck: PasswortZweck, url: string, ablaufend: boolean): BuiltMail {
  const einrichten = zweck === 'einrichten';
  const subject = einrichten ? 'Mosaik³LAB: Bitte Passwort festlegen' : 'Mosaik³LAB: Passwort zurücksetzen';
  const intro = einrichten
    ? 'Sie haben in Mosaik³LAB zusätzliche Rechte bekommen. Dafür brauchen Sie ab jetzt ein Passwort. Bitte legen Sie es über diesen Link fest:'
    : 'Für Ihr Konto in Mosaik³LAB wurde ein neues Passwort angefordert. Über diesen Link legen Sie es fest:';
  const gueltig = ablaufend ? 'Der Link gilt 24 Stunden und nur einmal.' : 'Der Link gilt nur einmal.';
  const hinweis = einrichten ? '' : 'Haben Sie das nicht angefordert? Dann können Sie diese Mail ignorieren – Ihr bisheriges Passwort bleibt gültig.';
  const button = einrichten ? 'Passwort festlegen' : 'Neues Passwort festlegen';
  const text = [`Hallo ${user.displayName},`, '', intro, url, '', gueltig, hinweis, '', 'Das Passwort ist frei wählbar, mindestens 8 Zeichen.']
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');
  const p = (s: string) => (s ? `<p style="margin:0 0 14px;font:16px/1.5 Arial,sans-serif;color:#292524">${escapeHtml(s)}</p>` : '');
  const html = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f5f5f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px"><tr><td style="padding:28px">
${p(`Hallo ${user.displayName},`)}${p(intro)}
<p style="margin:20px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 22px;background:#0f766e;color:#ffffff;border-radius:10px;font:bold 16px Arial,sans-serif;text-decoration:none">${button}</a></p>
${p(gueltig)}${p(hinweis)}${p('Das Passwort ist frei wählbar, mindestens 8 Zeichen.')}
<p style="margin:16px 0 0;font:13px/1.5 Arial,sans-serif;color:#78716c">Falls der Knopf nicht funktioniert: ${escapeHtml(url)}</p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}

/**
 * Link anlegen und an die Person schicken. Geht das nicht (Mailversand aus, keine App-Adresse, Fehler),
 * kommt das Token zurück, damit der Administrator den Link weitergeben kann.
 */
export async function linkVerschicken(storage: Storage, user: User, zweck: PasswortZweck, ablaufend = true): Promise<PasswortLinkErgebnis> {
  const token = neuerLink(storage, user, zweck, ablaufend);
  const r = readMailConfig(storage.sqlite.db);
  if (r.state !== 'ok' || !r.config.enabled) return { gesendet: false, token, grund: 'Der Mailversand ist nicht eingerichtet.' };
  const base = baseUrl(r.config.appBaseUrl);
  if (!base) return { gesendet: false, token, grund: 'Im Server-Manager fehlt die Adresse der App für Links in Mails.' };
  try {
    await sendMail(r.config, [user.email], buildPasswortMail(user, zweck, `${base}/passwort#${token}`, ablaufend));
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
