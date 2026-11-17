// Gemeinsame Bausteine der Stammdaten-Listen: Zeilen mit lokalem Schlüssel, Vergleich, Namensprüfung.

export type Entry = { id: string };
export type Row<T extends Entry> = Omit<T, 'id'> & { id?: string; _key: string };

let keySeq = 0;
export const newKey = () => `row-${++keySeq}`;
export const toRows = <T extends Entry>(list: T[]): Row<T>[] => list.map((e) => ({ ...e, _key: newKey() }) as Row<T>);
export function strip<T extends Entry>(rows: Row<T>[]) {
  return rows.map((r) => {
    const copy: Record<string, unknown> = { ...r };
    delete copy._key;
    return copy;
  });
}
export const same = <T extends Entry>(a: Row<T>[], b: Row<T>[]) => JSON.stringify(strip(a)) === JSON.stringify(strip(b));

/** Serverfehler je Zeile (`fields` mit Zeilenindex ab 0, z. B. { "7": "Name fehlt" }) → Meldung je Zeilenschlüssel. */
export function serverRowErrors<T extends Entry>(rows: Row<T>[], fields: Record<string, string>) {
  const byKey = new Map<string, string>();
  for (const [index, message] of Object.entries(fields)) {
    const row = /^\d+$/.test(index) ? rows[Number(index)] : undefined;
    if (row) byKey.set(row._key, message);
  }
  return byKey;
}

export const nameError =(name: string, noun: string) => (name.trim() ? undefined : `Bitte einen Namen für ${noun} eingeben.`);

export function duplicateNames(rows: { name: string }[]) {
  const seen = new Set<string>();
  for (const r of rows) {
    const n = r.name.trim().toLowerCase();
    if (!n) continue;
    if (seen.has(n)) return `Der Name „${r.name.trim()}“ kommt mehrfach vor. Namen müssen eindeutig sein.`;
    seen.add(n);
  }
  return undefined;
}
