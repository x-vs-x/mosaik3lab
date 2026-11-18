import { ANFANGSSTATUS } from '../einstellungen/einstellungen.vorgaben';
import { type Filament } from '@mosaik3lab/shared/stammdaten';
import type { Storage } from '../../storage';
import { openDb } from '../../kern/db';
import { benachrichtigeImHintergrund } from '../../kern/mail/hintergrund';
import { readMailConfig } from '../../kern/mail/mailConfig';
import { adminLink, baseUrl, escapeHtml, formatMailDate, sendMail, type BuiltMail } from '../../kern/mail/mailer';
import { linksNurImSchulnetz, type MailLinks } from '../../kern/mail/erreichbarkeit';
import { badge, button, C, fieldTable, FONT, FOOTER_TEAM, html, NO_LINK, renderLayout, schulnetzText, small, textFooter } from '../../kern/mail/layout';
import type { Item } from '../../domain/types';
import type { Order, OrderColorChoice } from '@mosaik3lab/shared/anfragen';
import { EGAL_FARBE } from '@mosaik3lab/shared/anfragen';
import { filamentRolle } from '@mosaik3lab/shared/stammdaten';
import { emailSchema } from '@mosaik3lab/shared/basis';

// Vorlage der Benachrichtigung bei neuen Anfragen (HTML + Text-Alternative, keine Anhänge).
// Neue Bestellfelder nur in `orderMailFields` ergänzen – Text, HTML und Änderungsvergleich passen sich an.
// Aussehen (Kopf, Knopf, Tabelle, Fuß) gemeinsam für alle Mails: kern/mail/layout.ts.

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

export const orderAdminUrl = (order: Order, appUrl: string) => adminLink(appUrl, 'bestellungen', order.id);

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
  settings: MailLinks,
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
  const nurSchulnetz = !!link && linksNurImSchulnetz(settings);
  const view: MailView = { kind, number: order.number, summary, changes, fields, link, nurSchulnetz, notice: options.notice ?? '', replyTo: !!replyTo };
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
  /** Hinweis „Link nur im Schulnetz“ zeigen. */
  nurSchulnetz: boolean;
  notice: string;
  replyTo: boolean;
}

const REPLY_HINT = 'Mit „Antworten“ schreiben Sie direkt an die Lehrkraft.';
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
      lines.push(isLong(c) ? `- ${c.label}:\n  vorher: ${indent(c.before)}\n  jetzt:  ${indent(c.after)}` : `- ${c.label}: ${orEmpty(c.before)} → ${orEmpty(c.after)}`);
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
  lines.push('', v.link ? `Anfrage öffnen: ${v.link}` : NO_LINK, ...schulnetzText(v.nurSchulnetz));
  if (v.replyTo) lines.push(REPLY_HINT);
  lines.push('', textFooter(FOOTER_TEAM));
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

const spacer = (h: number) => `<div style="height:${h}px;line-height:${h}px;font-size:0">&nbsp;</div>`;

function renderHtml(v: MailView, subject: string, preheader: string) {
  const rows = v.fields.map((f) => {
    let value = html(f.value);
    if (f.href) value = `<a href="${escapeHtml(f.href)}" style="color:${C.brand}">${value}</a>`;
    if (f.anyColor) value = `${badge('Farbe egal', '#e0f2fe', '#075985', 13)} <span style="color:${C.muted};font-size:13px">Team wählt die Farbe</span>`;
    if (f.swatch) {
      value = `<span style="display:inline-block;width:14px;height:14px;line-height:14px;font-size:10px;border:1px solid #888;border-radius:3px;background-color:${f.swatch};vertical-align:middle;margin-right:6px">&nbsp;</span>${value}`;
    }
    return { label: f.label, valueHtml: value, changed: f.changed };
  });

  const notice = v.notice
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr><td bgcolor="${C.brandSoft}" style="${FONT};background-color:${C.brandSoft};border-left:4px solid ${C.brand};color:${C.text};font-size:15px;line-height:1.45;font-weight:bold;padding:12px 16px">${escapeHtml(v.notice)}</td></tr></table>`
    : '';

  let changeBox = '';
  if (v.changes) {
    const items = v.changes.length
      ? v.changes
          .map((c) => {
            const before = `<span style="color:${C.faint};text-decoration:line-through">${html(orEmpty(c.before))}</span>`;
            const after = `<b>${html(orEmpty(c.after))}</b>`;
            // Lange Texte (Bemerkungen) untereinander, kurze Angaben in einer Zeile.
            return isLong(c)
              ? `<li style="margin:0 0 4px"><b>${escapeHtml(c.label)}:</b><br>vorher: ${before}<br>jetzt: ${after}</li>`
              : `<li style="margin:0 0 4px"><b>${escapeHtml(c.label)}:</b> ${before} &rarr; ${after}</li>`;
          })
          .join('')
      : `<li style="margin:0">${escapeHtml(UNCHANGED)}</li>`;
    changeBox =
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr><td bgcolor="${C.changed}" style="${FONT};background-color:${C.changed};border-left:4px solid #f59e0b;color:${C.text};font-size:15px;line-height:1.45;padding:12px 16px">` +
      `<div style="font-weight:bold;color:${C.changedText};margin:0 0 6px">Was hat sich geändert?</div><ul style="margin:0;padding:0 0 0 18px">${items}</ul></td></tr></table>`;
  }

  const action = v.link ? spacer(16) + button('Anfrage öffnen', v.link, v.nurSchulnetz) : spacer(8) + small(NO_LINK);
  const kindBadge = v.changes ? badge(v.kind, '#fde68a', C.changedText) : badge(v.kind, C.brandSoft, C.brand);
  return renderLayout({
    title: subject,
    preheader,
    eyebrowHtml: `${kindBadge}&nbsp; ${escapeHtml(v.number)}`,
    heading: v.summary.headline,
    subheading: v.summary.details.join(' · '),
    contentHtml: notice + changeBox + fieldTable(rows) + action + (v.replyTo ? small(REPLY_HINT) : ''),
    footer: FOOTER_TEAM,
  });
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
    status: ANFANGSSTATUS,
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
  const notice = 'Testnachricht: Der Mailversand funktioniert. So sehen Benachrichtigungen aus – die Anfrage unten ist nur ein Beispiel.';
  // Beispielanfrage (isDemo) → ohne Reply-To: Die Beispieladresse soll keine Antworten bekommen.
  const sample = buildOrderMail(sampleOrder(), null, r.config, [], { notice });
  await sendMail(r.config, recipients, { ...sample, subject: `Testnachricht: ${sample.subject}` });
  return `Testmail an ${recipients.join(', ')} versendet.`;
}

/**
 * Benachrichtigt bei neuen Anfragen bzw. – mit `previous` (Stand vor der Änderung) – bei von der Lehrkraft geänderten.
 * Läuft im Hintergrund (kern/mail/hintergrund.ts): Ein Mailfehler verhindert nie die Anfrage.
 */
export function notifyNewOrder(storage: Storage, order: Order, item: Item | null = null, previous?: Order) {
  benachrichtigeImHintergrund(storage, order.number, async (config) => {
    const { filaments } = (await storage.settings.get()).masterData;
    return buildOrderMail(order, item, config, filaments, { previous });
  });
}
