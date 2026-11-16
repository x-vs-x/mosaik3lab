import { Eye, ShieldAlert } from 'lucide-react';
import { ListEditor } from '../../../components/ListEditor';
import { Field } from '../../../components/ui';
import { plural, sectionHasError, type FormSectionProps } from './itemForm';
import { Section } from './Section';

/** Sicherheit & Hinweise – derzeit nur für das Team sichtbar. */
export function SafetySection({ form, set, errors }: FormSectionProps) {
  return (
    <Section
      id="sicherheit"
      icon={ShieldAlert}
      title="Sicherheit & Hinweise"
      summary={form.safetyNotes.length ? plural(form.safetyNotes.length, 'Hinweis', 'Hinweise') : 'Keine Hinweise'}
      hasError={sectionHasError(errors, 'sicherheit')}
    >
      <p className="flex items-start gap-2 rounded-xl bg-stone-50 px-4 py-3 text-hinweis text-stone-700 ring-1 ring-stone-200">
        <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
        Derzeit nur für das Team sichtbar – Lehrkräfte sehen diese Hinweise im Katalog nicht.
      </p>
      <Field label="Hinweise" hint="Jeder Hinweis wird als eigener Punkt gespeichert." error={errors.safetyNotes}>
        {({ id, describedBy, invalid }) => (
          <ListEditor id={id} values={form.safetyNotes} onChange={(v) => set('safetyNotes', v)} placeholder="z. B. Kleinteil – verschluckbar" describedBy={describedBy} invalid={invalid} multiline itemLabel="Hinweis" />
        )}
      </Field>
    </Section>
  );
}
