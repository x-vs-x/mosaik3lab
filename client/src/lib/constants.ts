// Darstellung von Stammdaten: Farben, Symbole, Kategorie- und Status-Helfer (Farbrollen: lib/colors.ts).
// Die eigentlichen Listen kommen aus der Konfiguration (lib/config.tsx).
import {
  Accessibility,
  Ban,
  BookOpen,
  CircleCheck,
  CircleX,
  Handshake,
  Hand,
  Heart,
  Inbox,
  MessageCircle,
  PackageCheck,
  Music,
  Pencil,
  Printer,
  Puzzle,
  SearchCheck,
  Shapes,
  Sparkles,
  Utensils,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { STATUS_CATALOG } from '@mosaik3lab/shared/werte/anfragen';
import type { Category, ColorKey, IconKey, MasterData, OrderStatusDef, StatusPhase } from './types';

export { ROLE_LABELS } from '@mosaik3lab/shared/werte/konten';
export { COLOR_KEYS, ICON_KEYS } from '@mosaik3lab/shared/werte/stammdaten';

// --- Farben (Mosaiksteine des Schullogos + Grau) ---------------------------------
interface ColorStyle {
  label: string;
  /** Kachelverlauf für Platzhalterbilder */
  tile: string;
  iconColor: string;
  /** Kleines Label / Badge */
  chip: string;
  /** Punkt / Fortschritt */
  dot: string;
  /** Exakter Farbwert des Mosaiksteins */
  swatch: string;
}

// Alle Klassen ausgeschrieben, damit Tailwind sie erkennt.
export const COLOR_STYLES: Record<ColorKey, ColorStyle> = {
  blau: { label: 'Hellblau', tile: 'from-sky-100 via-sky-50 to-white', iconColor: 'text-sky-700', chip: 'bg-sky-50 text-sky-800 ring-sky-200', dot: 'bg-sky-600', swatch: '#3ccbfc' },
  rot: { label: 'Rot', tile: 'from-red-100 via-red-50 to-white', iconColor: 'text-red-700', chip: 'bg-red-50 text-red-800 ring-red-200', dot: 'bg-red-600', swatch: '#f23838' },
  gelb: { label: 'Gelb', tile: 'from-yellow-100 via-yellow-50 to-white', iconColor: 'text-yellow-700', chip: 'bg-yellow-50 text-yellow-900 ring-yellow-300', dot: 'bg-yellow-500', swatch: '#f5f55a' },
  orange: { label: 'Orange', tile: 'from-orange-100 via-orange-50 to-white', iconColor: 'text-orange-700', chip: 'bg-orange-50 text-orange-900 ring-orange-200', dot: 'bg-orange-500', swatch: '#fa9b4d' },
  lila: { label: 'Lila', tile: 'from-fuchsia-100 via-fuchsia-50 to-white', iconColor: 'text-fuchsia-800', chip: 'bg-fuchsia-50 text-fuchsia-900 ring-fuchsia-200', dot: 'bg-fuchsia-700', swatch: '#b85e99' },
  gruen: { label: 'Grün', tile: 'from-green-100 via-green-50 to-white', iconColor: 'text-green-700', chip: 'bg-green-50 text-green-800 ring-green-200', dot: 'bg-green-600', swatch: '#56bc52' },
  grau: { label: 'Grau', tile: 'from-stone-200 via-stone-100 to-white', iconColor: 'text-stone-600', chip: 'bg-stone-100 text-stone-700 ring-stone-300', dot: 'bg-stone-500', swatch: '#a8a29e' },
};

// --- Symbole für Kategorien ------------------------------------------------------
export const ICONS: Record<IconKey, { label: string; icon: LucideIcon }> = {
  kommunikation: { label: 'Sprechblase', icon: MessageCircle },
  hand: { label: 'Hand', icon: Hand },
  besteck: { label: 'Besteck', icon: Utensils },
  buch: { label: 'Buch', icon: BookOpen },
  sterne: { label: 'Sterne', icon: Sparkles },
  werkzeug: { label: 'Werkzeug', icon: Wrench },
  formen: { label: 'Formen', icon: Shapes },
  puzzle: { label: 'Puzzle', icon: Puzzle },
  stift: { label: 'Stift', icon: Pencil },
  musik: { label: 'Musik', icon: Music },
  herz: { label: 'Herz', icon: Heart },
  rollstuhl: { label: 'Barrierefreiheit', icon: Accessibility },
};

const FALLBACK_CATEGORY: Category = { id: '', name: 'Sonstiges', color: 'grau', icon: 'formen' };

/** Darstellung einer Kategorie (über ihren Namen). Unbekannte Namen → grau/Formen. */
export function categoryMeta(md: MasterData, name: string) {
  const cat = md.categories.find((c) => c.name === name) ?? { ...FALLBACK_CATEGORY, name };
  return { ...COLOR_STYLES[cat.color], icon: ICONS[cat.icon]?.icon ?? Shapes, category: cat };
}

// --- Bestellstatus ---------------------------------------------------------------
export const PHASE_ICONS: Record<StatusPhase, LucideIcon> = { open: Inbox, active: Printer, done: CircleCheck };

/** Symbole der festen Status (IDs aus shared/src/anfragen.ts). */
export const STATUS_ICONS: Record<string, LucideIcon> = {
  offen: Inbox,
  in_pruefung: SearchCheck,
  in_druck: Printer,
  gedruckt: CircleCheck,
  abholbereit: PackageCheck,
  uebergeben: Handshake,
  abgelehnt: CircleX,
  storniert: Ban,
};

/** Kurze Erklärung je fester Status (Stammdaten → Bestellstatus). */
export const STATUS_DESCRIPTIONS: Record<string, string> = Object.fromEntries(STATUS_CATALOG.map((s) => [s.id, s.description]));

/** Darstellung eines Status (über seine ID). */
export function statusMeta(md: MasterData, id: string) {
  const def: OrderStatusDef = md.orderStatuses.find((s) => s.id === id) ?? { id, name: id, phase: 'open', color: 'grau', active: false };
  return { ...COLOR_STYLES[def.color], icon: STATUS_ICONS[def.id] ?? PHASE_ICONS[def.phase], def, label: def.name };
}

/** Eingeschaltete Status in Bearbeitungsreihenfolge. */
export const activeStatuses = (md: MasterData) => md.orderStatuses.filter((s) => s.active);

/** Nächster eingeschalteter Status in der Reihenfolge (für „Weiter zu …“). */
export function nextStatus(md: MasterData, id: string): OrderStatusDef | undefined {
  const i = md.orderStatuses.findIndex((s) => s.id === id);
  return i >= 0 ? md.orderStatuses.slice(i + 1).find((s) => s.active) : undefined;
}
