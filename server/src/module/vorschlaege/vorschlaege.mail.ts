import { PROPOSAL_URGENCY_LABELS, type Proposal } from '../../domain/proposals';
import type { Storage } from '../../storage';
import type { Db } from '../../kern/db';
import { readMailConfig, type MailConfig } from '../../kern/mail/mailConfig';
import { baseUrl, escapeHtml, formatMailDate, sendMail, type BuiltMail } from '../../kern/mail/mailer';
import { badge, button, C, fieldTable, FOOTER_TEAM, html, NO_LINK, renderLayout, small, textFooter } from '../../kern/mail/layout';

// Benachrichtigung über neue Vorschläge – an dieselben Empfänger und über denselben Versand wie neue Anfragen.
// Links der Lehrkraft stehen nur als Text in der Mail (nicht anklickbar), Fotos werden nicht angehängt.

export function proposalAdminUrl(p: Proposal, appUrl: string) {
  const base = baseUrl(appUrl);
  return base ? `${base}/verwaltung/vorschlaege?offen=${encodeURIComponent(p.id)}` : '';
}

export function buildProposalMail(p: Proposal, settings: Pick<MailConfig, 'appBaseUrl'>): BuiltMail {
  const link = proposalAdminUrl(p, settings.appBaseUrl);
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
    '',
    textFooter(FOOTER_TEAM),
  ].join('\n');
  const content =
    fieldTable(fields.map(([label, v]) => ({ label, valueHtml: html(v) }))) +
    (link ? `<div style="height:16px;line-height:16px;font-size:0">&nbsp;</div>${button('Vorschlag öffnen', link)}` : small(NO_LINK));
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
export function notifyNewProposal(storage: Storage, db: Db, proposal: Proposal) {
  void (async () => {
    const r = readMailConfig(db);
    if (r.state !== 'ok' || !r.config.enabled) return;
    let status: { ok: boolean; message: string };
    try {
      await sendMail(r.config, r.config.recipients, buildProposalMail(proposal, r.config));
      status = { ok: true, message: `Benachrichtigung zu ${proposal.number} versendet.` };
    } catch (err) {
      status = { ok: false, message: `Versand zu ${proposal.number} fehlgeschlagen: ${(err as Error).message}` };
      console.warn('[Mail]', status.message);
    }
    // nur diesen einen Wert schreiben (nicht alle Einstellungen und Stammdaten)
    storage.sqlite.settings.setSetting('mailStatus', { at: new Date().toISOString(), ...status });
  })().catch((err) => console.warn('[Mail] Unerwarteter Fehler:', err));
}
