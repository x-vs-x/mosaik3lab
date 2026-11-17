import { passtZurSuche } from '@mosaik3lab/shared/suche';

// Filter für „Druckteile verwalten“: Suche + Ansicht (alle, veröffentlicht, Entwurf). Reine Funktionen, getestet.

export type Ansicht = 'alle' | 'veroeffentlicht' | 'entwurf';

export const ANSICHTEN: { id: Ansicht; label: string }[] = [
  { id: 'alle', label: 'Alle' },
  { id: 'veroeffentlicht', label: 'Veröffentlicht' },
  { id: 'entwurf', label: 'Entwurf' },
];

/** Wert aus der Adresse (`?ansicht=`) – Unbekanntes wird zu „alle“. */
export const leseAnsicht = (v: string | null): Ansicht => ANSICHTEN.find((a) => a.id === v)?.id ?? 'alle';

interface Filterbar {
  name: string;
  category: string;
  material: string;
  useAreas: string[];
  published: boolean;
}

export const passtZurAnsicht = (item: Pick<Filterbar, 'published'>, ansicht: Ansicht) =>
  ansicht === 'alle' || (ansicht === 'veroeffentlicht') === item.published;

const passtZurSucheItem = (i: Filterbar, q: string) => passtZurSuche([i.name, i.category, i.material, ...i.useAreas], q);

/** Treffer der Suche je Ansicht – für die Zahlen in den Knöpfen („Entwurf (3)“). */
export function zaehleAnsichten(items: Filterbar[], q: string): Record<Ansicht, number> {
  const z: Record<Ansicht, number> = { alle: 0, veroeffentlicht: 0, entwurf: 0 };
  for (const i of items) {
    if (!passtZurSucheItem(i, q)) continue;
    z.alle++;
    z[i.published ? 'veroeffentlicht' : 'entwurf']++;
  }
  return z;
}

export const filtereDruckteile = <T extends Filterbar>(items: T[], q: string, ansicht: Ansicht): T[] =>
  items.filter((i) => passtZurAnsicht(i, ansicht) && passtZurSucheItem(i, q));
