// E-Mail bei neuen Anfragen – wird NUR hier im Server-Manager eingestellt.
// Speicherort: Datenbank der App, Tabelle betrieb_einstellung, Bereich „mail“ (Migration 006). Die App liest sie bei
// jedem Versand und schreibt sie nie. Das Passwort verlässt den Manager nie (Anzeige: „gesetzt“) und steht im
// Backup (deshalb Backup-Passwort, siehe backup.mjs).
import fs from 'node:fs';
import { resolvePaths, requireValidConfig, InputError } from './config.mjs';
import * as settingsdb from './settingsdb.mjs';
import path from 'node:path';
import { run } from '../platform/common.mjs';
import { appArgs } from './appstart.mjs';
import { logger } from './log.mjs';

// Bewusst streng: nur Zeichen, die in normalen Adressen vorkommen (keine Shell-Zeichen wie & | ; ` $ ( ) " ' < > und keine Leerzeichen).
const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
const isSender = (v) => EMAIL.test(v.match(/<([^<>]+)>\s*$/)?.[1] ?? v); // „name@schule.de“ oder „Name <name@schule.de>“

export const mailFile = () => resolvePaths().dbFile;

function read() {
  try {
    const m = settingsdb.readBereich(mailFile(), 'mail');
    return Object.keys(m).length ? m : null;
  } catch {
    return null;
  }
}

/** Für Oberfläche/CLI – ohne Passwort. */
export function mailSettings() {
  const m = read();
  return {
    file: mailFile(),
    exists: !!m,
    enabled: m?.enabled === true,
    host: m?.smtp?.host ?? '',
    port: m?.smtp?.port ?? 587,
    secure: m?.smtp?.secure === true,
    user: m?.smtp?.user ?? '',
    passwordSet: !!m?.smtp?.pass,
    from: m?.from ?? '',
    recipients: m?.recipients ?? [],
    appBaseUrl: m?.appBaseUrl ?? '',
  };
}

/** Kurzstatus für Status/doctor: eingerichtet = aktiv und vollständig. */
export function mailState() {
  const m = mailSettings();
  const complete = !!(m.host && m.from && m.recipients.length);
  return { configured: m.enabled && complete, enabled: m.enabled, complete, label: m.enabled && complete ? 'ja' : m.enabled ? 'unvollständig' : 'nein' };
}

/** Speichern (Prüfung wie in der App). Leeres Passwort = bisheriges behalten; clearPassword = löschen. */
export function saveMail(b) {
  requireValidConfig();
  const old = read();
  const recipients = (Array.isArray(b.recipients) ? b.recipients : String(b.recipients ?? '').split(/[\s,;]+/)).map((r) => r.trim()).filter(Boolean);
  const m = {
    enabled: b.enabled === true,
    smtp: {
      host: String(b.host ?? '').trim(),
      port: Number(b.port ?? 587),
      secure: b.secure === true,
      user: String(b.user ?? '').trim(),
      pass: b.clearPassword ? '' : typeof b.password === 'string' && b.password ? b.password : old?.smtp?.pass ?? '',
    },
    from: String(b.from ?? '').trim(),
    recipients: [...new Map(recipients.map((r) => [r.toLowerCase(), r])).values()],
    appBaseUrl: String(b.appBaseUrl ?? '').trim().replace(/\/+$/, ''),
  };
  if (!/^[a-z0-9.-]{0,200}$/i.test(m.smtp.host)) throw new InputError('SMTP-Server: nur Rechnername oder IP-Adresse (z. B. smtp.schule.de).');
  if (!Number.isInteger(m.smtp.port) || m.smtp.port < 1 || m.smtp.port > 65535) throw new InputError('SMTP-Port: 1 bis 65535 (meist 587 oder 465).');
  if (m.smtp.user.length > 200 || m.smtp.pass.length > 500) throw new InputError('Benutzer/Passwort zu lang.');
  if (m.from && !isSender(m.from)) throw new InputError('Absender ungültig – z. B. mosaik3lab@schule.de oder „Mosaik³LAB <mosaik3lab@schule.de>“.');
  const bad = m.recipients.find((r) => !EMAIL.test(r));
  if (bad) throw new InputError(`Empfänger ungültig: ${bad}`);
  if (m.recipients.length > 20) throw new InputError('Höchstens 20 Empfänger.');
  if (m.appBaseUrl && !/^https?:\/\/[^\s"'<>]+$/i.test(m.appBaseUrl)) throw new InputError('App-Adresse braucht http:// oder https:// (z. B. http://mosaik3lab.schule.local:3001).');
  if (m.enabled && (!m.smtp.host || !m.from || !m.recipients.length)) throw new InputError('Zum Einschalten bitte SMTP-Server, Absender und mindestens einen Empfänger eintragen.');
  settingsdb.writeBereich(mailFile(), 'mail', m, { secrets: ['smtp'] });
  logger('manager').info(`Mail-Einstellungen gespeichert (Versand ${m.enabled ? 'an' : 'aus'}, ${m.recipients.length} Empfänger).`);
  return mailSettings();
}

/** Testmail über das Skript der App – genau mit diesen Einstellungen. */
export async function sendTestMail(to) {
  requireValidConfig();
  if (to && !EMAIL.test(to)) throw new InputError(`Ungültige Adresse: ${to}`);
  if (!read()) throw new InputError('Bitte die Mail-Einstellungen zuerst speichern.');
  const programDir = fs.realpathSync(resolvePaths().programDir);
  const serverDir = path.join(programDir, 'server');
  // Ohne Shell: Programm + Argumentliste – Adresse und Pfad werden nie als Befehl ausgewertet.
  const r = await run(process.execPath, appArgs(programDir, 'mail-test', ['--db', mailFile(), ...(to ? ['--to', to] : [])]), { cwd: serverDir, timeout: 60_000 });
  const line = (r.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() ?? `Kein Ergebnis (Code ${r.code}).`;
  logger('manager').info(`Testmail: ${line}`);
  return { ok: r.code === 0, message: line.replace(/^(OK|FEHLER):\s*/, '') };
}

