// Echter Versand über nodemailer an einen kleinen SMTP-Fänger (node:net, freier Port, nur 127.0.0.1) –
// ohne den Test-Transport aus helfer.ts. Prüft je Mailart: kommt an, richtige Empfänger, gültiges MIME
// (multipart/alternative mit text/plain + text/html, UTF-8), Umlaute korrekt, Link in beiden Teilen.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ROOT_DIR } from '../src/config';
import { openDb } from '../src/kern/db';
import { writeMailConfig, type MailConfig } from '../src/kern/mail/mailConfig';
import { sendMail, type BuiltMail } from '../src/kern/mail/mailer';
import { buildOrderMail, sampleOrder, sendTestMail } from '../src/module/anfragen/anfragen.mail';
import { buildProposalMail } from '../src/module/vorschlaege/vorschlaege.mail';
import { buildPasswortMail } from '../src/module/konten/passwortlink';
import type { Order } from '@mosaik3lab/shared/anfragen';
import type { User } from '../src/domain/types';
import type { Proposal } from '@mosaik3lab/shared/vorschlaege';

interface Received {
  from: string;
  to: string[];
  data: string;
}
const received: Received[] = [];
let server: net.Server;
let port = 0;

/** Minimaler SMTP-Server: EHLO, MAIL, RCPT, DATA, QUIT – ohne TLS und Anmeldung. */
function smtpServer() {
  return net.createServer((socket) => {
    let buf = '';
    let inData = false;
    let cur: Received = { from: '', to: [], data: '' };
    const say = (s: string) => socket.write(`${s}\r\n`);
    say('220 faenger.test ESMTP');
    socket.on('data', (chunk) => {
      buf += chunk.toString('latin1');
      for (;;) {
        if (inData) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) return;
          cur.data = Buffer.from(buf.slice(0, end).replace(/\r\n\.\./g, '\r\n.'), 'latin1').toString('utf8');
          buf = buf.slice(end + 5);
          inData = false;
          received.push(cur);
          cur = { from: '', to: [], data: '' };
          say('250 OK');
          continue;
        }
        const nl = buf.indexOf('\r\n');
        if (nl < 0) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') say('250-faenger.test\r\n250 8BITMIME');
        else if (cmd === 'MAIL') {
          cur.from = line;
          say('250 OK');
        } else if (cmd === 'RCPT') {
          cur.to.push(/<([^>]*)>/.exec(line)?.[1] ?? '');
          say('250 OK');
        } else if (cmd === 'DATA') {
          inData = true;
          say('354 weiter');
        } else if (cmd === 'QUIT') {
          say('221 Tschüss');
          socket.end();
        } else say('250 OK');
      }
    });
  });
}

before(async () => {
  server = smtpServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as net.AddressInfo).port;
});
after(() => new Promise<void>((r) => server.close(() => r())));

const config = (): MailConfig => ({
  enabled: true,
  smtp: { host: '127.0.0.1', port, secure: false, user: '', pass: '' },
  from: 'Mosaik³LAB <mosaik3lab@example.test>',
  recipients: ['team@example.test', 'leitung@example.test'],
  appBaseUrl: 'http://schule.test/mosaik3lab',
  erreichbarkeit: 'auto',
});

// --- kleiner MIME-Leser (reicht für nodemailers Ausgabe) ---------------------------------------------
const decodeQP = (s: string) => {
  const bytes: number[] = [];
  const t = s.replace(/=\r?\n/g, '');
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '=' && /^[0-9A-F]{2}$/i.test(t.slice(i + 1, i + 3))) {
      bytes.push(parseInt(t.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(...Buffer.from(t[i], 'utf8'));
  }
  return Buffer.from(bytes).toString('utf8');
};
const decodeWords = (s: string) =>
  s.replace(/=\?utf-8\?([QB])\?([^?]*)\?=\s*/gi, (_, enc: string, txt: string) =>
    enc.toUpperCase() === 'B' ? Buffer.from(txt, 'base64').toString('utf8') : decodeQP(txt.replace(/_/g, ' ')),
  );
function parse(raw: string) {
  const [head, ...rest] = raw.split('\r\n\r\n');
  const headers = head.replace(/\r\n[ \t]+/g, ' ');
  const header = (name: string) => new RegExp(`^${name}: (.*)$`, 'im').exec(headers)?.[1] ?? '';
  const boundary = /boundary="?([^";]+)"?/.exec(header('Content-Type'))?.[1] ?? '';
  const parts = rest
    .join('\r\n\r\n')
    .split(`--${boundary}`)
    .slice(1, -1)
    .map((p) => {
      const [h, ...b] = p.replace(/^\r\n/, '').split('\r\n\r\n');
      const body = b.join('\r\n\r\n').replace(/\r\n$/, '');
      const type = /Content-Type: ([^;\r\n]+)/i.exec(h)?.[1] ?? '';
      const charset = /charset=([^;\r\n]+)/i.exec(h)?.[1] ?? '';
      const enc = /Content-Transfer-Encoding: (\S+)/i.exec(h)?.[1]?.toLowerCase() ?? '7bit';
      const text = enc === 'base64' ? Buffer.from(body, 'base64').toString('utf8') : enc === 'quoted-printable' ? decodeQP(body) : body;
      return { type, charset: charset.toLowerCase(), text };
    });
  return { header, subject: decodeWords(header('Subject')), contentType: header('Content-Type'), parts };
}

async function sendAndReceive(to: string[], mail: BuiltMail) {
  const n = received.length;
  await sendMail(config(), to, mail);
  assert.equal(received.length, n + 1, 'Mail kam am SMTP-Server an');
  return received.at(-1)!;
}

function assertMime(r: Received, opts: { to: string[]; subject: string | RegExp; link: string; contains: string[]; replyTo?: string }) {
  assert.deepEqual(r.to, opts.to, 'Empfänger');
  const m = parse(r.data);
  if (typeof opts.subject === 'string') assert.equal(m.subject, opts.subject);
  else assert.match(m.subject, opts.subject);
  assert.match(m.contentType, /^multipart\/alternative;/, 'multipart/alternative');
  assert.deepEqual(m.parts.map((p) => p.type), ['text/plain', 'text/html']);
  for (const p of m.parts) assert.equal(p.charset, 'utf-8', `${p.type} in UTF-8`);
  const [text, html] = m.parts.map((p) => p.text);
  assert.ok(text.includes(opts.link), 'Link im Textteil');
  assert.ok(html.includes(`href="${opts.link.replace(/&/g, '&amp;')}"`), 'Knopf-Link im HTML');
  assert.ok(html.startsWith('<!doctype html>') && html.includes('<html lang="de"') && html.trimEnd().endsWith('</html>'));
  for (const s of opts.contains) assert.ok(text.includes(s) && html.includes(s), `enthält „${s}“`);
  assert.ok(text.includes('Mosaik³LAB') && html.includes('MOSAIK'), 'Umlaute/Hochzahl korrekt');
  if (opts.replyTo) assert.match(m.header('Reply-To'), new RegExp(opts.replyTo.replace('.', '\\.')));
  else assert.equal(m.header('Reply-To'), '');
}

const order: Order = {
  ...sampleOrder(),
  id: 'o1', number: 'ANF-2026-0042', itemId: 'i1', itemName: 'Stifthalter Größe Ü', quantity: 3,
  color: 'Blau', colorId: 'f-blau', colorHex: '#0A2CA5', colorVariants: [], size: 'M', classOrTeam: 'Klasse 7ö',
  customization: 'Bitte bis Freitag – danke!', personalization: [],
  requesterEmail: 'm.muster@schule.test', requesterName: 'm.muster@schule.test', isDemo: false,
};
const user = { displayName: 'Jürgen Weiß', email: 'j.weiss@schule.test' } as User;
const url = 'http://schule.test/mosaik3lab/passwort#abcDEF123_-';

test('SMTP: neue Anfrage', async () => {
  const r = await sendAndReceive(config().recipients, buildOrderMail(order, null, config()));
  assertMime(r, {
    to: ['team@example.test', 'leitung@example.test'],
    subject: 'Neue Anfrage ANF-2026-0042 – 3 × Stifthalter Größe Ü',
    link: 'http://schule.test/mosaik3lab/verwaltung/bestellungen?offen=o1',
    contains: ['Klasse 7ö', 'Bitte bis Freitag – danke!', 'Anfrage öffnen'],
    replyTo: 'm.muster@schule.test',
  });
});

test('SMTP: geänderte Anfrage', async () => {
  const r = await sendAndReceive(config().recipients, buildOrderMail({ ...order, quantity: 4 }, null, config(), [], { previous: order }));
  assertMime(r, {
    to: ['team@example.test', 'leitung@example.test'],
    subject: 'Geänderte Anfrage ANF-2026-0042 – 4 × Stifthalter Größe Ü',
    link: 'http://schule.test/mosaik3lab/verwaltung/bestellungen?offen=o1',
    contains: ['Was hat sich geändert?', '4 Stück'],
    replyTo: 'm.muster@schule.test',
  });
});

test('SMTP: Testmail des Server-Managers (über die Datenbank)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-smtp-'));
  try {
    const dbFile = path.join(dir, 'mosaik3lab.db');
    const db = openDb(dbFile);
    db.exec(await fs.readFile(path.join(ROOT_DIR, 'server', 'src', 'storage', 'sqlite', 'migrations', '006_betrieb_einstellung.sql'), 'utf8'));
    writeMailConfig(db, { ...config(), enabled: false });
    db.close();
    const n = received.length;
    assert.equal(await sendTestMail(dbFile, 'pruefer@example.test'), 'Testmail an pruefer@example.test versendet.');
    assert.equal(received.length, n + 1);
    assertMime(received.at(-1)!, {
      to: ['pruefer@example.test'],
      subject: /^Testnachricht: Neue Anfrage ANF-\d{4}-0000 – 7 × Beispiel-Druckteil \(Test\)$/,
      link: 'http://schule.test/mosaik3lab/verwaltung/bestellungen?offen=beispiel',
      contains: ['Der Mailversand funktioniert', 'Türkis'],
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('SMTP: neuer Vorschlag', async () => {
  const p = {
    id: 'p1', number: 'VOR-2026-0007', title: 'Becherhalter für Rollstühle', description: 'Klemmt am Rohr – ca. 22 mm.', usage: 'Pausen',
    links: ['https://example.org/modell'], quantity: 2, urgency: 'bald', requesterEmail: 'm.muster@schule.test', photos: [],
    createdAt: new Date().toISOString(),
  } as unknown as Proposal;
  const r = await sendAndReceive(config().recipients, buildProposalMail(p, config()));
  assertMime(r, {
    to: ['team@example.test', 'leitung@example.test'],
    subject: 'Neuer Vorschlag VOR-2026-0007 – Becherhalter für Rollstühle',
    link: 'http://schule.test/mosaik3lab/verwaltung/vorschlaege?offen=p1',
    contains: ['Klemmt am Rohr – ca. 22 mm.', 'Vorschlag öffnen'],
  });
});

test('SMTP: Passwort festlegen, zurücksetzen, nach Sperre', async () => {
  const cases = [
    { mail: buildPasswortMail(user, 'einrichten', url, false), subject: 'Mosaik³LAB: Passwort festlegen', contains: ['Hallo Jürgen Weiß,', 'Der Link gilt nur einmal.'] },
    { mail: buildPasswortMail(user, 'zuruecksetzen', url, true), subject: 'Mosaik³LAB: Passwort zurücksetzen', contains: ['angefordert', '24 Stunden'] },
    { mail: buildPasswortMail(user, 'zuruecksetzen', url, true, 'gesperrt'), subject: 'Mosaik³LAB: Passwort zurücksetzen', contains: ['gesperrt', '24 Stunden'] },
  ];
  for (const c of cases) {
    const r = await sendAndReceive([user.email], c.mail);
    assertMime(r, { to: ['j.weiss@schule.test'], subject: c.subject, link: url, contains: c.contains });
  }
});
