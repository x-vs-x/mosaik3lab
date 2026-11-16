// Formular-Grundlagen des Druckteil-Editors: Leerwerte, Umwandlung, lokale Prüfung, kleine Helfer.
import type { Item, ItemInput } from '../../../lib/types';

export const MAX_COLOR_AREAS = 8;
export const MAX_CUSTOM_FIELDS = 10;
export const MAX_VIDEOS = 4;

export type FieldErrors = Record<string, string>;
export type SetField = <K extends keyof ItemInput>(key: K, value: ItemInput[K]) => void;

/** Gemeinsame Props der Formular-Abschnitte. */
export interface FormSectionProps {
  form: ItemInput;
  set: SetField;
  errors: FieldErrors;
}

/** Lokale ID für neue Bereiche/Felder – der Server übernimmt sie, damit Anfragen zuordenbar bleiben. */
export const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const EMPTY: ItemInput = {
  name: '',
  shortDescription: '',
  description: '',
  category: '',
  kind: 'hilfsmittel',
  useAreas: [],
  // Neue Druckteile: alle Farben (auch später angelegte) – einschränken geht mit „Nur bestimmte Farben“.
  colorAreas: [{ id: 'farbe', name: 'Farbe', alleFarben: true, colors: [] }],
  price: '',
  customFields: [],
  sizes: [],
  material: '',
  materialInfo: '',
  printTimeMinutes: 60,
  safetyNotes: [],
  published: false,
};

export function toInput(item: Item): ItemInput {
  const { name, shortDescription, description, kind, category, useAreas, sizes, material, materialInfo, printTimeMinutes, safetyNotes, published } = item;
  return {
    name,
    shortDescription,
    description,
    kind,
    category,
    useAreas,
    // Bei „Alle Farben“ liefert der Server alle Farbrollen mit – gespeichert wird aber keine feste Liste.
    colorAreas: (item.colorAreas?.length ? item.colorAreas : [{ id: 'farbe', name: 'Farbe', colors: item.colors }]).map((a) =>
      a.alleFarben ? { ...a, colors: [] } : a,
    ),
    price: item.price ?? '',
    customFields: item.customFields ?? [],
    sizes,
    material,
    materialInfo,
    printTimeMinutes,
    safetyNotes,
    published,
  };
}

// Welche Fehlerfelder gehören zu welchem Abschnitt (damit er bei Fehlern aufklappt)?
const SECTION_FIELDS = {
  grunddaten: ['name', 'shortDescription', 'description', 'kind', 'category', 'useAreas', 'price'],
  farben: ['colorAreas', 'colors', 'sizes'],
  personalisierung: ['customFields'],
  material: ['material', 'materialInfo', 'printTimeMinutes'],
  sicherheit: ['safetyNotes'],
} as const;

export const sectionHasError = (errors: FieldErrors, section: keyof typeof SECTION_FIELDS) =>
  SECTION_FIELDS[section].some((k) => errors[k]);

/** Verständliche Meldung je Bereich/Feld, bevor der Server allgemein „Mindestens 1 Eintrag“ meldet. */
export function validateLocal(form: ItemInput): FieldErrors {
  const emptyArea = form.colorAreas.find((a) => !a.name.trim() || (!a.alleFarben && a.colors.length === 0));
  const unnamedField = form.customFields.find((f) => !f.label.trim() || (f.type === 'select' && f.options.length === 0));
  const local: FieldErrors = {};
  if (emptyArea) {
    local.colorAreas = !emptyArea.name.trim()
      ? 'Bitte jedem Farbbereich einen Namen geben.'
      : form.colorAreas.length > 1
        ? `Bitte für „${emptyArea.name}“ mindestens eine Farbe wählen.`
        : 'Bitte mindestens eine Farbe wählen.';
  }
  if (unnamedField) {
    local.customFields = !unnamedField.label.trim()
      ? 'Bitte jedem Personalisierungsfeld eine Bezeichnung geben.'
      : `Bitte für „${unnamedField.label}“ mindestens eine Auswahlmöglichkeit angeben.`;
  }
  return local;
}
