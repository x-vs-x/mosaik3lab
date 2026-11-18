import type { ColorKey } from './stammdaten';

// Anfragen: feste Statusliste und Grenzen ohne zod – auch für den Client. Schemas und Typen in ../anfragen.ts.

/** Phase eines Bestellstatus – steuert Dashboard-Zahlen und Filter. */
export const STATUS_PHASES = ['open', 'active', 'done'] as const;
export type StatusPhase = (typeof STATUS_PHASES)[number];

export interface StatusTemplate {
  id: string;
  name: string;
  phase: StatusPhase;
  color: ColorKey;
  /** Kurze Erklärung (Stammdaten → Bestellstatus). */
  description: string;
  /** Standard bei Neuinstallation. */
  defaultActive: boolean;
  /** Kann nicht ausgeschaltet werden (Anfangsstatus neuer Anfragen). */
  required?: boolean;
}

// Feste Liste der Bestellstatus. Name, Phase, Farbe und Reihenfolge stehen hier;
// die Administration schaltet einzelne Status nur an oder aus. Das Symbol ordnet der Client über die ID zu (lib/constants.ts).
const KATALOG = [
  { id: 'offen', name: 'Offen', phase: 'open', color: 'orange', defaultActive: true, required: true, description: 'Neue Anfrage, noch nicht angesehen. Gilt immer für neue Anfragen.' },
  { id: 'in_pruefung', name: 'In Prüfung', phase: 'open', color: 'gelb', defaultActive: false, description: 'Das Team klärt Machbarkeit, Größe oder Rückfragen.' },
  { id: 'in_druck', name: 'In Druck', phase: 'active', color: 'blau', defaultActive: false, description: 'Wird gerade gedruckt oder nachbearbeitet.' },
  { id: 'gedruckt', name: 'Gedruckt', phase: 'done', color: 'gruen', defaultActive: true, description: 'Fertig gedruckt.' },
  { id: 'abholbereit', name: 'Abholbereit', phase: 'done', color: 'lila', defaultActive: false, description: 'Liegt zur Abholung bzw. Übergabe bereit.' },
  { id: 'uebergeben', name: 'Übergeben', phase: 'done', color: 'gruen', defaultActive: false, description: 'An die Lehrkraft übergeben.' },
  { id: 'abgelehnt', name: 'Abgelehnt', phase: 'done', color: 'rot', defaultActive: false, description: 'Kann nicht gedruckt werden, z. B. technisch nicht machbar.' },
  { id: 'storniert', name: 'Storniert', phase: 'done', color: 'grau', defaultActive: false, description: 'Von der Lehrkraft zurückgezogen.' },
] as const satisfies readonly StatusTemplate[];
/** ID eines festen Bestellstatus (Tippfehler in Zuordnungen wie STATUS_ICONS fallen so beim Typecheck auf). */
export type StatusId = (typeof KATALOG)[number]['id'];
export const STATUS_CATALOG: readonly (StatusTemplate & { id: StatusId })[] = KATALOG;

/** Höchstzahl Stück je Anfrage (auch die Summe aller Farbvarianten). */
export const MAX_ORDER_QUANTITY = 20;
/** Höchstzahl Farbvarianten (Zeilen „Stück × Farbe“) je Anfrage. */
export const MAX_ORDER_VARIANTS = 10;
/** Höchstlängen der freien Angaben einer Anfrage. */
export const ORDER_CLASS_MAX = 60;
export const ORDER_CUSTOMIZATION_MAX = 1000;

/** Sonderwert statt Filament-ID: Der Lehrkraft ist die Farbe dieses Bereichs egal (bei jedem Druckteil wählbar). */
export const EGAL_FARBE = 'egal';
export const EGAL_FARBE_NAME = 'Farbe egal';
