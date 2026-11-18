// Vorschau aller Mails, die die App verschickt – mit Beispieldaten, ohne Versand.
//   npm run mail:vorschau -w server -- --out <ordner>
// Schreibt je Mailart <name>.html und <name>.txt sowie index.html (Liste) in den Ordner. Im Browser öffnen und
// bei 375, 768 und 1280 px Breite ansehen. Den Ordner nicht ins Repo legen (z. B. C:\Entwicklung\_testdaten\mail-vorschau).
import fs from 'node:fs';
import path from 'node:path';
import { buildOrderMail, sampleOrder } from '../src/module/anfragen/anfragen.mail';
import { buildProposalMail } from '../src/module/vorschlaege/vorschlaege.mail';
import { buildPasswortMail } from '../src/module/konten/passwortlink';
import type { BuiltMail } from '../src/kern/mail/mailer';
import type { User } from '../src/domain/types';
import type { Order } from '@mosaik3lab/shared/anfragen';
import type { Proposal } from '@mosaik3lab/shared/vorschlaege';

const i = process.argv.indexOf('--out');
const out = i >= 0 ? process.argv[i + 1] : undefined;
if (!out) {
  console.log('Aufruf: npm run mail:vorschau -w server -- --out <ordner>');
  process.exit(2);
}

const settings = { appBaseUrl: 'https://mosaik3lab.schule.example/mosaik3lab' };
const now = new Date().toISOString();
const blau = { areaId: 'main', area: 'Farbe', colorId: 'f-blau', color: 'Blau', colorHex: '#0A2CA5' };
const gelb = { areaId: 'main', area: 'Farbe', colorId: 'f-gelb', color: 'Gelb', colorHex: '#F4D53F' };
const order: Order = {
  ...sampleOrder(),
  id: 'o1', number: 'ANF-2026-0042', itemId: 'i1', itemName: 'Stifthalter für dicke Griffe', quantity: 7,
  color: '3 × Blau, 4 × Gelb', colorId: 'f-blau', colorHex: '#0A2CA5', colorChoices: [blau],
  colorVariants: [{ quantity: 3, colorChoices: [blau] }, { quantity: 4, colorChoices: [gelb] }],
  size: 'M', classOrTeam: 'Klasse 7b', customization: 'Bitte bis Freitag, wenn möglich.\nDanke!',
  personalization: [{ fieldId: 'b', label: 'Beschriftung', value: 'Jonas' }],
  requesterEmail: 'm.muster@schule.example', requesterName: 'm.muster@schule.example', isDemo: false, createdAt: now, updatedAt: now,
};
const filaments = [{ id: 'f-blau', name: 'Blau', brand: 'Bambu Lab', line: 'PLA Basic', hex: '#0A2CA5' }] as never;
const geaendert: Order = { ...order, quantity: 8, color: '4 × Blau, 4 × Gelb', colorVariants: [{ quantity: 4, colorChoices: [blau] }, { quantity: 4, colorChoices: [gelb] }], customization: '' };
const proposal: Proposal = {
  id: 'p1', number: 'VOR-2026-0007', title: 'Halter für Trinkbecher am Rollstuhl', requesterId: null,
  description: 'Ein Becherhalter, der sich am Rohr des Rollstuhls festklemmen lässt.\nDurchmesser Rohr ca. 22 mm.',
  usage: 'Pausen und Unterricht', links: ['https://www.example.org/becherhalter-modell-mit-sehr-langem-namen-1234567890'], quantity: 2,
  urgency: 'bald', requesterEmail: 'm.muster@schule.example', status: 'neu', reply: '', itemId: null, photos: ['a.jpg', 'b.jpg'],
  updatedByUserId: '', createdAt: now, updatedAt: now,
};
const user = { displayName: 'Maria Muster', email: 'm.muster@schule.example' } as User;
const pwUrl = `${settings.appBaseUrl}/passwort#Rk3v9Xw2_QpL0aZt8YcNm4BsD6fHjUe1oIy7GxVr5Tk`;

const mails: Record<string, BuiltMail> = {
  'anfrage-neu': buildOrderMail(order, { id: 'i1' } as never, settings, filaments),
  'anfrage-geaendert': buildOrderMail(geaendert, null, settings, filaments, { previous: order }),
  testmail: buildOrderMail(sampleOrder(), null, settings, [], { notice: 'Testnachricht: Der Mailversand funktioniert. So sehen Benachrichtigungen aus – die Anfrage unten ist nur ein Beispiel.' }),
  vorschlag: buildProposalMail(proposal, settings),
  'passwort-festlegen': buildPasswortMail(user, 'einrichten', pwUrl, false),
  'passwort-vergessen': buildPasswortMail(user, 'zuruecksetzen', pwUrl, true),
  'passwort-gesperrt': buildPasswortMail(user, 'zuruecksetzen', pwUrl, true, 'gesperrt'),
};

fs.mkdirSync(out, { recursive: true });
for (const [name, m] of Object.entries(mails)) {
  fs.writeFileSync(path.join(out, `${name}.html`), m.html);
  fs.writeFileSync(path.join(out, `${name}.txt`), `Betreff: ${m.subject}\n\n${m.text}\n`);
}
const list = Object.entries(mails).map(([n, m]) => `<li><a href="${n}.html">${n}</a> – ${m.subject} (<a href="${n}.txt">Text</a>)</li>`).join('\n');
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Mail-Vorschau</title><ul>${list}</ul>`);
console.log(`${Object.keys(mails).length} Mails nach ${path.resolve(out)} geschrieben.`);
