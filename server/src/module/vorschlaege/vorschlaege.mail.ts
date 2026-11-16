import { PROPOSAL_URGENCY_LABELS, type Proposal } from '../../domain/proposals';
import type { Storage } from '../../storage';
import type { Db } from '../../kern/db';
import { readMailConfig, type MailConfig } from '../../kern/mail/mailConfig';
import { baseUrl, escapeHtml, formatMailDate, sendMail, type BuiltMail } from '../../kern/mail/mailer';

// Benachrichtigung über neue Vorschläge – an dieselben Empfänger und über denselben Versand wie neue Anfragen.
// Links der Lehrkraft stehen nur als Text in der Mail (nicht anklickbar), Fotos werden nicht angehängt.

export function proposalAdminUrl(p: Proposal, appUrl: string) {
  const base = baseUrl(appUrl);
  return base ? `${base}/verwaltung/vorschlaege?offen=${encodeURIComponent(p.id)}` : '';
}

export function buildProposalMail(p: Proposal, settings: Pick<MailConfig, 'appBaseUrl'>): BuiltMail {
  const link = proposalAdminUrl(p, settings.appBaseUrl);
  const fields: [string, string][] = [
    ['Vorschlagsnummer', p.number],
    ['Eingang', formatMailDate(p.createdAt)],
    ['Lehrkraft', p.requesterEmail || '—'],
    ['Titel', p.title],
    ['Beschreibung', p.description],
    ['Einsatz', p.usage || '—'],
    ['Gewünschte Menge', String(p.quantity)],
    ['Dringlichkeit', PROPOSAL_URGENCY_LABELS[p.urgency]],
    ['Links', p.links.length ? p.links.join('\n') : '—'],
    ['Fotos', p.photos.length ? `${p.photos.length} (in der Verwaltung ansehen)` : '—'],
  ];
  const subject = `Neuer Vorschlag ${p.number} – ${p.title}`.replace(/[\r\n]+/g, ' ');
  const text = [
    'Neuer Vorschlag in Mosaik³LAB',
    '',
    ...fields.map(([l, v]) => (v.includes('\n') ? `${l}:\n${v}` : `${l}: ${v}`)),
    '',
    link ? `Zum Vorschlag in der Verwaltung: ${link}` : 'Hinweis: In den Einstellungen ist keine Adresse der App hinterlegt, daher fehlen Links.',
    '',
    '— Automatische Nachricht von Mosaik³LAB',
  ].join('\n');
  const FONT = 'font-family:Arial,Helvetica,sans-serif';
  const rows = fields
    .map(
      ([l, v]) =>
        `<tr><th scope="row" align="left" valign="top" style="${FONT};padding:8px 16px 8px 0;color:#57534e;font-weight:bold;white-space:nowrap;border-bottom:1px solid #e7e5e4">${escapeHtml(l)}</th>` +
        `<td valign="top" style="${FONT};padding:8px 0;color:#1c1917;border-bottom:1px solid #e7e5e4">${escapeHtml(v).replace(/\r?\n/g, '<br>')}</td></tr>`,
    )
    .join('\n');
  const button = link
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(link)}" style="${FONT};display:inline-block;background:#0b5cad;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Vorschlag in der Verwaltung öffnen</a></p>`
    : `<p style="${FONT};margin:24px 0 0;color:#57534e;font-size:14px">Hinweis: In den Einstellungen ist keine Adresse der App hinterlegt, daher fehlen Links.</p>`;
  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f5f5f4">
<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e7e5e4">
<h1 style="${FONT};font-size:20px;margin:0 0 16px;color:#1c1917">Neuer Vorschlag in Mosaik³LAB</h1>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:15px">
${rows}
</table>
${button}
<p style="${FONT};margin:24px 0 0;color:#78716c;font-size:12px">Automatische Nachricht von Mosaik³LAB</p>
</div>
</body></html>`;
  return { subject, text, html };
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
    await storage.settings.update((c) => ({ ...c, mailStatus: { at: new Date().toISOString(), ...status } }));
  })().catch((err) => console.warn('[Mail] Unerwarteter Fehler:', err));
}
