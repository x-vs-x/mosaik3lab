// Feste Objekttypen und Datei-Rollen (Vertrag: docs/DATENMODELL.md). Neue Typen NUR hier ergänzen –
// die Datenbank prüft die Werte zusätzlich per CHECK (Migration nötig, wenn diese Liste wächst).

export const OBJEKTTYPEN = ['artikel', 'anfrage', 'vorschlag', 'benutzer', 'lehrkraft'] as const;
export type Objekttyp = (typeof OBJEKTTYPEN)[number];

/** Rollen einer Datei an ihrem Objekt. */
export const DATEI_ROLLEN = ['bild', 'video', 'druckdatei', 'foto', 'anhang'] as const;
export type DateiRolle = (typeof DATEI_ROLLEN)[number];

export const isObjekttyp = (v: string): v is Objekttyp => (OBJEKTTYPEN as readonly string[]).includes(v);
export const isDateiRolle = (v: string): v is DateiRolle => (DATEI_ROLLEN as readonly string[]).includes(v);

/** Lesbare Nummern je Objekttyp (Tabelle `nummernkreis`, je Typ – und ggf. Jahr – ein eigener Zähler). */
export const NUMMERNKREISE = {
  anfrage: { praefix: 'ANF', jaehrlich: true, stellen: 4 }, // ANF-2026-0007 (alte M3L-2026-0001 bleiben gültig)
  artikel: { praefix: 'ART', jaehrlich: false, stellen: 4 }, // ART-0042
  vorschlag: { praefix: 'VOR', jaehrlich: true, stellen: 4 }, // VOR-2026-0003
} as const satisfies Partial<Record<Objekttyp, { praefix: string; jaehrlich: boolean; stellen: number }>>;
export type NummerTyp = keyof typeof NUMMERNKREISE;

/** Formatiert eine lesbare Nummer, z. B. nummerText('anfrage', 7, 2026) → „ANF-2026-0007“. */
export function nummerText(typ: NummerTyp, laufend: number, jahr: number): string {
  const k = NUMMERNKREISE[typ];
  const n = String(laufend).padStart(k.stellen, '0');
  return k.jaehrlich ? `${k.praefix}-${jahr}-${n}` : `${k.praefix}-${n}`;
}

/** MIME-Typen der erlaubten Dateiendungen (Uploads werden per Magic Bytes geprüft, siehe kern/uploads.ts). */
export const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  stl: 'model/stl',
  '3mf': 'model/3mf',
  pdf: 'application/pdf',
};
