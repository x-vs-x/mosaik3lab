// Merkt sich Anfragen und Formulareingaben auf diesem Gerät (localStorage),
// damit Lehrkräfte ohne Anmeldung ihre Anfragen wiederfinden.
// Gespeichert werden nur Anfrage-Codes (falls Statusanzeige aktiv) sowie
// Schul-E-Mail und Klasse zum Vorausfüllen – keine Inhalte.

const CODES_KEY = 'm3l.anfrage-codes';
const PROFILE_KEY = 'm3l.formular';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* z. B. privater Modus – dann eben nicht merken */
  }
}

export function normalizeCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Darstellung „ABCD-EFGH“ – leichter abzulesen und abzuschreiben. */
export function formatCode(code: string) {
  const c = normalizeCode(code);
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

export function getSavedCodes(): string[] {
  const list = read<unknown>(CODES_KEY, []);
  return Array.isArray(list) ? list.filter((c): c is string => typeof c === 'string').map(normalizeCode) : [];
}

export function saveCode(code: string) {
  const c = normalizeCode(code);
  const codes = getSavedCodes().filter((x) => x !== c);
  write(CODES_KEY, [c, ...codes].slice(0, 50));
}

export function forgetCode(code: string) {
  const c = normalizeCode(code);
  write(CODES_KEY, getSavedCodes().filter((x) => x !== c));
}

/** Zum Vorausfüllen des Bestellformulars beim nächsten Mal. */
export interface FormProfile {
  requesterEmail: string;
  classOrTeam: string;
}

export function getProfile(): FormProfile {
  const p = read<Partial<FormProfile>>(PROFILE_KEY, {});
  return {
    requesterEmail: typeof p.requesterEmail === 'string' ? p.requesterEmail : '',
    classOrTeam: typeof p.classOrTeam === 'string' ? p.classOrTeam : '',
  };
}

export function saveProfile(profile: FormProfile) {
  write(PROFILE_KEY, profile);
}
