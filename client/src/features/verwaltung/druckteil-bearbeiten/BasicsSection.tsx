import { PenLine } from 'lucide-react';
import { cx, Field, Input, Select, Textarea } from '../../../components/ui';
import { useMasterData } from '../../../lib/config';
import { ITEM_KIND_LABELS, type ItemKind } from '../../../lib/types';
import { sectionHasError, type FormSectionProps } from './itemForm';
import { Section } from './Section';

/** Grunddaten: Name, Beschreibungen, Art, Kategorie, Preis, Einsatzbereiche. */
export function BasicsSection({ form, set, errors }: FormSectionProps) {
  const md = useMasterData();
  const categoryNames = md.categories.map((c) => c.name);
  // Einsatzbereiche aus den Stammdaten plus evtl. noch gespeicherte, nicht mehr vorhandene Werte.
  const areaNames = [...md.useAreas.map((a) => a.name), ...form.useAreas.filter((a) => !md.useAreas.some((x) => x.name === a))];

  return (
    <Section
      id="grunddaten"
      icon={PenLine}
      title="Grunddaten"
      summary={[form.category, form.price].filter(Boolean).join(' · ')}
      defaultOpen
      hasError={sectionHasError(errors, 'grunddaten')}
    >
      <Field label="Name" required error={errors.name}>
        {({ id, invalid }) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={100} invalid={invalid} />}
      </Field>
      <Field label="Kurzbeschreibung" required hint="Erscheint auf der Katalogkarte (10–200 Zeichen)." error={errors.shortDescription}>
        {({ id, describedBy, invalid }) => (
          <Textarea id={id} rows={2} value={form.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} maxLength={200} aria-describedby={describedBy} invalid={invalid} className="min-h-20" />
        )}
      </Field>
      <Field label="Art" required hint="Hilfsmittel unterstützen Schülerinnen und Schüler im Alltag, Lehrmittel gehören zum Unterricht." error={errors.kind}>
        {({ id, describedBy, invalid }) => (
          <Select id={id} value={form.kind} onChange={(e) => set('kind', e.target.value as ItemKind)} aria-describedby={describedBy} invalid={invalid}>
            {(Object.keys(ITEM_KIND_LABELS) as ItemKind[]).map((k) => (
              <option key={k} value={k}>
                {ITEM_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Kategorie" required error={errors.category}>
          {({ id, invalid }) => (
            <Select id={id} value={form.category} onChange={(e) => set('category', e.target.value)} invalid={invalid}>
              {!form.category && <option value="">Bitte wählen …</option>}
              {form.category && !categoryNames.includes(form.category) && (
                <option value={form.category}>{form.category} (nicht mehr in den Stammdaten)</option>
              )}
              {categoryNames.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Preis" hint="Optional, freier Text – z. B. „ca. 2 € Material“." error={errors.price}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} value={form.price} onChange={(e) => set('price', e.target.value)} maxLength={80} aria-describedby={describedBy} invalid={invalid} placeholder="z. B. ca. 2 € Material" />
          )}
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 font-bold text-stone-800">Einsatzbereiche</legend>
        {areaNames.length === 0 && <p className="text-hinweis text-stone-600">Noch keine Einsatzbereiche in den Stammdaten angelegt.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {areaNames.map((a) => {
            const checked = form.useAreas.includes(a);
            return (
              <label
                key={a}
                className={cx(
                  'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-4 ring-1 ring-inset transition-colors',
                  checked ? 'bg-brand-50 ring-brand-300' : 'bg-white ring-stone-300 hover:bg-stone-50',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => set('useAreas', checked ? form.useAreas.filter((x) => x !== a) : [...form.useAreas, a])}
                  className="size-5 accent-brand-700"
                />
                <span className="font-bold text-stone-800">{a}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <Field label="Ausführliche Beschreibung" hint="Optional. Leere Angaben erscheinen auf der Produktseite nicht." error={errors.description}>
        {({ id, describedBy, invalid }) => (
          <Textarea id={id} rows={5} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={3000} aria-describedby={describedBy} invalid={invalid} />
        )}
      </Field>
    </Section>
  );
}
