import { MAX_COLOR_AREAS } from '@mosaik3lab/shared/werte/katalog';
import { Palette } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { ListEditor } from '../../../components/ListEditor';
import { cx, Field } from '../../../components/ui';
import { useMasterData } from '../../../lib/config';
import type { ColorArea, Filament } from '../../../lib/types';
import { FilamentPicker } from './FilamentPicker';
import { GemeinsameFarben } from './GemeinsameFarben';
import { auswahlBeschreibung, auswahlSchluessel, gemeinsameAuswahl, setzeGemeinsame } from './teileRegeln';
import { newId, ohneGruppen, plural, sectionHasError, type FormSectionProps } from './itemForm';
import { ListError, Section } from './Section';
import { TeileListe } from './TeileListe';

/** Farben & Teile sowie verfügbare Größen. */
export function ColorsSection({ form, set, errors }: FormSectionProps) {
  const md = useMasterData();
  const { can } = useAuth();
  const multi = form.colorAreas.length > 1;
  const eigene = multi ? new Set(form.colorAreas.map((a) => auswahlSchluessel(a, md.filaments))).size - 1 : 0;
  const farben = auswahlBeschreibung(gemeinsameAuswahl(form.colorAreas, md.filaments), md.filaments).titel;

  return (
    <Section
      id="farben"
      icon={Palette}
      title="Farben & Teile"
      summary={[
        multi ? `Mehrere Teile: ${plural(form.colorAreas.length, 'Teil', 'Teile')}` : 'Einfarbig',
        farben + (eigene > 0 ? ` (${plural(eigene, 'Ausnahme', 'Ausnahmen')})` : ''),
        form.sizes.length ? plural(form.sizes.length, 'Größe', 'Größen') : 'ohne Größen',
      ].join(' · ')}
      defaultOpen
      hasError={sectionHasError(errors, 'farben')}
    >
      <ColorAreasEditor
        areas={form.colorAreas}
        onChange={(v) => set('colorAreas', v)}
        filaments={md.filaments}
        error={errors.colorAreas ?? errors.colors}
        manageLink={can('masterdata:manage')}
      />
      <Field
        label="Verfügbare Größen (freiwillig)"
        hint="Nur nötig, wenn Lehrkräfte eine Größe wählen sollen. Eingabe mit Enter oder „Hinzufügen“ bestätigen."
        error={errors.sizes}
      >
        {({ id, describedBy, invalid }) => (
          <ListEditor id={id} values={form.sizes} onChange={(v) => set('sizes', v)} placeholder="z. B. Ø 25 mm" describedBy={describedBy} invalid={invalid} itemLabel="Größe" />
        )}
      </Field>
    </Section>
  );
}

const automatischerName = (name: string) => /^(Teil|Bereich) \d+$/.test(name) || name === 'Farbe';

/**
 * Einfarbig = ein Bereich mit einer Farbauswahl direkt im Formular. Mehrere Teile = Schritt 1 „Welche Farben stehen zur
 * Wahl?“ einmal für alle Teile, Schritt 2 die Teile-Liste mit Ausnahmen. Gespeichert wird wie bisher je Teil (keine neuen Daten).
 */
function ColorAreasEditor({
  areas,
  onChange,
  filaments,
  error,
  manageLink,
}: {
  areas: ColorArea[];
  onChange: (areas: ColorArea[]) => void;
  filaments: Filament[];
  error?: string;
  manageLink: boolean;
}) {
  const multi = areas.length > 1;
  // Gemeinsame Auswahl = die häufigste; bei Gleichstand bleibt die bisherige (sonst spränge sie beim ersten Ändern eines Teils um).
  const [bevorzugt, setBevorzugt] = useState<string>();
  const gemeinsam = gemeinsameAuswahl(areas, filaments, bevorzugt);
  const gemeinsamKey = auswahlSchluessel(gemeinsam, filaments);
  if (multi && gemeinsamKey !== bevorzugt) setBevorzugt(gemeinsamKey);

  const zuMehreren = () => {
    if (multi) return;
    const erstes = areas[0];
    onChange([
      { ...erstes, name: automatischerName(erstes.name) ? 'Teil 1' : erstes.name },
      { id: newId('teil'), name: 'Teil 2', ...gemeinsam, colors: [...gemeinsam.colors], gruppen: [...gemeinsam.gruppen] },
    ]);
  };
  const zuEinfarbig = () => {
    if (!multi) return;
    if (!window.confirm(`Die ${areas.length} Teile werden zu einer Farbauswahl zusammengefasst (Farben aus Schritt 1). Fortfahren?`)) return;
    onChange([{ ...areas[0], name: 'Farbe', ...gemeinsam }]);
  };
  const entfernen = (index: number) => {
    const rest = areas.filter((_, i) => i !== index);
    onChange(rest.length === 1 ? [{ ...rest[0], name: automatischerName(rest[0].name) ? 'Farbe' : rest[0].name }] : rest);
  };
  const schritt = (n: number, titel: string, zusatz?: string) => (
    <h3 className="mb-2 flex items-start gap-2 font-bold text-stone-900">
      <span className="mt-0.5 inline-grid size-6 shrink-0 place-items-center rounded-full bg-stone-900 text-sm text-white" aria-hidden>
        {n}
      </span>
      <span>
        <span className="sr-only">Schritt {n}: </span>
        {titel} {zusatz && <span className="font-normal text-stone-600">{zusatz}</span>}
      </span>
    </h3>
  );

  return (
    <div className="space-y-5">
      <fieldset className="min-w-0">
        <legend className="mb-1.5 font-bold text-stone-800">Wie viele Farben?</legend>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-2">
          {(
            [
              [false, 'Einfarbig', 'Lehrkräfte wählen eine Farbe.', zuEinfarbig],
              [true, 'Mehrere Teile', 'Jedes Teil eine eigene Farbe, z. B. Steckpuzzle.', zuMehreren],
            ] as const
          ).map(([wert, titel, text, waehlen]) => (
            <label
              key={titel}
              className={cx(
                'flex min-h-[48px] cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600',
                multi === wert ? 'bg-brand-50 ring-brand-400' : 'bg-white ring-stone-300 hover:bg-stone-50',
              )}
            >
              <input type="radio" name="farb-art" checked={multi === wert} onChange={waehlen} className="mt-1 size-5 shrink-0 accent-brand-700" />
              <span>
                <span className="block font-bold text-stone-900">{titel}</span>
                <span className="block text-hinweis text-stone-600">{text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {multi ? (
        <>
          <div>
            {schritt(1, 'Welche Farben stehen zur Wahl?', '(gilt für alle Teile)')}
            <GemeinsameFarben
              auswahl={gemeinsam}
              filaments={filaments}
              manageLink={manageLink}
              onChange={(neu) => onChange(setzeGemeinsame(areas, gemeinsam, neu, filaments))}
            />
          </div>
          <div>
            {schritt(2, 'Teile', `(${areas.length} von höchstens ${MAX_COLOR_AREAS})`)}
            <p className="mb-2 text-hinweis text-stone-600">In dieser Reihenfolge stehen die Teile im Anfrageformular.</p>
            <TeileListe
              areas={areas}
              gemeinsam={gemeinsam}
              filaments={filaments}
              manageLink={manageLink}
              onChange={onChange}
              onEntfernen={entfernen}
              fehlerName={!!error}
            />
          </div>
        </>
      ) : (
        <FilamentPicker
          legend="Welche Farben kann man wählen?"
          filaments={filaments}
          alleFarben={!!areas[0].alleFarben}
          onAlleFarben={(on) => onChange([{ ...areas[0], alleFarben: on, colors: [], gruppen: [] }])}
          selected={areas[0].colors}
          onChange={(v) => onChange([{ ...areas[0], colors: v }])}
          gruppen={areas[0].gruppen ?? []}
          onGruppen={(g) => onChange([{ ...areas[0], gruppen: g, colors: ohneGruppen(areas[0].colors, [...(areas[0].gruppen ?? []), ...g], filaments) }])}
          manageLink={manageLink}
        />
      )}
      <ListError error={error} />
    </div>
  );
}
