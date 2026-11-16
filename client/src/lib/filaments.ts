import type { Filament, MasterData } from './types';

/**
 * Farbrollen eines Druckteils, die derzeit vorrätig sind (Reihenfolge wie beim Druckteil).
 * Leere oder gelöschte Rollen fallen weg – für Katalog, Produktseite und Anfrageformular.
 * Lehrkräfte wählen nur die Farbe: Gleichnamige Rollen (z. B. „Schwarz“ zweier Marken) erscheinen einmal,
 * die erste Rolle steht für die Farbe.
 */
export function availableFilaments(md: MasterData, ids: string[]): Filament[] {
  const seen = new Set<string>();
  return ids
    .map((id) => md.filaments.find((f) => f.id === id))
    .filter((f): f is Filament => {
      if (!f || f.available === false) return false;
      const key = f.colorName.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
