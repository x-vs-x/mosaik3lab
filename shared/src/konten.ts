import { z } from 'zod';
import { emailSchema, text } from './basis';

// Personen, Rollen und Rechte. Für die Verwaltung gibt es nur drei Rollen und wenige Häkchen („Bereiche“);
// jeder Bereich schaltet intern feste Prüfpunkte frei (Permission), gegen die der Server prüft.
// Die Prüf-Logik steht nur im Server: server/src/domain/permissions.ts.

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

// --- Konten und Anmeldung -----------------------------------------------------------

/** Konto von Admin oder Druck-Team ohne Passwort-Hash (so verlässt es den Server). */
export interface Account {
  id: string;
  username: string;
  /** Anmelde-E-Mail – eindeutig, klein geschrieben. */
  email: string;
  displayName: string;
  role: Role;
  /** Aus = nur noch Lehrkraft (meldet sich wieder ohne Passwort an). */
  active: boolean;
  /** Demo-Zugang – wird im Produktivbetrieb gesperrt. */
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  /** Angehakte Druck-Team-Bereiche (beim Administrator ohne Bedeutung). */
  teamBereiche: Bereich[];
  /** Falsche Passwort-Eingaben in Folge; ab MAX_FEHLVERSUCHE ist das Konto für SPERRE_MS gesperrt. */
  fehlversuche: number;
  /** Zeitpunkt der Sperre (ISO) – null = nicht gesperrt bzw. Sperre aus älterer Version (gilt als abgelaufen). */
  gesperrtSeit?: string | null;
}

/** Nach so vielen falschen Passwörtern in Folge wird das Konto gesperrt (Mail zum Zurücksetzen). */
export const MAX_FEHLVERSUCHE = 10;
/** Die Sperre endet nach einer Stunde von selbst – sonst könnte jeder, der die Adresse kennt, ein Konto dauerhaft aussperren. */
export const SPERRE_MS = 60 * 60_000;

/** Ist das Konto gerade gesperrt? (genug Fehlversuche und Sperre jünger als SPERRE_MS) */
export function istGesperrt(a: Pick<Account, 'fehlversuche' | 'gesperrtSeit'>, now = Date.now()) {
  if (a.fehlversuche < MAX_FEHLVERSUCHE || !a.gesperrtSeit) return false;
  return now - Date.parse(a.gesperrtSeit) < SPERRE_MS;
}

/** Passwort-Stand eines Kontos: gesetzt, noch nicht festgelegt (Link verschickt) oder gesperrt nach Fehlversuchen. */
export type PasswortStand = 'gesetzt' | 'ausstehend' | 'gesperrt';

/** Eine Person in der Verwaltung (GET /api/personen): Lehrkraft und ggf. Konto mit derselben E-Mail. */
export interface Person {
  email: string;
  /** Anzeigename des Kontos, sonst die E-Mail. */
  name: string;
  /** Wirksame Rolle (ohne aktives Konto: Lehrkraft). */
  role: Role;
  /** Angehakte Häkchen (Lehrkraft- und Druck-Team-Bereiche). */
  bereiche: Bereich[];
  /** Nur bei Konten. */
  passwort: PasswortStand | null;
  isDemo: boolean;
  lastLoginAt: string | null;
  orderCount: number;
  /** Letzte Anfrage (leer = noch keine). */
  lastOrderAt: string;
}

/** Ergebnis, wenn ein Passwort-Link erzeugt wurde: per Mail verschickt oder (ohne Mailversand) zum Weitergeben. */
export interface PasswortLinkErgebnis {
  gesendet: boolean;
  /** Nur wenn nicht gesendet werden konnte: Der Client baut daraus den Link (…/passwort#token) zum Weitergeben. */
  token?: string;
  /** Warum nicht gesendet (z. B. „Der Mailversand ist nicht eingerichtet.“). */
  grund?: string;
}

/** PUT /api/personen – Antwort. */
export interface PersonGespeichert {
  person: Person;
  /** Gesetzt, wenn die Person jetzt ein Passwort festlegen muss. */
  passwortLink: PasswortLinkErgebnis | null;
}

/**
 * Angemeldete Person aus Sicht des Clients: ein Konto (Admin/Druck-Team) oder
 * eine Lehrkraft aus dem Besteller-Verzeichnis (ohne Passwort, Rolle „lehrkraft“).
 */
export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  /** Nur bei Konten; Lehrkräfte haben keinen Benutzernamen. */
  username: string | null;
  isDemo: boolean;
  lastLoginAt: string | null;
}

/** POST /api/auth/identify – Schritt 1 der Anmeldung. */
export type IdentifyResult = 'password' | 'signed-in' | 'unknown';

/** Passwort frei wählbar, nur mindestens 8 Zeichen. */
export const MIN_PASSWORT = 8;
// Höchstens 72 Byte: mehr wertet das Verfahren (bcrypt) nicht aus – längere Passwörter wären nur scheinbar sicherer.
const passwordSchema = z
  .string()
  .min(MIN_PASSWORT, `Mindestens ${MIN_PASSWORT} Zeichen`)
  .refine((p) => new TextEncoder().encode(p).length <= 72, 'Höchstens 72 Zeichen (Umlaute zählen doppelt)');

/** Schritt 1 der Anmeldung: Wer ist das? */
export const identifySchema = z.object({ email: emailSchema });

/** Schritt 2 der Anmeldung (nur Konten von Admin/Druck-Team). */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(1000),
});

/** Rechte einer Person festlegen (und Person bei Bedarf anlegen). Schlüssel ist die E-Mail. */
export const personSchema = z.object({
  email: emailSchema,
  name: z.string().trim().max(80).optional(),
  role: z.enum(ROLES),
  bereiche: z.array(z.enum(BEREICH_KEYS as [Bereich, ...Bereich[]])).max(BEREICH_KEYS.length),
});
export type PersonInput = z.infer<typeof personSchema>;

/** Erstes Administrator-Konto (Server-Manager, Skript user:create-admin). */
export const adminCreateSchema = z.object({
  email: emailSchema,
  displayName: text(2, 80),
  password: passwordSchema,
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(1000),
  newPassword: passwordSchema,
});

/** „Passwort vergessen?“ */
export const passwortVergessenSchema = z.object({ email: emailSchema });

/** Passwort über den Link aus der Mail festlegen. */
export const passwortSetzenSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, 'Ungültiger Link'),
  password: passwordSchema,
});
