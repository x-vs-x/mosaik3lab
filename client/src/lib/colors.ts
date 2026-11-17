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

/**
 * Gespeicherte Farbwahl (Vorlage, Entwurf) auf die angebotenen Optionen abbilden: Gleichnamige Rollen erscheinen nur
 * einmal (availableFilaments) – eine Wahl der zweiten „Schwarz“-Rolle wird zur angebotenen „Schwarz“-Rolle, sonst wäre
 * im Formular nichts ausgewählt. Unbekannte Werte bleiben, wie sie sind (die Prüfung meldet sie).
 */
export function aufAngeboteneFarben(areas: AreaColors[], colors: Record<string, string>, md: MasterData): Record<string, string> {
  const result = { ...colors };
  for (const { area, filaments } of areas) {
    const id = colors[area.id];
    if (!id || filaments.some((f) => f.id === id)) continue;
    const name = md.filaments.find((f) => f.id === id)?.colorName.trim().toLowerCase();
    const angeboten = name ? filaments.find((f) => f.colorName.trim().toLowerCase() === name) : undefined;
    if (angeboten) result[area.id] = angeboten.id;
  }
  return result;
}

/**
 * Kann gerade nicht angefragt werden: Ein Farbbereich mit hinterlegten Farben hat keine vorrätige Rolle mehr
 * (gleiche Regel wie das Anfrageformular – ein leerer Bereich reicht, auch wenn andere Bereiche Farben haben).
 */
export function ohneVorraetigeFarbe(item: Pick<Item, 'colors' | 'colorAreas'>, md: MasterData): boolean {
  return itemColorAreas(item, md).some((a) => a.area.colors.length > 0 && a.filaments.length === 0);
}

/** Vorauswahl: Bereiche mit genau einer Farbe sind schon gewählt. */
export function initialColorChoice(areas: AreaColors[]): Record<string, string> {
  return Object.fromEntries(areas.filter((a) => a.filaments.length === 1).map((a) => [a.area.id, a.filaments[0].id]));
}
