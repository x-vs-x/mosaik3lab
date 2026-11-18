import { PROPOSAL_URGENCY_LABELS, type Proposal } from '../../domain/proposals';
import type { Storage } from '../../storage';
import { benachrichtigeImHintergrund } from '../../kern/mail/hintergrund';
import { linksNurImSchulnetz, type MailLinks } from '../../kern/mail/erreichbarkeit';
import { adminLink, escapeHtml, formatMailDate, type BuiltMail } from '../../kern/mail/mailer';
import { badge, button, C, fieldTable, FOOTER_TEAM, html, NO_LINK, renderLayout, schulnetzText, small, textFooter } from '../../kern/mail/layout';

// Benachrichtigung über neue Vorschläge – an dieselben Empfänger und über denselben Versand wie neue Anfragen.
// Links der Lehrkraft stehen nur als Text in der Mail (nicht anklickbar), Fotos werden nicht angehängt.

export const proposalAdminUrl = (p: Proposal, appUrl: string) => adminLink(appUrl, 'vorschlaege', p.id);

export function buildProposalMail(p: Proposal, settings: MailLinks): BuiltMail {
  const link = proposalAdminUrl(p, settings.appBaseUrl);
  const nurSchulnetz = !!link && linksNurImSchulnetz(settings);
  // Leere Angaben fehlen (wie bei Anfragen).
  const fields = (
    [
      ['Beschreibung', p.description],
      ['Einsatz', p.usage],
      ['Menge', `${p.quantity} Stück`],
      ['Dringlichkeit', PROPOSAL_URGENCY_LABELS[p.urgency]],
      ['Links', p.links.join('\n')],
      ['Fotos', p.photos.length ? `${p.photos.length} (in der Verwaltung ansehen)` : ''],
      ['Lehrkraft', p.requesterEmail],
      ['Vorschlagsnummer', p.number],
      ['Eingang', formatMailDate(p.createdAt)],
    ] as [string, string][]
  )
    .map(([l, v]) => [l, (v ?? '').trim()] as [string, string])
    .filter(([, v]) => v);
  const subject = `Neuer Vorschlag ${p.number} – ${p.title}`.replace(/[\r\n]+/g, ' ');
  const width = Math.max(...fields.map(([l]) => l.length)) + 2;
  const text = [
    `NEUER VORSCHLAG ${p.number}`,
    '',
    p.title,
    '',
    ...fields.map(([l, v]) => (v.includes('\n') ? `${l}:\n${v}` : `${`${l}:`.padEnd(width)}${v}`)),
    '',
    link ? `Vorschlag öffnen: ${link}` : NO_LINK,
    ...schulnetzText(nurSchulnetz),
    '',
    textFooter(FOOTER_TEAM),
  ].join('\n');
  const content =
    fieldTable(fields.map(([label, v]) => ({ label, valueHtml: html(v) }))) +
    (link ? `<div style="height:16px;line-height:16px;font-size:0">&nbsp;</div>${button('Vorschlag öffnen', link, nurSchulnetz)}` : small(NO_LINK));
  const htmlDoc = renderLayout({
    title: subject,
    preheader: [p.title, p.usage, PROPOSAL_URGENCY_LABELS[p.urgency]].filter(Boolean).join(' – ').replace(/[\r\n]+/g, ' '),
    eyebrowHtml: `${badge('Neuer Vorschlag', C.brandSoft, C.brand)}&nbsp; ${escapeHtml(p.number)}`,
    heading: p.title,
    contentHtml: content,
    footer: FOOTER_TEAM,
  });
  return { subject, text, html: htmlDoc };
}

/** Benachrichtigt im Hintergrund; ein Mailfehler verhindert nie den Vorschlag (Ergebnis siehe Einstellungen → Mailstatus). */
export function notifyNewProposal(storage: Storage, proposal: Proposal) {
  benachrichtigeImHintergrund(storage, proposal.number, (config) => buildProposalMail(proposal, config));
}
