import { z } from 'zod';

// „Was ist neu“ für Administratoren nach einem Update (Quelle: CHANGELOG.md). Auch der Server-Manager nutzt diese Antwort.

export const neuigkeitAbschnittSchema = z.object({
  version: z.string(),
  /** Datum aus der Überschrift, z. B. 2026-11-20 (leer, wenn keins angegeben). */
  datum: z.string(),
  /** Rohtext des Abschnitts (Markdown: Absätze, Listenpunkte „- “, **fett**). */
  text: z.string(),
});
export type NeuigkeitAbschnitt = z.infer<typeof neuigkeitAbschnittSchema>;

/** GET /api/neuigkeiten (nur Administratoren). */
export const neuigkeitenSchema = z.object({
  anzeigen: z.boolean(),
  /** Aktuelle Version der App. */
  version: z.string(),
  abschnitte: z.array(neuigkeitAbschnittSchema),
});
export type Neuigkeiten = z.infer<typeof neuigkeitenSchema>;
