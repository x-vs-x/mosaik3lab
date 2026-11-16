import { PenLine, Plus, Trash2 } from 'lucide-react';
import { ListEditor } from '../../../components/ListEditor';
import { Alert, Button, Field, Input, Select } from '../../../components/ui';
import type { CustomField, CustomFieldType } from '../../../lib/types';
import { MAX_CUSTOM_FIELDS, newId, plural, sectionHasError, type FormSectionProps } from './itemForm';
import { ListError, Section } from './Section';

/** Personalisierung: Angaben, die Lehrkräfte beim Anfragen machen. */
export function CustomFieldsSection({ form, set, errors }: FormSectionProps) {
  return (
    <Section
      id="personalisierung"
      icon={PenLine}
      title="Personalisierung"
      summary={form.customFields.length ? `${plural(form.customFields.length, 'Feld', 'Felder')}: ${form.customFields.map((f) => f.label).join(', ')}` : 'Keine Angaben abgefragt'}
      hasError={sectionHasError(errors, 'personalisierung')}
    >
      <CustomFieldsEditor fields={form.customFields} onChange={(v) => set('customFields', v)} error={errors.customFields} />
    </Section>
  );
}

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Zahl' },
  { value: 'select', label: 'Auswahl' },
];

/** Felder für personalisierbare Drucke (z. B. Beschriftung, Buchstabe, Höhe in mm). */
function CustomFieldsEditor({
  fields,
  onChange,
  error,
}: {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
  error?: string;
}) {
  const update = (index: number, patch: Partial<CustomField>) => onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  const add = () =>
    onChange([...fields, { id: newId('feld'), label: '', type: 'text', required: false, maxLength: 30, hint: '', options: [] }]);

  return (
    <div className="space-y-4">
      <p className="text-[0.9rem] text-stone-600">
        Angaben, die Lehrkräfte beim Anfragen machen – z. B. eine Beschriftung oder ein Buchstabe. Ohne Felder wird nichts
        zusätzlich abgefragt.
      </p>
      <Alert kind="warning">
        Datenschutz: Lehrkräfte sehen im Formular den Hinweis „keine Namen von Schülerinnen und Schülern, keine Diagnosen“.
        Bitte Felder so benennen, dass solche Angaben nicht nötig sind.
      </Alert>
      {fields.map((f, i) => (
        <div key={f.id} className="space-y-4 rounded-2xl p-4 ring-1 ring-stone-300 sm:p-5">
          <div className="flex items-end gap-3">
            <Field label={`Bezeichnung von Feld ${i + 1}`} required className="flex-1">
              {({ id }) => <Input id={id} value={f.label} onChange={(e) => update(i, { label: e.target.value })} maxLength={60} placeholder="z. B. Beschriftung" />}
            </Field>
            <Button variant="secondary" icon={Trash2} onClick={() => onChange(fields.filter((_, j) => j !== i))} aria-label={`Feld „${f.label || i + 1}“ entfernen`} className="text-rose-700">
              <span className="hidden sm:inline">Entfernen</span>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Typ">
              {({ id }) => (
                <Select id={id} value={f.type} onChange={(e) => update(i, { type: e.target.value as CustomFieldType })}>
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {f.type !== 'select' && (
              <Field label="Max. Zeichen">
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    max={200}
                    value={f.maxLength}
                    onChange={(e) => update(i, { maxLength: Math.min(200, Math.max(1, Number(e.target.value) || 1)) })}
                  />
                )}
              </Field>
            )}
            <label className="flex min-h-12 cursor-pointer items-center gap-3 self-end rounded-xl bg-white px-4 ring-1 ring-inset ring-stone-300">
              <input type="checkbox" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} className="size-5 accent-brand-700" />
              <span className="font-bold text-stone-800">Pflichtfeld</span>
            </label>
          </div>
          <Field label="Hinweis für Lehrkräfte" hint="Optional, erscheint unter der Bezeichnung.">
            {({ id, describedBy }) => <Input id={id} value={f.hint} onChange={(e) => update(i, { hint: e.target.value })} maxLength={200} aria-describedby={describedBy} placeholder="z. B. höchstens 10 Buchstaben" />}
          </Field>
          {f.type === 'select' && (
            <Field label="Auswahlmöglichkeiten" required hint="Eingabe mit Enter oder „Hinzufügen“ bestätigen.">
              {({ id, describedBy }) => (
                <ListEditor id={id} values={f.options} onChange={(v) => update(i, { options: v })} placeholder="z. B. A" describedBy={describedBy} itemLabel="Auswahl" />
              )}
            </Field>
          )}
        </div>
      ))}
      <ListError error={error} />
      {fields.length < MAX_CUSTOM_FIELDS && (
        <Button variant="soft" icon={Plus} onClick={add}>
          Feld hinzufügen
        </Button>
      )}
    </div>
  );
}
