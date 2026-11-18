import { z } from 'zod';
import { getBereich, hatBereich, setBetrieb } from '../betrieb';
import type { Db } from '../db';
import { ERREICHBARKEIT } from './erreichbarkeit';

// Mail-Konfiguration in der Datenbank (Tabelle betrieb_einstellung, Bereich „mail“, Migration 006) – gepflegt
// ausschließlich im Server-Manager. Die App liest sie nur (bei jedem Versand, ohne Neustart).
// Schlüssel: enabled, smtp { host, port, secure, user, pass }, from, recipients[], appBaseUrl, erreichbarkeit.
// Einmalige Übernahme alter Dateien (config/mail.json, settings.json → mail): uebernahme/betriebsdateien.ts.

const isEmail = (v: string) => z.string().email().safeParse(v).success;
/** „name@schule.example“ oder „Mosaik³LAB <name@schule.example>“ */
const senderAddress = (v: string) => isEmail(v.match(/<([^<>]+)>\s*$/)?.[1] ?? v);

export const mailConfigSchema = z
  .object({
    enabled: z.boolean(),
    smtp: z.object({
      host: z.string().trim().max(200),
      port: z.number().int().min(1).max(65535),
      /** true = TLS ab Verbindungsbeginn (meist 465), false = STARTTLS/unverschlüsselt (587/25). */
      secure: z.boolean(),
      user: z.string().trim().max(200).default(''),
      pass: z.string().max(500).default(''),
    }),
    from: z.string().trim().max(200).refine((v) => !v || senderAddress(v), 'Ungültige Absenderadresse'),
    recipients: z
      .array(z.string().trim().max(200).refine(isEmail, 'Ungültige Empfängeradresse'))
      .max(20)
      // Dubletten (ohne Groß-/Kleinschreibung) entfernen, erste Schreibweise bleibt
      .transform((l) => l.filter((a, i) => l.findIndex((b) => b.toLowerCase() === a.toLowerCase()) === i)),
    /** Adresse der App für Links in Mails, z. B. https://mosaik3lab.schule.example */
    appBaseUrl: z
      .string()
      .trim()
      .max(300)
      .refine((v) => !v || /^https?:\/\/[^\s"'<>]+$/i.test(v), 'appBaseUrl braucht http:// oder https://')
      .transform((v) => v.replace(/\/+$/, ''))
      .default(''),
    /** Links nur im Schulnetz erreichbar? auto = aus appBaseUrl erkennen (siehe erreichbarkeit.ts). Unbekannte Werte = auto, nie Versand aus. */
    erreichbarkeit: z.enum(ERREICHBARKEIT).default('auto').catch('auto'),
  })
  .superRefine((m, ctx) => {
    if (!m.enabled) return;
    if (!m.smtp.host) ctx.addIssue({ code: 'custom', path: ['smtp', 'host'], message: 'Kein SMTP-Server eingetragen' });
    if (!m.from) ctx.addIssue({ code: 'custom', path: ['from'], message: 'Keine Absenderadresse eingetragen' });
    if (!m.recipients.length) ctx.addIssue({ code: 'custom', path: ['recipients'], message: 'Keine Empfängeradresse eingetragen' });
  });

export type MailConfig = z.infer<typeof mailConfigSchema>;

export type MailConfigResult =
  | { state: 'missing' }
  | { state: 'invalid'; error: string }
  | { state: 'ok'; config: MailConfig };

function describeError(err: unknown) {
  if (err instanceof z.ZodError) {
    return err.issues.map((i) => `${i.path.join('.') || 'Mail'}: ${i.message}`).join('; ');
  }
  return (err as Error).message;
}

const warned = new Set<string>();

/**
 * Liest die Mail-Einstellungen aus der Datenbank. Gibt es keine oder sind sie ungültig, ist der Versand aus
 * (mit Logeintrag) – die App läuft trotzdem. Änderungen wirken sofort, ohne Neustart.
 */
export function readMailConfig(db: Db): MailConfigResult {
  if (!hatBereich(db, 'mail')) return { state: 'missing' };
  try {
    return { state: 'ok', config: mailConfigSchema.parse(getBereich(db, 'mail')) };
  } catch (err) {
    const error = describeError(err);
    if (!warned.has(error)) {
      warned.add(error);
      console.warn(`[Mail] Mail-Einstellungen sind ungültig – Mailversand aus: ${error}`);
    }
    return { state: 'invalid', error };
  }
}

/** Lesbarer Zustand für die Verwaltung – ohne Server, Benutzer oder Passwort. */
export function mailConfigInfo(db: Db) {
  const r = readMailConfig(db);
  if (r.state === 'missing') return { state: 'missing' as const, recipients: 0, error: '' };
  if (r.state === 'invalid') return { state: 'invalid' as const, recipients: 0, error: r.error };
  return {
    state: r.config.enabled ? ('active' as const) : ('disabled' as const),
    recipients: r.config.recipients.length,
    error: '',
  };
}

/** Mail-Einstellungen schreiben (Server-Manager, Übernahme alter Dateien, Tests). Prüft nicht – das macht der Leser. */
export function writeMailConfig(db: Db, m: Record<string, unknown>) {
  for (const [k, v] of Object.entries(m)) setBetrieb(db, 'mail', k, v, k === 'smtp');
}
