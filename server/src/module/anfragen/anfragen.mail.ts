import { initialStatus, type Filament } from '../../domain/settings';
import type { Storage } from '../../storage';
import { openDb, type Db } from '../../kern/db';
import { readMailConfig, type MailConfig } from '../../kern/mail/mailConfig';
import { baseUrl, escapeHtml, formatMailDate, sendMail, type BuiltMail } from '../../kern/mail/mailer';
import type { Item, Order, OrderColorChoice } from '../../domain/types';
import { EGAL_FARBE } from '@mosaik3lab/shared/anfragen';
import { filamentRolle } from '@mosaik3lab/shared/stammdaten';
import { emailSchema } from '@mosaik3lab/shared/basis';

// Vorlage der Benachrichtigung bei neuen Anfragen (HTML + Text-Alternative, keine Anhänge).
// Neue Bestellfelder nur in `orderMailFields` ergänzen – Text, HTML und Änderungsvergleich passen sich an.
// HTML für Outlook und Handy: Tabellen-Layout, nur Inline-Styles, keine nachzuladenden Bilder.

/** Eine Zeile „Bezeichnung: Wert“ in der Mail. */
export interface MailField {
  label: string;
  value: string;
  /** Optionaler Link (http/https/mailto) für den Wert. */
  href?: string;
  /** Optionaler Farbwert (#RRGGBB), wird im HTML als Farbfeld vor dem Wert gezeigt. */
  swatch?: string;
  /** Mehrzeiliger Freitext (z. B. Bemerkungen) – Zeilenumbrüche bleiben erhalten. */
  multiline?: boolean;
  /** „Farbe egal“: Das Team wählt die Farbe selbst – wird hervorgehoben. */
  anyColor?: boolean;
  /** Vergleichsschlüssel für geänderte Anfragen (Zeilen mit gleichem Schlüssel gehören zu einer Angabe). */
  key?: string;
  /** Von der Lehrkraft geändert (nur bei geänderten Anfragen). */
  changed?: boolean;
}

/** Eine geänderte Angabe („vorher → jetzt“). Leer = nicht (mehr) angegeben. */
export interface MailChange {
  /** Vergleichsschlüssel wie MailField.key. */
  key: string;
  label: string;
  before: string;
  after: string;
}

export interface OrderMailOptions {
  /** Stand vor der Änderung durch die Lehrkraft – gesetzt = „Geänderte Anfrage“. */
  previous?: Order;
  /** Hinweis ganz oben (z. B. für die Testmail). */
  notice?: string;
}

const isAnyColor = (c: Pick<OrderColorChoice, 'colorId'>) => c.colorId === EGAL_FARBE;

export function orderAdminUrl(order: Order, appUrl: string) {
  const base = baseUrl(appUrl);
  return base ? `${base}/verwaltung/bestellungen?offen=${encodeURIComponent(order.id)}` : '';
}

const validEmail = (email: string | undefined) => {
  const r = emailSchema.safeParse(email ?? '');
  return r.success ? r.data : undefined;
};

/** Reply-To = Lehrkraft, damit „Antworten“ direkt bei ihr landet – nur bei gültiger Adresse, nie bei Beispiel-/Demo-Anfragen. */
export function orderReplyTo(order: Order) {
  return order.isDemo ? undefined : validEmail(order.requesterEmail);
}

/** Alle Angaben zur Anfrage – Reihenfolge = Reihenfolge in der Mail. Leere Angaben fehlen. */
export function orderMailFields(order: Order, item: Item | null, appUrl: string, filaments: Filament[] = []): MailField[] {
  const base = baseUrl(appUrl);
  const swatchOf = (hex: string | undefined) => (hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : undefined);
  // Die Mail geht ans Druck-Team: zur Farbe auch die Rolle (Marke, Linie, Bambu-Nummer), die Lehrkräfte nicht sehen.
  const withFilament = (color: string, colorId: string) => {
    const f = filaments.find((x) => x.id === colorId);
    const roll = f ? filamentRolle(f) : '';
    return roll ? `${color} (${roll})` : color;
  };
  const colorField = (label: string, c: Pick<OrderColorChoice, 'color' | 'colorId' | 'colorHex'>): MailField =>
    isAnyColor(c)
      ? { label, value: 'Farbe egal', anyColor: true, key: 'color' }
      : { label, value: withFilament(c.color, c.colorId), swatch: swatchOf(c.colorHex), key: 'color' };
  const variants = order.colorVariants ?? [];
  const choices = order.colorChoices ?? [];
  const fields: MailField[] = [
    {
      label: 'Druckteil',
      value: order.itemName,
      href: base && item ? `${base}/verwaltung/hilfsmittel/${encodeURIComponent(item.id)}` : undefined,
    },
    { label: 'Menge', value: `${order.quantity} Stück`, key: 'quantity' },
    // Mehrere Farben in einer Anfrage: eine Zeile je Variante („Farbe (3 Stück)“).
    ...(variants.length > 1
      ? variants.map((v) =>
          v.colorChoices.length === 1
            ? colorField(`Farbe (${v.quantity} Stück)`, v.colorChoices[0])
            : {
                label: `Farbe (${v.quantity} Stück)`,
                value: v.colorChoices.map((c) => `${c.area}: ${isAnyColor(c) ? 'Farbe egal' : withFilament(c.color, c.colorId)}`).join('; '),
                swatch: swatchOf(v.colorChoices[0]?.colorHex),
                anyColor: v.colorChoices.every(isAnyColor),
                key: 'color',
              },
        )
      : // Mehrfarbige Drucke: eine Zeile je Farbbereich (mit eigenem Farbtupfer).
        choices.length > 1
        ? choices.map((c) => colorField(`Farbe ${c.area}`, c))
        : [colorField('Farbe', { color: order.color, colorId: order.colorId, colorHex: order.colorHex })]),
    { label: 'Größe', value: order.size, key: 'size' },
    // Personalisierung (z. B. Beschriftung).
    ...(order.personalization ?? []).map((p) => ({ label: p.label, value: p.value, key: `p:${p.label}` })),
    { label: 'Bemerkungen', value: order.customization, multiline: true, key: 'remarks' },
    { label: 'Klasse/Team', value: order.classOrTeam, key: 'class' },
    {
      label: 'Lehrkraft',
      value: order.requesterEmail || order.requesterName,
      href: validEmail(order.requesterEmail) ? `mailto:${validEmail(order.requesterEmail)}` : undefined,
    },
    { label: 'Anfragenummer', value: order.number },
    { label: 'Eingang', value: formatMailDate(order.createdAt) },
  ];
  return fields.map((f) => ({ ...f, value: f.value?.trim() ?? '' })).filter((f) => f.value);
}

/** Was die Lehrkraft geändert hat – Vergleich der Angaben je Schlüssel (Reihenfolge wie in der Mail). */
export function orderChanges(previous: Order, order: Order): MailChange[] {
  const describe = (o: Order) => {
    const map = new Map<string, MailChange>();
    const put = (key: string, label: string, value: string) => map.set(key, { key, label, before: '', after: value.trim() });
    put('quantity', 'Menge', `${o.quantity} Stück`);
    put('color', (o.colorVariants ?? []).length > 1 ? 'Farben' : 'Farbe', o.color);
    put('size', 'Größe', o.size);
    for (const p of o.personalization ?? []) put(`p:${p.label}`, p.label, p.value);
    put('remarks', 'Bemerkungen', o.customization);
    put('class', 'Klasse/Team', o.classOrTeam);
    return map;
  };
  const before = describe(previous);
  const after = describe(order);
  const changes = new Map<string, MailChange>();
  for (const [key, a] of after) {
    const b = before.get(key)?.after ?? '';
    if (b !== a.after) changes.set(key, { ...a, before: b });
  }
  for (const [key, b] of before) if (!after.has(key) && b.after) changes.set(key, { ...b, before: b.after, after: '' });
  return [...changes.values()];
}

/** Kurzfassung für Kopf und Postfach-Vorschau, z. B. „7 × Kabelhalter“ / „3 × Blau, 4 × Gelb · Größe M · Klasse 7b“. */
function orderSummary(order: Order) {
  const headline = `${order.quantity} × ${order.itemName}`;
  const details = [order.color, order.size && `Größe ${order.size}`, order.classOrTeam].map((s) => (s ?? '').trim()).filter(Boolean);
  return { headline, details };
}

/** Erzeugt Betreff, Text und HTML der Benachrichtigung zu einer neuen (bzw. von der Lehrkraft geänderten) Anfrage. */
export function buildOrderMail(
  order: Order,
  item: Item | null,
  settings: Pick<MailConfig, 'appBaseUrl'>,
  filaments: Filament[] = [],
  options: OrderMailOptions = {},
): BuiltMail {
  const changes = options.previous ? orderChanges(options.previous, order) : null;
  const changedKeys = new Set((changes ?? []).map((c) => c.key));
  const fields = orderMailFields(order, item, settings.appBaseUrl, filaments).map((f) =>
    f.key && changedKeys.has(f.key) ? { ...f, changed: true } : f,
  );
  const link = orderAdminUrl(order, settings.appBaseUrl);
  const kind = changes ? 'Geänderte Anfrage' : 'Neue Anfrage';
  const summary = orderSummary(order);
  const subject = `${kind} ${order.number} – ${summary.headline}`.replace(/[\r\n]+/g, ' ');
  const preheader = [
    changes?.length ? `Geändert: ${changes.map((c) => c.label).join(', ')}` : '',
    summary.headline,
    ...summary.details,
  ]
    .filter(Boolean)
    .join(' – ')
    .replace(/[\r\n]+/g, ' ');
  const replyTo = orderReplyTo(order);
  const view: MailView = { kind, number: order.number, summary, changes, fields, link, notice: options.notice ?? '', replyTo: !!replyTo };
  return {
    subject,
    text: renderText(view),
    html: renderHtml(view, subject, preheader),
    ...(replyTo ? { replyTo } : {}),
  };
}

interface MailView {
  kind: string;
  number: string;
  summary: { headline: string; details: string[] };
  /** null = neue Anfrage, sonst die Änderungen (evtl. leer). */
  changes: MailChange[] | null;
  fields: MailField[];
  link: string;
  notice: string;
  replyTo: boolean;
}

const NO_LINK = 'Hinweis: Im Server-Manager ist keine Adresse der App hinterlegt, daher fehlen Links.';
const REPLY_HINT = 'Mit „Antworten“ schreiben Sie direkt an die Lehrkraft.';
const FOOTER = 'Automatische Nachricht von Mosaik³LAB';
const UNCHANGED = 'Die Lehrkraft hat die Anfrage erneut gespeichert, ohne Angaben zu ändern.';
const orEmpty = (v: string) => v || '(leer)';
const isLong = (c: MailChange) => /\n/.test(c.before + c.after) || c.before.length + c.after.length > 60;

function renderText(v: MailView) {
  const lines: string[] = [];
  if (v.notice) lines.push(`*** ${v.notice} ***`, '');
  lines.push(`${v.kind.toUpperCase()} ${v.number}`, '', v.summary.headline);
  if (v.summary.details.length) lines.push(v.summary.details.join(' · '));
  if (v.changes) {
    lines.push('', 'Was hat sich geändert?');
    if (!v.changes.length) lines.push(UNCHANGED);
    for (const c of v.changes) {
      const indent = (s: string) => orEmpty(s).replace(/\r?\n/g, '\n          ');
      lines.push(isLong(c) ? `- ${c.label}:\n  vorher: ${indent(c.before)}\n  jetzt:  ${indent(c.after)}` :`- ${c.label}: ${orEmpty(c.before)} → ${orEmpty(c.after)}`);
    }
  }
  lines.push('', 'Angaben', '-------');
  const width = Math.max(...v.fields.map((f) => f.label.length)) + 2;
  for (const f of v.fields) {
    const mark = f.changed ? '  [geändert]' : '';
    if (f.multiline) {
      lines.push('', `${f.label}:${mark}`, f.value, '');
      continue;
    }
    const href = f.href && !f.href.startsWith('mailto:') ? ` (${f.href})` : '';
    const value = f.anyColor ? `${f.value} – Team wählt die Farbe` : f.value;
    lines.push(`${`${f.label}:`.padEnd(width)}${value}${href}${mark}`);
  }
  lines.push('', v.link ? `Zur Anfrage in der Verwaltung: ${v.link}` : NO_LINK);
  if (v.replyTo) lines.push(REPLY_HINT);
  lines.push('', `— ${FOOTER}`);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

const FONT = 'font-family:Arial,Helvetica,sans-serif';
const C = { text: '#1c1917', muted: '#57534e', faint: '#78716c', line: '#e7e5e4', page: '#f5f5f4', link: '#0b5cad', changed: '#fef3c7', changedText: '#92400e' };

/** Kleines farbiges Kennzeichen („NEU“, „GEÄNDERT“, „geändert“, „Farbe egal“). */
const badge = (text: string, bg: string, fg: string, size = 12) =>
  `<span style="${FONT};display:inline-block;background-color:${bg};color:${fg};font-size:${size}px;font-weight:bold;padding:2px 8px;border-radius:10px;letter-spacing:.3px">${escapeHtml(text)}</span>`;

function renderHtml(v: MailView, subject: string, preheader: string) {
  const html = (s: string) => escapeHtml(s).replace(/\r?\n/g, '<br>');
  const rows = v.fields
    .map((f) => {
      let value = html(f.value);
      if (f.href) value = `<a href="${escapeHtml(f.href)}" style="color:${C.link}">${value}</a>`;
      if (f.anyColor) value = `${badge('Farbe egal', '#e0f2fe', '#075985', 13)} <span style="color:${C.muted};font-size:13px">Team wählt die Farbe</span>`;
      if (f.swatch) {
        value = `<span style="display:inline-block;width:14px;height:14px;line-height:14px;font-size:10px;border:1px solid #888;border-radius:3px;background-color:${f.swatch};vertical-align:middle;margin-right:6px">&nbsp;</span>${value}`;
      }
      const bg = f.changed ? `background-color:${C.changed};` : '';
      const mark = f.changed ? `<br>${badge('geändert', '#fde68a', C.changedText, 11)}` : '';
      return (
        `<tr><th scope="row" align="left" valign="top" width="115" style="${FONT};${bg}width:115px;padding:9px 12px 9px 6px;color:${C.muted};font-size:14px;font-weight:bold;border-bottom:1px solid ${C.line}">${escapeHtml(f.label)}${mark}</th>` +
        `<td valign="top" style="${FONT};${bg}padding:9px 6px;color:${C.text};font-size:15px;line-height:1.4;border-bottom:1px solid ${C.line};word-break:break-word">${value}</td></tr>`
      );
    })
    .join('\n');

  const notice = v.notice
    ? `<tr><td style="${FONT};background-color:#ede9fe;color:#4c1d95;font-size:14px;font-weight:bold;padding:12px 16px;border-radius:8px">${escapeHtml(v.notice)}</td></tr><tr><td height="16" style="font-size:0;line-height:0">&nbsp;</td></tr>`
    : '';
  const kindBadge = v.changes ? badge(v.kind, '#fde68a', C.changedText) : badge(v.kind, '#dbeafe', '#1e40af');
  const head =
    `<tr><td style="${FONT};color:${C.faint};font-size:13px;padding:0 0 8px">${kindBadge}&nbsp; ${escapeHtml(v.number)}</td></tr>` +
    `<tr><td style="${FONT};color:${C.text};font-size:22px;line-height:1.3;font-weight:bold;padding:0 0 4px">${escapeHtml(v.summary.headline)}</td></tr>` +
    (v.summary.details.length
      ? `<tr><td style="${FONT};color:${C.muted};font-size:16px;line-height:1.4;padding:0 0 16px">${v.summary.details.map(escapeHtml).join(' &middot; ')}</td></tr>`
      : '');

  let changeBox = '';
  if (v.changes) {
    const items = v.changes.length
      ? v.changes
          .map(
            (c) => {
              const before = `<span style="color:${C.faint};text-decoration:line-through">${html(orEmpty(c.before))}</span>`;
              const after = `<b>${html(orEmpty(c.after))}</b>`;
              // Lange Texte (Bemerkungen) untereinander, kurze Angaben in einer Zeile.
              return isLong(c)
                ? `<li style="margin:0 0 4px"><b>${escapeHtml(c.label)}:</b><br>vorher: ${before}<br>jetzt: ${after}</li>`
                : `<li style="margin:0 0 4px"><b>${escapeHtml(c.label)}:</b> ${before} &rarr; ${after}</li>`;
            },
          )
          .join('')
      : `<li style="margin:0">${escapeHtml(UNCHANGED)}</li>`;
    changeBox =
      `<tr><td style="${FONT};background-color:${C.changed};border-left:4px solid #f59e0b;color:${C.text};font-size:14px;line-height:1.4;padding:12px 14px">` +
      `<div style="font-weight:bold;color:${C.changedText};margin:0 0 6px">Was hat sich geändert?</div><ul style="margin:0;padding:0 0 0 18px">${items}</ul></td></tr>` +
      `<tr><td height="16" style="font-size:0;line-height:0">&nbsp;</td></tr>`;
  }

  const button = v.link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0"><tr><td bgcolor="${C.link}" style="background-color:${C.link};border-radius:8px;padding:12px 20px">` +
      `<a href="${escapeHtml(v.link)}" style="${FONT};color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px">Anfrage in der Verwaltung öffnen</a></td></tr></table>`
    : `<p style="${FONT};margin:24px 0 0;color:${C.muted};font-size:14px">${escapeHtml(NO_LINK)}</p>`;
  const reply = v.replyTo ? `<p style="${FONT};margin:16px 0 0;color:${C.muted};font-size:14px">${escapeHtml(REPLY_HINT)}</p>` : '';
  // Preheader: Vorschautext im Postfach, im Mailtext unsichtbar; Füllzeichen verhindern, dass dahinter Mailtext erscheint.
  const pre = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};opacity:0">${escapeHtml(preheader)}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>`;

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:${C.page}">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page}"><tr><td align="center" style="padding:16px 8px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;border:1px solid ${C.line};border-radius:12px"><tr><td style="padding:20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${notice}${head}
${changeBox}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid ${C.line}">
${rows}
</table>
${button}
${reply}
<p style="${FONT};margin:24px 0 0;color:${C.faint};font-size:12px">${FOOTER}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
}

/** Beispielanfrage für die Testmail – zeigt mehrere Farben, „Farbe egal“ und Personalisierung, klar als Test erkennbar. */
export function sampleOrder(): Order {
  const now = new Date().toISOString();
  const choice = (colorId: string, color: string, colorHex: string): OrderColorChoice => ({ areaId: 'main', area: 'Farbe', colorId, color, colorHex });
  const turquoise = choice('', 'Türkis', '#00B1B7');
  const yellow = choice('', 'Gelb', '#F4D53F');
  const any = choice(EGAL_FARBE, 'Farbe egal', '');
  return {
    id: 'beispiel',
    number: `ANF-${new Date().getFullYear()}-0000`,
    itemId: '',
    itemName: 'Beispiel-Druckteil (Test)',
    quantity: 7,
    color: '3 × Türkis, 2 × Gelb, 2 × Farbe egal',
    colorId: '',
    colorHex: '#00B1B7',
    colorChoices: [turquoise],
    colorVariants: [
      { quantity: 3, colorChoices: [turquoise] },
      { quantity: 2, colorChoices: [yellow] },
      { quantity: 2, colorChoices: [any] },
    ],
    size: 'M',
    classOrTeam: 'Klasse 5a (Beispiel)',
    customization: 'Dies ist eine Testnachricht – keine echte Anfrage.\nBitte nicht drucken.',
    personalization: [{ fieldId: 'beschriftung', label: 'Beschriftung', value: 'TEST' }],
    status: initialStatus(),
    history: [],
    requesterId: null,
    requesterEmail: 'lehrkraft@example.org',
    requesterName: 'lehrkraft@example.org',
    trackingCode: '',
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Testmail mit den Mail-Einstellungen aus dieser Datenbankdatei (für den Server-Manager, auch wenn `enabled` aus ist).
 * Gibt die Erfolgsmeldung zurück, wirft bei Fehlern.
 */
export async function sendTestMail(dbFile: string, to?: string) {
  const db = openDb(dbFile, { readOnly: true });
  let r;
  try {
    r = readMailConfig(db);
  } finally {
    db.close();
  }
  if (r.state === 'missing') throw new Error('Es sind noch keine Mail-Einstellungen gespeichert.');
  if (r.state === 'invalid') throw new Error(`Ungültige Mail-Einstellungen: ${r.error}`);
  const recipients = to ? [to] : r.config.recipients;
  const notice = 'Testnachricht: Der Mailversand von Mosaik³LAB funktioniert. So sehen Benachrichtigungen aus – die Anfrage unten ist nur ein Beispiel.';
  // Beispielanfrage (isDemo) → ohne Reply-To: Die Beispieladresse soll keine Antworten bekommen.
  const sample = buildOrderMail(sampleOrder(), null, r.config, [], { notice });
  await sendMail(r.config, recipients, { ...sample, subject: `Testnachricht: ${sample.subject}` });
  return `Testmail an ${recipients.join(', ')} versendet.`;
}

/**
 * Benachrichtigt bei neuen Anfragen bzw. – mit `previous` (Stand vor der Änderung) – bei von der Lehrkraft geänderten.
 * Läuft im Hintergrund: Ein Mailfehler verhindert nie die Anfrage, wird aber ins Log geschrieben und in den
 * Einstellungen angezeigt.
 */
export function notifyNewOrder(storage: Storage, db: Db, order: Order, item: Item | null = null, previous?: Order) {
  void (async () => {
    const r = readMailConfig(db);
    if (r.state !== 'ok' || !r.config.enabled) return;
    let status: { ok: boolean; message: string };
    try {
      const { filaments } = (await storage.settings.get()).masterData;
      await sendMail(r.config, r.config.recipients, buildOrderMail(order, item, r.config, filaments, { previous }));
      status = { ok: true, message: `Benachrichtigung zu ${order.number} versendet.` };
    } catch (err) {
      status = { ok: false, message: `Versand zu ${order.number} fehlgeschlagen: ${(err as Error).message}` };
      console.warn('[Mail]', status.message);
    }
    // nur diesen einen Wert schreiben (nicht alle Einstellungen und Stammdaten)
    storage.sqlite.settings.setSetting('mailStatus', { at: new Date().toISOString(), ...status });
  })().catch((err) => console.warn('[Mail] Unerwarteter Fehler:', err));
}
