import { z } from 'zod';
import { emailSchema, text } from './basis';
import { MAX_CUSTOM_VALUE_LENGTH } from './katalog';
import type { ColorKey } from './stammdaten';
import { MAX_ORDER_QUANTITY, MAX_ORDER_VARIANTS, ORDER_CLASS_MAX, ORDER_CUSTOMIZATION_MAX, type StatusPhase } from './werte/anfragen';

// Anfragen (Bestellungen) der Lehrkräfte. Die feste Liste der Bearbeitungsstatus und Grenzen ohne zod stehen in
// werte/anfragen.ts (auch für den Client) – hier wieder exportiert.
export * from './werte/anfragen';

/** Ein Status in den Stammdaten (feste Liste, nur an-/ausschaltbar). */
export interface OrderStatusDef {
  id: string;
  name: string;
  phase: StatusPhase;
  color: ColorKey;
  /** Ausgeschaltete Status sind nicht wählbar und erscheinen nicht auf der Übersicht. */
  active: boolean;
}

/** Bestellstatus sind fest – nur an-/ausschalten. */
export const statusToggleSchema = z.object({ active: z.boolean() });

/** Farbbereich-ID → Filament-ID (oder EGAL_FARBE). */
const colorMapSchema = z.record(z.string().max(64), text(1, 64)).refine((r) => Object.keys(r).length <= 20, 'Zu viele Farbbereiche');

export const orderInputSchema = z.object({
  itemId: text(1, 64),
  quantity: z.number().int().min(1).max(MAX_ORDER_QUANTITY),
  /** Filament-ID bei einem Farbbereich (ältere Clients) – muss in den Farben des Druckteils enthalten sein. */
  color: text(1, 64).optional(),
  /** Farbbereich-ID → Filament-ID (mehrfarbige Drucke). */
  colors: colorMapSchema.optional(),
  /**
   * Mehrere Farben in einer Anfrage (z. B. 3 × Blau, 4 × Gelb). Wenn gesetzt, gilt beim Server `quantity` = Summe
   * der Varianten und die erste Variante als bisherige Farbe. Ohne `variants` wie bisher.
   */
  variants: z
    .array(z.object({ quantity: z.number().int().min(1).max(MAX_ORDER_QUANTITY), colors: colorMapSchema }))
    .min(1)
    .max(MAX_ORDER_VARIANTS)
    .optional(),
  /** Leer, wenn das Druckteil keine Größen hat. */
  size: z.string().trim().max(60).default(''),
  requesterEmail: emailSchema,
  classOrTeam: text(1, ORDER_CLASS_MAX),
  customization: z.string().trim().max(ORDER_CUSTOMIZATION_MAX).default(''),
  /** Feld-ID → Angabe (Personalisierung); Pflicht, Länge und Typ prüft der Server (module/anfragen/anfragen.service.ts) je Druckteil. */
  personalization: z
    .record(z.string().max(64), z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().max(MAX_CUSTOM_VALUE_LENGTH)))
    .refine((r) => Object.keys(r).length <= 20, 'Zu viele Angaben')
    .default({}),
  /** ID der Anfrage, die erneut angefragt wird (wird nur für eigene Anfragen übernommen). */
  repeatOf: z.string().max(64).optional(),
});
/** POST /api/orders, wie die Oberfläche sie sendet: Farbe je Farbbereich. */
export type OrderInput = Omit<z.infer<typeof orderInputSchema>, 'color' | 'colors'> & { colors: Record<string, string> };

/** Sperrhinweis bei PUT /api/orders/:id (409), wenn das Team die Anfrage schon bearbeitet. */
export const ORDER_LOCKED_MESSAGE = 'Die Anfrage wird schon bearbeitet und kann nicht mehr geändert werden.';

const trackingCode = z
  .string()
  .trim()
  .toUpperCase()
  .transform((c) => c.replace(/[^A-Z0-9]/g, ''))
  .pipe(z.string().length(8));

export const trackSchema = z.object({ codes: z.array(trackingCode).min(1).max(50) });

export const statusUpdateSchema = z.object({
  status: text(1, 64),
  comment: z.string().trim().max(500).default(''),
});

/** Gewählte Farbe je Farbbereich (Schnappschuss zum Zeitpunkt der Anfrage). */
export interface OrderColorChoice {
  areaId: string;
  area: string;
  colorId: string;
  /** Lesbarer Farbname, z. B. „Turquoise · Bambu Lab PLA Basic“. */
  color: string;
  colorHex: string;
}

/** Ein Teil der Stückzahl in eigener Farbe (mehrere Farben in einer Anfrage). */
export interface OrderColorVariant {
  quantity: number;
  colorChoices: OrderColorChoice[];
}

/** Lesbarer Farbtext: ein Bereich = Farbname, sonst „Bereich: Farbe; …“. */
export const colorChoicesText = (choices: OrderColorChoice[]) =>
  choices.length === 1 ? choices[0].color : choices.map((c) => `${c.area}: ${c.color}`).join('; ');

/** Kurze Aufteilung, z. B. „3 × Blau, 4 × Gelb“ (mehrfarbige Drucke in Klammern). */
export const colorVariantsText = (variants: OrderColorVariant[]) =>
  variants
    .map((v) => `${v.quantity} × ${v.colorChoices.length > 1 ? `(${colorChoicesText(v.colorChoices)})` : colorChoicesText(v.colorChoices)}`)
    .join(', ');

/** Angabe zu einem Personalisierungsfeld (Bezeichnung als Schnappschuss). */
export interface OrderCustomValue {
  fieldId: string;
  label: string;
  value: string;
}

export interface StatusEntry {
  /** ID eines Bestellstatus aus den Stammdaten. */
  status: string;
  at: string;
  byUserId: string;
  byName: string;
  comment: string;
}

/**
 * Eine Anfrage einer Lehrkraft – ohne Anmeldung, mit Schul-E-Mail und Klasse.
 * Bewusst ohne Schülernamen oder Diagnosen – es wird nur Klasse/Team erfasst.
 */
export interface Order {
  id: string;
  number: string;
  itemId: string;
  itemName: string;
  quantity: number;
  /** Lesbarer Farbname als Schnappschuss, z. B. „Turquoise · Bambu Lab PLA Basic“. */
  color: string;
  /** ID der Farbrolle (Filament) zum Zeitpunkt der Anfrage – leer bei älteren Anfragen. */
  colorId: string;
  /** Farbwert der Farbrolle zum Zeitpunkt der Anfrage (#RRGGBB) – leer bei älteren Anfragen. */
  colorHex: string;
  /** Farbe je Farbbereich – leer bei älteren Anfragen (dann gilt color/colorId). */
  colorChoices: OrderColorChoice[];
  /** Aufteilung auf mehrere Farben – leer bei nur einer Farbe und bei älteren Anfragen (dann gilt colorChoices). */
  colorVariants: OrderColorVariant[];
  size: string;
  classOrTeam: string;
  customization: string;
  /** Angaben zu den Personalisierungsfeldern des Druckteils. */
  personalization: OrderCustomValue[];
  /** ID eines Bestellstatus aus den Stammdaten. */
  status: string;
  history: StatusEntry[];
  /** ID der Lehrkraft im Besteller-Verzeichnis (per Schul-E-Mail angelegt). */
  requesterId: string | null;
  /** Schul-E-Mail der anfragenden Lehrkraft. */
  requesterEmail: string;
  /** Anzeigename (derzeit die E-Mail-Adresse; bei älteren Anfragen ein eingetragener Name). */
  requesterName: string;
  /** Zufälliger Code, mit dem die Anfrage ohne Anmeldung abgerufen werden kann (derzeit abgeschaltet). */
  trackingCode: string;
  isDemo: boolean;
  /** ID der Anfrage, aus der diese per „Erneut anfragen“ entstanden ist. */
  repeatOf?: string;
  createdAt: string;
  updatedAt: string;
}

/** Antwort auf POST /api/orders für Lehrkräfte (kein Status, kein Code). */
export interface OrderReceipt {
  id: string;
  number: string;
  itemName: string;
}

/** Vorbelegung für „Erneut anfragen“ (GET /api/orders/:id/vorlage). */
export interface RequestTemplate {
  orderId: string;
  number: string;
  itemId: string;
  itemName: string;
  /** false: Druckteil nicht mehr veröffentlicht – dann nur `hinweise`. */
  available: boolean;
  quantity?: number;
  colors?: Record<string, string>;
  /** Alle Farbvarianten, wenn die Anfrage mehrere Farben hatte (dann gilt quantity als Summe). */
  variants?: { quantity: number; colors: Record<string, string> }[];
  size?: string;
  classOrTeam?: string;
  customization?: string;
  personalization?: Record<string, string>;
  hinweise: string[];
}

/** GET /api/orders/mine – eigene Anfragen der angemeldeten Lehrkraft (Status, Verlauf, Code nur bei requesterTracking). */
export type OwnOrder = Pick<
  Order,
  'id' | 'number' | 'itemId' | 'itemName' | 'quantity' | 'color' | 'colorHex' | 'colorChoices' | 'colorVariants' | 'size' | 'classOrTeam' | 'customization' | 'personalization' | 'isDemo' | 'createdAt'
> &
  Partial<Pick<Order, 'status' | 'history' | 'trackingCode'>> & {
    itemImages?: string[];
    itemCategory?: string;
    /** Die Lehrkraft darf die Anfrage noch ändern (Status „offen“) – vom Server berechnet. */
    editable: boolean;
  };

/**
 * Lehrkraft, die per Schul-E-Mail bestellt (ohne Passwort, ohne Profil).
 * Wird beim ersten Bestellen automatisch angelegt oder auf der Login-Seite („Jetzt Konto anlegen“).
 */
export interface Requester {
  id: string;
  email: string;
  createdAt: string;
  /** Leer, solange noch keine Anfrage gestellt wurde (selbst angelegt beim Login). */
  lastOrderAt: string;
  /** Häkchen „Druckteile anfragen“ (Standard: an). Aus = Anfragen mit dieser Adresse werden abgelehnt. */
  darfAnfragen: boolean;
  /** Häkchen „Druckteile vorschlagen“ (Standard: an). */
  darfVorschlagen: boolean;
}

/** GET /api/orders/requesters */
export type RequesterView = Requester & { orderCount: number };

export interface DashboardData {
  items: { total: number; published: number };
  orders: { open: number; printing: number; completed: number; byStatus: Record<string, number> };
  latest: Order[];
}
