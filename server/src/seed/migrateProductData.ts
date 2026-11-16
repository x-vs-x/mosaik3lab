import { singleColorArea, type ColorArea, type CustomField, type ItemVideo } from '../domain/types';
import type { Storage } from '../storage';

/** Neue Produktdaten-Felder mit ihren Standardwerten (einfarbig, ohne Preis, ohne Personalisierung, ohne Videos). */
export function productDefaults(colors: string[]): {
  colorAreas: ColorArea[];
  price: string;
  customFields: CustomField[];
  videos: ItemVideo[];
} {
  return { colorAreas: singleColorArea(colors), price: '', customFields: [], videos: [] };
}

/**
 * Ergänzt Druckteile und Anfragen aus älteren Versionen um die neuen Produktdaten (läuft bei jedem Start).
 * Rein ergänzend, es wird nichts entfernt:
 * - Druckteil: bisherige Farben werden zu einem Farbbereich „Farbe“; Preis leer, keine Felder/Videos.
 * - Anfragen: bisherige Farbe wird als Farbe des Bereichs „Farbe“ übernommen; keine Personalisierung.
 */
export async function migrateProductData(storage: Storage) {
  const isList = (v: unknown) => Array.isArray(v);
  let items = 0;
  for (const item of await storage.items.list()) {
    if (isList(item.colorAreas) && typeof item.price === 'string' && isList(item.customFields) && isList(item.videos)) continue;
    await storage.items.update(item.id, (i) => {
      const defaults = productDefaults(i.colors ?? []);
      return {
        ...i,
        colorAreas: isList(i.colorAreas) && i.colorAreas.length > 0 ? i.colorAreas : defaults.colorAreas,
        price: typeof i.price === 'string' ? i.price : defaults.price,
        customFields: isList(i.customFields) ? i.customFields : defaults.customFields,
        videos: isList(i.videos) ? i.videos : defaults.videos,
      };
    });
    items++;
  }

  let orders = 0;
  for (const order of await storage.orders.list()) {
    if (isList(order.colorChoices) && isList(order.personalization)) continue;
    await storage.orders.update(order.id, (o) => ({
      ...o,
      colorChoices: isList(o.colorChoices)
        ? o.colorChoices
        : o.colorId
          ? [{ areaId: 'farbe', area: 'Farbe', colorId: o.colorId, color: o.color, colorHex: o.colorHex ?? '' }]
          : [],
      personalization: isList(o.personalization) ? o.personalization : [],
    }));
    orders++;
  }
  if (items || orders) {
    console.log(`[Migration] Produktdaten ergänzt: ${items} Druckteile, ${orders} Anfrage(n) (Farbbereiche, Preis, Personalisierung, Videos).`);
  }
}
