import { allAreaColors } from '../../domain/types';
import { badRequest, notFound } from '../../kern/errors';
import type { Storage } from '../../storage';

// Eine Farbrolle mehreren Druckteilen auf einmal hinzufügen (z. B. eine neue Farbe allen PLA-Basic-Teilen).
// Alles in einer Transaktion (items.updateMany): klappt etwas nicht, bleibt jedes Druckteil, wie es war. Bereiche mit
// „Alle Farben“ bekommen neue Farben ohnehin automatisch und bleiben unberührt.

export async function farbeZuordnen(storage: Storage, filamentId: string, ziele: { itemId: string; bereiche: string[] }[]) {
  if (!storage.settings.read().masterData.filaments.some((f) => f.id === filamentId)) throw notFound('Farbrolle nicht gefunden.');
  const bereicheJeTeil = new Map<string, string[]>();
  for (const z of ziele) bereicheJeTeil.set(z.itemId, [...(bereicheJeTeil.get(z.itemId) ?? []), ...z.bereiche]);
  let bereiche = 0;
  const { geaendert } = await storage.items.updateMany(
    [...bereicheJeTeil.keys()],
    (item) => {
      const gewaehlt = bereicheJeTeil.get(item.id) ?? [];
      let neu = 0;
      const colorAreas = item.colorAreas.map((a) => {
        if (!gewaehlt.includes(a.id) || a.alleFarben || a.colors.includes(filamentId)) return a;
        neu++;
        return { ...a, colors: [...a.colors, filamentId] };
      });
      if (!neu) return undefined;
      bereiche += neu;
      return { ...item, colorAreas, colors: allAreaColors(colorAreas), updatedAt: new Date().toISOString() };
    },
    { fehlt: (id) => badRequest(`Druckteil „${id}“ gibt es nicht (mehr). Es wurde nichts geändert.`) },
  );
  return { druckteile: geaendert.length, bereiche };
}
