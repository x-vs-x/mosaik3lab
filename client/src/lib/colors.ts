// Zentrale Stelle für die Farbauswahl von Druckteilen (Anfrageformular, Produktseite).
// Es werden nur vorrätige Farbrollen angeboten (lib/filaments.ts), damit alle Ansichten gleich filtern.
import { availableFilaments } from './filaments';
import type { ColorArea, Filament, Item, MasterData } from './types';

export interface AreaColors {
  area: ColorArea;
  /** Vorrätige Farbrollen des Bereichs (leere oder gelöschte Rollen fallen weg). */
  filaments: Filament[];
}

/** Farbbereiche eines Druckteils mit ihren Farbrollen. Ältere Daten ohne Bereiche = ein Bereich „Farbe“. */
export function itemColorAreas(item: Pick<Item, 'colors' | 'colorAreas'>, md: MasterData): AreaColors[] {
  const areas = item.colorAreas?.length ? item.colorAreas : [{ id: 'farbe', name: 'Farbe', colors: item.colors }];
  return areas.map((area) => ({
    area,
    filaments: availableFilaments(md, area.colors),
  }));
}

/** Vorauswahl: Bereiche mit genau einer Farbe sind schon gewählt. */
export function initialColorChoice(areas: AreaColors[]): Record<string, string> {
  return Object.fromEntries(areas.filter((a) => a.filaments.length === 1).map((a) => [a.area.id, a.filaments[0].id]));
}
