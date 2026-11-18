// Personen: Rollen, Prüfpunkte, Bereiche (Häkchen) und Grenzen ohne zod – auch für den Client.
// Schemas und Typen der Konten in ../konten.ts (exportiert alles von hier wieder). Prüf-Logik: server/src/module/konten/rechte.ts.

export const ROLES = ['admin', 'druckteam', 'lehrkraft'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  druckteam: '3D-Druck-Team',
  lehrkraft: 'Lehrkraft',
};

/** Ein Satz je Rolle für die Verwaltung („darf …“). */
export const ROLE_SAETZE: Record<Role, string> = {
  lehrkraft: 'Meldet sich nur mit der Schul-E-Mail an, ohne Passwort.',
  druckteam: 'Darf die angehakten Bereiche bearbeiten. Braucht ein Passwort.',
  admin: 'Darf alles, auch Personen und Einstellungen verwalten. Braucht ein Passwort.',
};

/** Rollen mit eigenem Konto (Anmeldung mit E-Mail + Passwort). Lehrkräfte melden sich ohne Passwort an. */
export const ACCOUNT_ROLES = ['admin', 'druckteam'] as const satisfies readonly Role[];
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

// --- Prüfpunkte (intern, nie einzeln vergeben) --------------------------------------
export const PERMISSIONS = [
  'orders:own', // eigene Anfragen
  'vorschlaege:eigene', // eigene Vorschläge
  'orders:view',
  'orders:manage',
  'dashboard:view',
  'catalog:view', // Entwürfe und Druckdatei-Liste
  'catalog:manage',
  'files:models',
  'daten:export', // Druckteile exportieren
  'daten:import', // Druckteile einspielen
  'vorschlaege:sehen',
  'vorschlaege:bearbeiten',
  'vorschlaege:umwandeln',
  'filaments:manage',
  'masterdata:manage',
  'settings:manage',
  'users:manage',
] as const;

/** Prüfpunkt, z. B. „catalog:manage“. */
export type Permission = (typeof PERMISSIONS)[number];

// --- Bereiche (die Häkchen in der Verwaltung) ---------------------------------------
// Neuer Bereich: Eintrag anfügen. `fuer` = Lehrkraft-Häkchen (gilt für alle Personen) oder Druck-Team-Häkchen.

interface BereichTemplate {
  key: string;
  fuer: 'lehrkraft' | 'druckteam';
  label: string;
  /** Ein Satz „Darf …“. */
  satz: string;
  rechte: readonly Permission[];
  /** Beim Anlegen bzw. beim Wechsel in die Rolle angehakt. */
  standard: boolean;
}

export const BEREICHE = [
  {
    key: 'anfragen',
    fuer: 'lehrkraft',
    label: 'Druckteile anfragen',
    satz: 'Darf Druckteile anfragen und die eigenen Anfragen sehen und ändern, solange sie noch offen sind.',
    rechte: ['orders:own'],
    standard: true,
  },
  {
    key: 'vorschlaege',
    fuer: 'lehrkraft',
    label: 'Druckteile vorschlagen',
    satz: 'Darf neue Druckteile vorschlagen und die eigenen Vorschläge sehen.',
    rechte: ['vorschlaege:eigene'],
    standard: true,
  },
  {
    key: 'team-anfragen',
    fuer: 'druckteam',
    label: 'Anfragen bearbeiten',
    satz: 'Darf alle Anfragen, die Lehrkräfte-Liste und die Übersicht sehen und den Stand der Anfragen ändern.',
    rechte: ['orders:view', 'orders:manage', 'dashboard:view'],
    standard: true,
  },
  {
    key: 'team-druckteile',
    fuer: 'druckteam',
    label: 'Druckteile pflegen',
    satz: 'Darf Druckteile samt Entwürfen, Bildern, Videos und Druckdateien anlegen, ändern, exportieren und einspielen.',
    rechte: ['catalog:view', 'catalog:manage', 'files:models', 'daten:export', 'daten:import'],
    standard: true,
  },
  {
    key: 'team-vorschlaege',
    fuer: 'druckteam',
    label: 'Vorschläge bearbeiten',
    satz: 'Darf Vorschläge der Lehrkräfte sehen, beantworten und (zusammen mit „Druckteile pflegen“) in Druckteile umwandeln.',
    rechte: ['vorschlaege:sehen', 'vorschlaege:bearbeiten', 'vorschlaege:umwandeln'],
    standard: true,
  },
  {
    key: 'team-farbrollen',
    fuer: 'druckteam',
    label: 'Farbrollen leer/vorrätig',
    satz: 'Darf Farbrollen als leer oder wieder vorrätig markieren.',
    rechte: ['filaments:manage'],
    standard: true,
  },
  {
    key: 'stammdaten',
    fuer: 'druckteam',
    label: 'Stammdaten pflegen',
    satz: 'Darf Kategorien, Einsatzbereiche, Material und Farben anlegen und ändern.',
    rechte: ['masterdata:manage'],
    standard: false,
  },
] as const satisfies readonly BereichTemplate[];

export type Bereich = (typeof BEREICHE)[number]['key'];
export const BEREICH_KEYS = BEREICHE.map((b) => b.key) as Bereich[];
export const LEHRKRAFT_BEREICHE = BEREICHE.filter((b) => b.fuer === 'lehrkraft').map((b) => b.key) as Bereich[];
export const TEAM_BEREICHE = BEREICHE.filter((b) => b.fuer === 'druckteam').map((b) => b.key) as Bereich[];
export const STANDARD_BEREICHE = BEREICHE.filter((b) => b.standard).map((b) => b.key) as Bereich[];

/** Nur der Administrator: Personen und Einstellungen (inkl. Ablauf der Anfragen). */
const ADMIN_RECHTE: readonly Permission[] = ['settings:manage', 'users:manage'];

/**
 * Wirksame Prüfpunkte einer Person. Lehrkraft-Häkchen gelten für alle Rollen; Druck-Team-Häkchen nur im
 * Druck-Team; der Administrator hat alle Druck-Team-Bereiche und zusätzlich die Admin-Rechte.
 */
export function rechteFuer(role: Role, bereiche: readonly Bereich[]): Permission[] {
  const an = new Set<Bereich>(bereiche.filter((b) => LEHRKRAFT_BEREICHE.includes(b)));
  if (role === 'druckteam') for (const b of bereiche) if (TEAM_BEREICHE.includes(b)) an.add(b);
  if (role === 'admin') for (const b of TEAM_BEREICHE) an.add(b);
  const set = new Set<Permission>(BEREICHE.filter((b) => an.has(b.key)).flatMap((b) => b.rechte));
  if (role === 'admin') for (const p of ADMIN_RECHTE) set.add(p);
  return PERMISSIONS.filter((p) => set.has(p));
}

/** Passwort frei wählbar, nur mindestens 8 Zeichen. */
export const MIN_PASSWORT = 8;
