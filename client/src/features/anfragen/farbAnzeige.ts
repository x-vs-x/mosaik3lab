import type { Order, OrderColorChoice, OrderColorVariant } from '../../lib/types';

/**
 * Welche Farbangaben eine Anfrage zeigt – gleiche Regel für „Meine Anfragen“ und die Verwaltung:
 * mehrere Farb-Varianten (je eigene Stückzahl), sonst mehrere Farbbereiche, sonst eine Farbe.
 * Ältere Anfragen ohne Bereiche oder Varianten haben nur `color`/`colorHex`.
 */
export type FarbAnzeige =
  | { art: 'varianten'; varianten: OrderColorVariant[] }
  | { art: 'bereiche'; bereiche: OrderColorChoice[] }
  | { art: 'eine'; farbe: { color: string; colorHex: string; colorId: string } };

export function farbAnzeige(order: Pick<Order, 'color' | 'colorHex' | 'colorChoices' | 'colorVariants'> & { colorId?: string }): FarbAnzeige {
  const varianten = order.colorVariants ?? [];
  if (varianten.length > 1) return { art: 'varianten', varianten };
  const bereiche = order.colorChoices ?? [];
  if (bereiche.length > 1) return { art: 'bereiche', bereiche };
  return { art: 'eine', farbe: { color: order.color, colorHex: order.colorHex, colorId: order.colorId ?? '' } };
}
