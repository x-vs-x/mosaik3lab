import { Palette, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { ListEditor } from '../../../components/ListEditor';
import { Button, Field, Input } from '../../../components/ui';
import { useMasterData } from '../../../lib/config';
import type { ColorArea, Filament } from '../../../lib/types';
import { FilamentPicker } from './FilamentPicker';
import { MAX_COLOR_AREAS, newId, plural, sectionHasError, type FormSectionProps } from './itemForm';
import { ListError, Section } from './Section';

/** Farben & Bereiche sowie verfügbare Größen. */
export function ColorsSection({ form, set, errors }: FormSectionProps) {
  const md = useMasterData();
  const { can } = useAuth();
  const colorCount = new Set(form.colorAreas.flatMap((a) => a.colors)).size;
  const alle = form.colorAreas.filter((a) => a.alleFarben).length;

  return (
    <Section
      id="farben"
      icon={Palette}
      title="Farben & Bereiche"
      summary={[
        form.colorAreas.length > 1 ? `Mehrfarbig: ${plural(form.colorAreas.length, 'Bereich', 'Bereiche')}` : 'Einfarbig',
        alle === form.colorAreas.length
          ? 'Alle Farben'
          : `${plural(colorCount, 'Farbe', 'Farben')}${alle ? ' + „Alle Farben“' : ''}`,
        plural(form.sizes.length, 'Größe', 'Größen'),
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
      <Field label="Verfügbare Größen" required hint="Eingabe mit Enter oder „Hinzufügen“ bestätigen." error={errors.sizes}>
        {({ id, describedBy, invalid }) => (
          <ListEditor id={id} values={form.sizes} onChange={(v) => set('sizes', v)} placeholder="z. B. Ø 25 mm" describedBy={describedBy} invalid={invalid} itemLabel="Größe" />
        )}
      </Field>
    </Section>
  );
}

/** Farbbereiche: einfarbig = ein Bereich; mehrfarbig = mehrere benannte Bereiche mit eigener Farbauswahl. */
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
  const update = (index: number, patch: Partial<ColorArea>) => onChange(areas.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  const add = () => {
    const next = areas.map((a) => (a.name === 'Farbe' && !multi ? { ...a, name: 'Bereich 1' } : a));
    onChange([...next, { id: newId('bereich'), name: `Bereich ${areas.length + 1}`, alleFarben: true, colors: [] }]);
  };
  const remove = (index: number) => {
    const rest = areas.filter((_, i) => i !== index);
    onChange(rest.length === 1 && /^Bereich \d+$/.test(rest[0].name) ? [{ ...rest[0], name: 'Farbe' }] : rest);
  };

  return (
    <div className="space-y-4">
      <p className="text-hinweis text-stone-600">
        Einfarbig: eine Farbauswahl. Mehrfarbig (z. B. Griff und Grundplatte in verschiedenen Farben): weitere Bereiche
        hinzufügen – Lehrkräfte wählen dann je Bereich eine Farbe.
      </p>
      {areas.map((area, i) =>
        multi ? (
          <div key={area.id} className="min-w-0 space-y-4 rounded-2xl p-3 ring-1 ring-stone-300 sm:p-5">
            <div className="flex items-end gap-3">
              <Field label={`Name von Bereich ${i + 1}`} required className="flex-1">
                {({ id }) => (
                  <Input id={id} value={area.name} onChange={(e) => update(i, { name: e.target.value })} maxLength={40} placeholder="z. B. Griff" />
                )}
              </Field>
              <Button variant="secondary" icon={Trash2} onClick={() => remove(i)} aria-label={`Bereich „${area.name}“ entfernen`} className="text-rose-700">
                <span className="hidden sm:inline">Entfernen</span>
              </Button>
            </div>
            <FilamentPicker
              legend={`Farben für „${area.name || `Bereich ${i + 1}`}“`}
              filaments={filaments}
              alleFarben={!!area.alleFarben}
              onAlleFarben={(on) => update(i, { alleFarben: on, colors: [] })}
              selected={area.colors}
              onChange={(v) => update(i, { colors: v })}
              manageLink={manageLink && i === 0}
            />
          </div>
        ) : (
          <FilamentPicker
            key={area.id}
            legend="Welche Farben kann man wählen?"
            filaments={filaments}
            alleFarben={!!area.alleFarben}
            onAlleFarben={(on) => update(i, { alleFarben: on, colors: [] })}
            selected={area.colors}
            onChange={(v) => update(i, { colors: v })}
            manageLink={manageLink}
          />
        ),
      )}
      <ListError error={error} />
      {areas.length < MAX_COLOR_AREAS && (
        <Button variant="soft" icon={Plus} onClick={add}>
          {multi ? 'Weiteren Farbbereich hinzufügen' : 'Mehrfarbig: Farbbereich hinzufügen'}
        </Button>
      )}
    </div>
  );
}
