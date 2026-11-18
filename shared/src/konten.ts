import { z } from 'zod';
import { emailSchema, text } from './basis';
import { BEREICH_KEYS, MIN_PASSWORT, ROLES, type Bereich, type Role } from './werte/konten';

// Listen, Rollen, Bereiche und Grenzen ohne zod stehen in werte/konten.ts (auch für den Client) – hier wieder exportiert.
export * from './werte/konten';

// Personen, Rollen und Rechte. Für die Verwaltung gibt es nur drei Rollen und wenige Häkchen („Bereiche“);
// jeder Bereich schaltet intern feste Prüfpunkte frei (Permission), gegen die der Server prüft.
// Die Prüf-Logik steht nur im Server: server/src/domain/permissions.ts.

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
