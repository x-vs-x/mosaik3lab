import { MAX_ORDER_QUANTITY } from '@mosaik3lab/shared/werte/anfragen';
import type { CustomField } from '../../lib/types';

// Prüfung des Anfrageformulars vor dem Absenden – ohne Browser testbar (client/test/anfrageformular.test.ts).
// Der Server prüft dasselbe noch einmal; hier geht es nur um schnelle, verständliche Hinweise am Feld.

export const normalizeDomain = (d: string) => d.trim().toLowerCase().replace(/^@/, '');

export function emailDomainAllowed(email: string, domains: string[]) {
  if (domains.length === 0) return true;
  const domain = email.split('@').pop()?.toLowerCase() ?? '';
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function domainHint(domains: string[]) {
  if (domains.length === 0) return 'Bitte Ihre dienstliche Adresse verwenden. Das Team meldet sich darüber bei Rückfragen.';
  const list = domains.map((d) => `@${d}`);
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} oder ${list[list.length - 1]}`;
  return `Bitte Ihre Adresse ${joined} verwenden.`;
}

export interface AnfrageEingaben {
  /** Gültige E-Mail der Anfrage (angemeldet: die eigene, sonst die eingetippte). */
  email: string;
  /** Angemeldet: E-Mail steht fest, die Domain-Regel gilt nicht. */
  angemeldet: boolean;
  domains: string[];
  classOrTeam: string;
  rows: { quantity: number; colors: Record<string, string> }[];
  /** IDs der Farbbereiche mit vorrätigen Farben bzw. ohne vorrätige Farbe. */
  bereiche: string[];
  leereBereiche: string[];
  /** Schlüssel der Fehlermeldung einer Farbe (Zeile 0 = erste Farbe). */
  farbFehlerSchluessel: (areaId: string, row?: number) => string;
  customFields: CustomField[];
  custom: Record<string, string>;
  sizes: string[];
  size: string;
}

/** Fehler je Feld (leer = alles in Ordnung). */
export function pruefeAnfrage(e: AnfrageEingaben): Record<string, string> {
  const fehler: Record<string, string> = {};
  if (!e.email) fehler.requesterEmail = 'Bitte Ihre Schul-E-Mail eintragen';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)) fehler.requesterEmail = 'Bitte eine gültige E-Mail-Adresse eintragen, z. B. name@schule.example';
  else if (!e.angemeldet && !emailDomainAllowed(e.email, e.domains)) fehler.requesterEmail = domainHint(e.domains);
  if (!e.classOrTeam.trim()) fehler.classOrTeam = 'Bitte Klasse oder Team angeben';
  e.rows.forEach((row, i) => {
    for (const id of e.bereiche) if (!row.colors[id]) fehler[e.farbFehlerSchluessel(id, i)] = 'Bitte eine Farbe wählen';
  });
  const total = e.rows.reduce((n, r) => n + r.quantity, 0);
  if (total > MAX_ORDER_QUANTITY) fehler.quantity = `Zusammen höchstens ${MAX_ORDER_QUANTITY} Stück`;
  for (const id of e.leereBereiche) fehler[e.farbFehlerSchluessel(id)] = 'Derzeit ist keine Farbe vorrätig';
  for (const f of e.customFields) {
    const value = (e.custom[f.id] ?? '').trim();
    if (f.required && !value) fehler[`custom.${f.id}`] = 'Pflichtfeld';
    else if (value.length > f.maxLength) fehler[`custom.${f.id}`] = `Höchstens ${f.maxLength} Zeichen`;
    else if (value && f.type === 'number' && !/^-?\d+([.,]\d+)?$/.test(value)) fehler[`custom.${f.id}`] = 'Bitte eine Zahl eingeben';
  }
  if (e.sizes.length > 0 && !e.size) fehler.size = 'Bitte eine Größe wählen';
  return fehler;
}
