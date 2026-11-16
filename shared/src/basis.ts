import { z, ZodError } from 'zod';

// Gemeinsame Grundlagen aller Schemas: deutsche Fehlermeldungen und kleine Bausteine.
// Jedes Schema-Modul importiert diese Datei – damit gilt die Fehlerkarte überall, wo ein Schema benutzt wird.
// Eigene Meldungen am Schema (z. B. `.email('…')`) haben Vorrang vor dieser Karte.

const germanErrorMap: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case 'invalid_type':
      if (issue.input === undefined || issue.input === null) return 'Pflichtfeld';
      return 'Ungültiger Wert';
    case 'too_small':
      if (issue.origin === 'string') return Number(issue.minimum) === 1 ? 'Pflichtfeld' : `Mindestens ${issue.minimum} Zeichen`;
      if (issue.origin === 'array') return `Mindestens ${issue.minimum} Eintrag/Einträge`;
      return `Mindestens ${issue.minimum}`;
    case 'too_big':
      if (issue.origin === 'string') return `Höchstens ${issue.maximum} Zeichen`;
      if (issue.origin === 'array') return `Höchstens ${issue.maximum} Einträge`;
      return `Höchstens ${issue.maximum}`;
    case 'invalid_value':
      if (issue.input === undefined || issue.input === null) return 'Pflichtfeld';
      return 'Bitte einen gültigen Wert auswählen';
    case 'invalid_format':
      return 'Ungültiges Format';
    default:
      return undefined;
  }
};
z.config({ customError: germanErrorMap });

/** Erste Meldung je Feld (oberste Ebene des Pfads) – Antwortformat für 400-Fehler. */
export function zodFieldErrors(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.length ? String(issue.path[0]) : '_';
    fields[key] ??= issue.message;
  }
  return fields;
}

export const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const uniqueList = (item: z.ZodString, min: number, max: number) =>
  z
    .array(item)
    .transform((list) => [...new Set(list)])
    .pipe(z.array(z.string()).min(min).max(max));

export const emailSchema = z.string().trim().toLowerCase().max(200).email('Bitte eine gültige E-Mail-Adresse eingeben');

/** Externer Link (Videos, Vorschläge): nur vollständige http-/https-Adressen. */
export const httpLink = z
  .string()
  .trim()
  .max(500)
  .url('Bitte einen vollständigen Link angeben, z. B. https://…')
  .refine((u) => /^https?:\/\//i.test(u), 'Nur Links mit http:// oder https://');

/** Gespeicherter Eintrag: wie die Eingabe, aber immer mit ID. */
export type MitId<T> = Omit<T, 'id'> & { id: string };
