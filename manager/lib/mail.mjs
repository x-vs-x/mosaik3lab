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
import { ERREICHBARKEIT, pruefeLinks } from './erreichbarkeit.mjs';

// Bewusst streng: nur Zeichen, die in normalen Adressen vorkommen (keine Shell-Zeichen wie & | ; ` $ ( ) " ' < > und keine Leerzeichen).
const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
// „name@schule.example“ oder „Name <name@schule.example>“ – ohne Steuerzeichen (ein Zeilenumbruch im Namen wäre eine zweite Kopfzeile der Mail)
// eslint-disable-next-line no-control-regex -- genau diese Zeichen sollen abgelehnt werden
const isSender = (v) => !/[\u0000-\u001f\u007f]/.test(v) && EMAIL.test(v.match(/<([^<>]+)>\s*$/)?.[1] ?? v);

// Meldungen des Mailservers bzw. der Verbindung (englisch, technisch) → ein Satz, was los ist und was man prüft.
// Reihenfolge zählt: das Genauere zuerst. Die Originalmeldung bleibt für die IT dahinter stehen.
const MAIL_FEHLER = [
  [/ENOTFOUND|EAI_AGAIN|getaddrinfo/i, 'Der Mailserver wurde nicht gefunden – bitte den Namen unter „Server“ prüfen (Tippfehler?) und ob dieser Rechner den Mailserver erreicht.'],
  [/wrong version number|ssl3_get_record|SSL routines|packet length too long/i, 'Die Verschlüsselung passt nicht zum Port – Port 587 braucht „STARTTLS“, Port 465 braucht „SSL/TLS“.'],
  [/self[- ]signed|unable to verify|certificate has expired|CERT_|does not match certificate|altnames/i, 'Das Zertifikat des Mailservers wird nicht anerkannt – unter „Server“ genau den Namen eintragen, den der Mail-Anbieter nennt (nicht die IP-Adresse); sonst den Anbieter fragen.'],
  [/Invalid login|EAUTH|\b535\b|authentication (failed|unsuccessful)|Username and Password not accepted|Missing credentials/i, 'Der Mailserver lehnt Benutzer oder Passwort ab – beides prüfen. Manche Anbieter verlangen ein eigenes „App-Passwort“ für Programme.'],
  [/ECONNREFUSED/i, 'Der Mailserver nimmt auf diesem Port keine Verbindung an – bitte den Port prüfen (meist 587 oder 465).'],
  [/ETIMEDOUT|timeout|timed out|Greeting never received|ECONNRESET|EHOSTUNREACH|ENETUNREACH|socket hang up|Connection closed/i, 'Der Mailserver antwortet nicht – Server, Port und Verschlüsselung prüfen; oft sperrt auch eine Firewall im Schulnetz den Port.'],
  [/\b55[0-4]\b|Sender address rejected|relay|not permitted|not allowed|Recipient address rejected|EENVELOPE/i, 'Der Mailserver lehnt Absender oder Empfänger ab – der Absender muss meist zur angemeldeten Mailadresse gehören; Empfänger-Adressen prüfen.'],
];
/** Fehlermeldung der Testmail verständlich machen; Unbekanntes bleibt unverändert. */
export function erklaereMailFehler(text) {
  const t = String(text ?? '').trim();
  const hit = MAIL_FEHLER.find(([re]) => re.test(t));
  return hit ? `${hit[1]} (Meldung: ${t})` : t;
}

export const mailFile = () => resolvePaths().dbFile;

function read() {
  try {
    const m = settingsdb.readBereich(mailFile(), 'mail');
    return Object.keys(m).length ? m : null;
  } catch {
    return null;
  }
}

/** Für Oberfläche/CLI – ohne Passwort. `autoUrl`: Adresse, die beim Speichern ohne eigene Adresse eingetragen würde (für die Erkennung). */
export function mailSettings(autoUrl = '') {
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
    // Links nur im Schulnetz? auto = erkennen; alte Einstellungen ohne Feld = auto (wie in der App)
    erreichbarkeit: ERREICHBARKEIT.includes(m?.erreichbarkeit) ? m.erreichbarkeit : 'auto',
    // Erkennung, Widerspruch (warnung) und HTTPS-Empfehlung für die gespeicherte bzw. automatische Adresse
    links: pruefeLinks({ appBaseUrl: m?.appBaseUrl || autoUrl, erreichbarkeit: m?.erreichbarkeit }),
  };
}

/** Kurzstatus für Status/doctor: eingerichtet = aktiv und vollständig. */
export function mailState() {
  const m = mailSettings();
  // Widerspruch „Auch von außerhalb“ ↔ Schulnetz-Adresse: nur wichtig, wenn Mails verschickt werden
  const linkWarnung = m.enabled ? m.links.warnung : '';
  const complete = !!(m.host && m.from && m.recipients.length);
  return { configured: m.enabled && complete, enabled: m.enabled, complete, label: m.enabled && complete ? 'ja' : m.enabled ? 'unvollständig' : 'nein', linkWarnung };
}

/** Speichern (Prüfung wie in der App). Leeres Passwort = bisheriges behalten; clearPassword = löschen. */
export function saveMail(b) {
  requireValidConfig();
  const old = read();
  const recipients = (Array.isArray(b.recipients) ? b.recipients : String(b.recipients ?? '').split(/[\s,;]+/)).map((r) => String(r).trim()).filter(Boolean);
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
    // ohne Angabe (ältere Oberfläche/CLI): bisherigen Wert behalten
    erreichbarkeit: b.erreichbarkeit ?? (ERREICHBARKEIT.includes(old?.erreichbarkeit) ? old.erreichbarkeit : 'auto'),
  };
  if (!/^[a-z0-9.-]{0,200}$/i.test(m.smtp.host)) throw new InputError('SMTP-Server: nur Rechnername oder IP-Adresse (z. B. smtp.schule.example).');
  if (!Number.isInteger(m.smtp.port) || m.smtp.port < 1 || m.smtp.port > 65535) throw new InputError('SMTP-Port: 1 bis 65535 (meist 587 oder 465).');
  if (m.smtp.user.length > 200 || m.smtp.pass.length > 500) throw new InputError('Benutzer/Passwort zu lang.');
  if (m.from && !isSender(m.from)) throw new InputError('Absender ungültig – z. B. mosaik3lab@schule.example oder „Mosaik³LAB <mosaik3lab@schule.example>“.');
  const bad = m.recipients.find((r) => !EMAIL.test(r));
  if (bad) throw new InputError(`Empfänger ungültig: ${bad}`);
  if (m.recipients.length > 20) throw new InputError('Höchstens 20 Empfänger.');
  if (m.appBaseUrl && !/^https?:\/\/[^\s"'<>]+$/i.test(m.appBaseUrl)) throw new InputError('App-Adresse braucht http:// oder https:// (z. B. http://mosaik3lab.schule.local/mosaik3lab).');
  if (!ERREICHBARKEIT.includes(m.erreichbarkeit)) throw new InputError('Erreichbarkeit der Links: auto, schulnetz oder oeffentlich.');
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
  const line = (r.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() ?? '';
  logger('manager').info(`Testmail: ${line || `kein Ergebnis (Code ${r.code}${r.error ? `, ${r.error}` : ''})`}`);
  return testMailResult(r.code, line);
}

/** Ergebnis der Testmail für die Oberfläche: Exit-Code + letzte Ausgabezeile des App-Skripts („OK: …“ / „FEHLER: …“). */
export function testMailResult(code, line) {
  if (code === 0) return { ok: true, message: line.replace(/^OK:\s*/, '') };
  // Ohne Ergebniszeile: das Skript wurde nach einer Minute beendet oder ließ sich gar nicht starten
  if (!/^FEHLER:/.test(line)) return { ok: false, message: 'Die Testmail ließ sich nicht verschicken – nach einer Minute kam kein Ergebnis. Server, Port und Verschlüsselung prüfen; Einzelheiten stehen im Protokoll „Manager“.' };
  return { ok: false, message: erklaereMailFehler(line.replace(/^FEHLER:\s*/, '')) };
}

