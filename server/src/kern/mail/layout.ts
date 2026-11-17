import { escapeHtml } from './mailer';

// Gemeinsames Aussehen aller Mails (Anfragen, Vorschläge, Passwort-Links, Testmail).
// Für Outlook, Gmail, Apple Mail und Thunderbird: Tabellen-Layout, Inline-Styles, keine Bilder, keine externen Dateien.
// Die <style>-Regeln (Handy-Ansicht) sind nur Verbesserung – ohne sie bleibt die Mail lesbar (max. 600 px, sonst 100 %).
// Farben wie in der App (client/src/index.css): Rot brand-700 für Knopf und Links, Kopf in brand-banner, Steingrau-Töne.
// Vorschau aller Mailarten: server/scripts/mail-vorschau.ts.

export const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const C = {
  text: '#1c1917',
  muted: '#57534e',
  faint: '#6b645f',
  line: '#e7e5e4',
  page: '#f7f6f3',
  card: '#ffffff',
  banner: '#af2401',
  brand: '#b3241f',
  brandSoft: '#fdf3f2',
  brandLine: '#f6c5c1',
  changed: '#fef3c7',
  changedText: '#92400e',
} as const;

/** Farben der Mosaiksteine aus dem Logo – als schmaler Streifen unter dem Kopf. */
const MOSAIC = ['#f23838', '#3ccbfc', '#f5f55a', '#fa9b4d', '#b85e99', '#56bc52'];

export const html = (s: string) => escapeHtml(s).replace(/\r?\n/g, '<br>');

/** Absatz im Mailtext (Text wird escaped). */
export const para = (s: string, style = '') =>
  s ? `<p style="${FONT};margin:0 0 16px;font-size:16px;line-height:1.5;color:${C.text};${style}">${html(s)}</p>` : '';

/** Kleiner Hinweis (grau, kleiner). */
export const small = (s: string) => (s ? para(s, `font-size:14px;color:${C.muted}`) : '');

/** Kleines farbiges Kennzeichen („Neue Anfrage“, „geändert“, „Farbe egal“). */
export const badge = (text: string, bg: string, fg: string, size = 12) =>
  `<span style="${FONT};display:inline-block;background-color:${bg};color:${fg};font-size:${size}px;font-weight:bold;padding:2px 8px;border-radius:10px;letter-spacing:.3px">${escapeHtml(text)}</span>`;

/** Eine Zeile der Angaben-Tabelle; `valueHtml` ist schon fertiges (escaptes) HTML. */
export interface FieldRow {
  label: string;
  valueHtml: string;
  /** Zeile hervorheben (z. B. von der Lehrkraft geändert). */
  changed?: boolean;
}

/** Tabelle „Bezeichnung | Wert“ – auf dem Handy untereinander (Klassen f-l/f-v). */
export function fieldTable(rows: FieldRow[]) {
  if (!rows.length) return '';
  const body = rows
    .map((r) => {
      const bg = r.changed ? `background-color:${C.changed};` : '';
      const mark = r.changed ? ` ${badge('geändert', '#fde68a', C.changedText, 11)}` : '';
      return (
        `<tr><th class="f-l" scope="row" align="left" valign="top" width="130" style="${FONT};${bg}width:130px;padding:10px 12px 10px 0;color:${C.muted};font-size:14px;line-height:1.4;font-weight:bold;border-bottom:1px solid ${C.line}">${escapeHtml(r.label)}${mark}</th>` +
        `<td class="f-v" valign="top" style="${FONT};${bg}padding:10px 0;color:${C.text};font-size:15px;line-height:1.45;border-bottom:1px solid ${C.line};word-break:break-word;overflow-wrap:anywhere">${r.valueHtml}</td></tr>`
      );
    })
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid ${C.line};margin:0 0 8px">\n${body}\n</table>`;
}

/**
 * „Kugelsicherer“ Knopf: Hintergrund an der Zelle (Outlook), Innenabstand am Link (alle anderen, ganze Fläche klickbar).
 * Mindestens 48 px hoch, auf dem Handy volle Breite. Darunter der Link als Text, falls der Knopf nicht geht.
 */
export function button(label: string, url: string) {
  const href = escapeHtml(url);
  return (
    `<table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px"><tr>` +
    `<td align="center" bgcolor="${C.brand}" style="background-color:${C.brand};border-radius:8px;mso-padding-alt:14px 28px">` +
    `<a href="${href}" target="_blank" style="${FONT};display:block;padding:14px 28px;color:#ffffff;background-color:${C.brand};border-radius:8px;font-size:17px;line-height:20px;font-weight:bold;text-decoration:none;text-align:center">${escapeHtml(label)}</a>` +
    `</td></tr></table>` +
    `<p style="${FONT};margin:0 0 16px;font-size:13px;line-height:1.5;color:${C.muted}">Falls der Knopf nicht geht, diese Adresse im Browser öffnen:<br>` +
    `<a href="${href}" style="color:${C.brand};word-break:break-all;overflow-wrap:anywhere">${escapeHtml(url)}</a></p>`
  );
}

export interface LayoutOptions {
  /** = Betreff, für <title>. */
  title: string;
  /** Vorschautext im Postfach (unsichtbar im Mailtext). */
  preheader: string;
  /** Kleine Zeile über der Überschrift, fertiges HTML (z. B. Kennzeichen + Nummer). */
  eyebrowHtml?: string;
  heading: string;
  /** Zweite Zeile unter der Überschrift (grau). */
  subheading?: string;
  /** Inhalt, fertiges HTML. */
  contentHtml: string;
  /** Warum kommt diese Mail? (klein im Fuß) */
  footer: string;
}

/** Komplettes HTML-Dokument im Mosaik³LAB-Aussehen. */
export function renderLayout(o: LayoutOptions) {
  // Füllzeichen nach dem Preheader verhindern, dass das Postfach dahinter Mailtext als Vorschau zeigt.
  const pre = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};opacity:0">${escapeHtml(o.preheader)}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>`;
  const stripe = MOSAIC.map((c) => `<td width="16.66%" height="5" bgcolor="${c}" style="background-color:${c};height:5px;font-size:0;line-height:0">&nbsp;</td>`).join('');
  const eyebrow = o.eyebrowHtml ? `<p style="${FONT};margin:0 0 8px;font-size:13px;line-height:1.6;color:${C.faint}">${o.eyebrowHtml}</p>` : '';
  const sub = o.subheading ? `<p style="${FONT};margin:0 0 20px;font-size:16px;line-height:1.45;color:${C.muted}">${html(o.subheading)}</p>` : '';
  return `<!doctype html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(o.title)}</title>
<!--[if mso]><style>body,table,td,th,p,a,span{font-family:Arial,Helvetica,sans-serif !important}</style><![endif]-->
<style>
body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important}
@media only screen and (max-width:620px){
.outer{padding:0 !important}
.card{border-radius:0 !important;border-left:0 !important;border-right:0 !important}
.inner{padding:24px 20px !important}
.head{padding:16px 20px !important}
.btn{width:100% !important}
.f-l,.f-v{display:block !important;width:auto !important}
.f-l{padding:10px 0 0 !important;border-bottom:0 !important}
.f-v{padding:2px 0 10px !important}
h1{font-size:22px !important}
}
</style></head>
<body style="margin:0;padding:0;background-color:${C.page}">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page}"><tr><td class="outer" align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="max-width:600px;background-color:${C.card};border:1px solid ${C.line};border-radius:12px;overflow:hidden">
<tr><td class="head" bgcolor="${C.banner}" style="background-color:${C.banner};padding:18px 32px;border-radius:11px 11px 0 0">
<span style="${FONT};font-size:20px;line-height:24px;letter-spacing:2px;color:#ffffff;font-weight:normal">MOSAIK<span style="font-weight:bold">³LAB</span></span>
<span style="${FONT};display:block;font-size:13px;line-height:18px;color:#fbe3e1;margin-top:2px">3D-gedruckte Hilfs- und Lehrmittel</span>
</td></tr>
<tr><td style="padding:0;font-size:0;line-height:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${stripe}</tr></table></td></tr>
<tr><td class="inner" style="padding:32px">
${eyebrow}<h1 style="${FONT};margin:0 0 8px;font-size:24px;line-height:1.25;font-weight:bold;color:${C.text}">${html(o.heading)}</h1>
${sub || '<div style="height:12px;line-height:12px;font-size:0">&nbsp;</div>'}
${o.contentHtml}
</td></tr>
<tr><td bgcolor="${C.page}" style="background-color:${C.page};padding:16px 32px;border-top:1px solid ${C.line};border-radius:0 0 11px 11px">
<p style="${FONT};margin:0;font-size:12px;line-height:1.5;color:${C.faint}">${html(o.footer)}</p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
}

/** Fußzeile der Text-Fassung. */
export const textFooter = (footer: string) => `--\n${footer}`;

export const FOOTER_TEAM =
  'Automatische Nachricht von Mosaik³LAB. Sie bekommen sie, weil Ihre Adresse im Server-Manager für Benachrichtigungen eingetragen ist.';
export const FOOTER_KONTO = 'Automatische Nachricht von Mosaik³LAB. Sie bekommen sie, weil Sie in Mosaik³LAB ein Konto mit Passwort haben.';
export const NO_LINK = 'Hinweis: Im Server-Manager ist keine Adresse der App hinterlegt, daher fehlen Links.';
