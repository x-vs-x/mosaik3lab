import nodemailer, { type Transporter } from 'nodemailer';
import type { MailConfig } from './mailConfig';

type TransportFactory = (config: MailConfig) => Transporter;

let transportFactory: TransportFactory = (c) =>
  nodemailer.createTransport({
    host: c.smtp.host,
    port: c.smtp.port,
    secure: c.smtp.secure,
    auth: c.smtp.user ? { user: c.smtp.user, pass: c.smtp.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

/** Für Tests: eigenen Transport (z. B. jsonTransport) einsetzen – es werden keine echten Mails versendet. */
export function setTransportFactory(factory: TransportFactory) {
  transportFactory = factory;
}

export interface MailContent {
  subject: string;
  text: string;
  html?: string;
  /** Antwortadresse (z. B. die Lehrkraft) – „Antworten“ landet dann dort statt beim Absender. */
  replyTo?: string;
}

export async function sendMail(c: MailConfig, to: string[], mail: MailContent) {
  if (!c.smtp.host) throw new Error('Kein SMTP-Server eingetragen.');
  if (!c.from) throw new Error('Keine Absenderadresse eingetragen.');
  if (!to.length) throw new Error('Keine Empfängeradresse eingetragen.');
  const transport = transportFactory(c);
  try {
    await transport.sendMail({ from: c.from, to, replyTo: mail.replyTo, subject: mail.subject, text: mail.text, html: mail.html });
  } finally {
    transport.close();
  }
}

/** Fertige Mail aus einer Vorlage (HTML + Text-Alternative). */
export interface BuiltMail {
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

// --- Hilfen für Mail-Vorlagen (Anfragen, Vorschläge) ---------------------------------------------------

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** App-Adresse ohne abschließenden Schrägstrich; leer, wenn keine gültige http(s)-Adresse. */
export function baseUrl(appUrl: string) {
  const url = appUrl.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : '';
}

export function formatMailDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }) + ' Uhr';
}
