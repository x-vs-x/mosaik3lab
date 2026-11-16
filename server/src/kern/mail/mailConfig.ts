import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { getBereich, hatBereich, setBetrieb } from '../betrieb';
import type { Db } from '../db';

// Mail-Konfiguration in der Datenbank (Tabelle betrieb_einstellung, Bereich „mail“, Migration 006) – gepflegt
// ausschließlich im Server-Manager. Die App liest sie nur (bei jedem Versand, ohne Neustart).
// Schlüssel: enabled, smtp { host, port, secure, user, pass }, from, recipients[], appBaseUrl.
// Einmalige Übernahme alter Dateien (config/mail.json, settings.json → mail) siehe importLegacyMail.

const isEmail = (v: string) => z.string().email().safeParse(v).success;
/** „name@schule.de“ oder „Mosaik³LAB <name@schule.de>“ */
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
    /** Adresse der App für Links in Mails, z. B. https://mosaik3lab.schule.de */
    appBaseUrl: z
      .string()
      .trim()
      .max(300)
      .refine((v) => !v || /^https?:\/\/[^\s"'<>]+$/i.test(v), 'appBaseUrl braucht http:// oder https://')
      .transform((v) => v.replace(/\/+$/, ''))
      .default(''),
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

/**
 * Einmalige Übernahme alter Mail-Daten in die Datenbank – nur wenn es dort noch keine Mail-Einstellungen gibt:
 *  1. <storage>/config/mail.json (bisherige Betriebsdatei) → danach umbenannt in mail.json.vor-datenbank-<zeit>.bak
 *  2. alte SMTP-Daten aus <dataDir>/settings.json (Feld „mail“; vorher Sicherung, danach aus der Datei entfernt)
 * Läuft nach den Migrationen beim Start der App.
 */
export function importLegacyMail(db: Db, opts: { storageDir: string; dataDir: string }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const mailFile = path.join(opts.storageDir, 'config', 'mail.json');
  const settingsFile = path.join(opts.dataDir, 'settings.json');

  if (!hatBereich(db, 'mail') && fs.existsSync(mailFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(mailFile, 'utf8').replace(/^﻿/, ''));
      writeMailConfig(db, raw);
      fs.renameSync(mailFile, `${mailFile}.vor-datenbank-${stamp}.bak`);
      console.log(`[Mail] ${mailFile} in die Datenbank übernommen (Datei als .bak umbenannt).`);
    } catch (err) {
      console.warn(`[Mail] ${mailFile} konnte nicht übernommen werden: ${(err as Error).message}`);
    }
  }

  if (!fs.existsSync(settingsFile)) return;
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  } catch {
    return; // Defekte Datei behandelt die einmalige JSON-Übernahme.
  }
  const old = settings.mail as Record<string, unknown> | undefined;
  if (!old || typeof old !== 'object') return;

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const hasData = ['host', 'user', 'password', 'from', 'notifyTo'].some((k) => str(old[k]));
  const backup = `${settingsFile}.vor-mail-umzug-${stamp}.bak`;
  fs.copyFileSync(settingsFile, backup);

  if (hasData && !hatBereich(db, 'mail')) {
    const port = Number(old.port);
    writeMailConfig(db, {
      enabled: old.enabled === true,
      smtp: {
        host: str(old.host),
        port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 587,
        secure: old.secure === true,
        user: str(old.user),
        pass: typeof old.password === 'string' ? old.password : '',
      },
      from: str(old.from),
      recipients: str(old.notifyTo).split(/[,;\s]+/).filter(Boolean),
      appBaseUrl: str(old.appUrl).replace(/\/+$/, ''),
    });
    console.log(`[Mail] Mail-Einstellungen aus settings.json in die Datenbank übernommen (Sicherung: ${backup}).`);
  } else if (hasData) {
    console.log(`[Mail] Es gibt bereits Mail-Einstellungen in der Datenbank – alte Mail-Daten aus settings.json entfernt (Sicherung: ${backup}).`);
  }

  const { mail: _removed, ...rest } = settings;
  const tmp = `${settingsFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rest, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, settingsFile);
}

/** Altes Session-Geheimnis (<dataDir>/.session-secret) einmalig in die Datenbank übernehmen. */
export function importLegacySessionSecret(dataDir: string, setIfNew: (secret: string) => boolean) {
  const file = path.join(dataDir, '.session-secret');
  try {
    const secret = fs.readFileSync(file, 'utf8').trim();
    if (secret.length >= 32 && setIfNew(secret)) {
      fs.renameSync(file, `${file}.vor-datenbank-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`);
      console.log('[Übernahme] Session-Geheimnis in die Datenbank übernommen (Datei als .bak umbenannt).');
    }
  } catch {
    /* nichts zu übernehmen */
  }
}
