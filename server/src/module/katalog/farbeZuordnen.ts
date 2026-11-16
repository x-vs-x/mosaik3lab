import { allAreaColors } from '../../domain/types';
import { transaction } from '../../kern/db';
import { badRequest, notFound } from '../../kern/errors';
import type { Storage } from '../../storage';

// Eine Farbrolle mehreren Druckteilen auf einmal hinzufügen (z. B. eine neue Farbe allen PLA-Basic-Teilen).
// Alles in einer Transaktion: klappt etwas nicht, bleibt jedes Druckteil, wie es war. Bereiche mit „Alle Farben“
// bekommen neue Farben ohnehin automatisch und bleiben unberührt.

export function farbeZuordnen(storage: Storage, filamentId: string, ziele: { itemId: string; bereiche: string[] }[]) {
  const { db, items, settings } = storage.sqlite;
  if (!settings.read().masterData.filaments.some((f) => f.id === filamentId)) throw notFound('Farbrolle nicht gefunden.');
  return transaction(db, () => {
    let druckteile = 0;
    let bereiche = 0;
    for (const ziel of ziele) {
      const item = items.load('WHERE id = ?', ziel.itemId)[0];
      if (!item) throw badRequest(`Druckteil „${ziel.itemId}“ gibt es nicht (mehr). Es wurde nichts geändert.`);
      let geaendert = 0;
      const colorAreas = item.colorAreas.map((a) => {
        if (!ziel.bereiche.includes(a.id) || a.alleFarben || a.colors.includes(filamentId)) return a;
        geaendert++;
        return { ...a, colors: [...a.colors, filamentId] };
      });
      if (!geaendert) continue;
      // save() entfernt nur Dateien, die nicht mehr im Druckteil stehen – hier ändern sich nur Farben.
      items.save({ ...item, colorAreas, colors: allAreaColors(colorAreas), updatedAt: new Date().toISOString() });
      druckteile++;
      bereiche += geaendert;
    }
    return { druckteile, bereiche };
  });
}
