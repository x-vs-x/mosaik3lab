import { Layers } from 'lucide-react';
import { Field, Input, Select, Textarea } from '../../../components/ui';
import { useMasterData } from '../../../lib/config';
import { formatDuration } from '../../../lib/format';
import { sectionHasError, type FormSectionProps } from './itemForm';
import { Section } from './Section';

/** Material & Druck: Material, Materialinformationen, geschätzte Druckdauer. */
export function MaterialSection({ form, set, errors }: FormSectionProps) {
  const md = useMasterData();
  const materialNames = md.materials.map((m) => m.name);
  const hours = Math.floor(form.printTimeMinutes / 60);
  const minutes = form.printTimeMinutes % 60;

  return (
    <Section
      id="material"
      icon={Layers}
      title="Material & Druck"
      summary={[form.material, formatDuration(form.printTimeMinutes)].filter(Boolean).join(' · ')}
      hasError={sectionHasError(errors, 'material')}
    >
      <Field label="Material" required error={errors.material}>
        {({ id, invalid }) => (
          <Select id={id} value={form.material} onChange={(e) => set('material', e.target.value)} invalid={invalid}>
            {!form.material && <option value="">Bitte wählen …</option>}
            {form.material && !materialNames.includes(form.material) && (
              <option value={form.material}>{form.material} (nicht mehr in den Stammdaten)</option>
            )}
            {materialNames.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Materialinformationen" hint="z. B. Eigenschaften, Reinigung, Temperaturbeständigkeit." error={errors.materialInfo}>
        {({ id, describedBy, invalid }) => (
          <Textarea id={id} rows={3} value={form.materialInfo} onChange={(e) => set('materialInfo', e.target.value)} maxLength={1000} aria-describedby={describedBy} invalid={invalid} className="min-h-20" />
        )}
      </Field>
      <fieldset>
        <legend className="mb-2 font-bold text-stone-800">
          Geschätzte Druckdauer <span className="text-rose-700" aria-hidden>*</span>
        </legend>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={166}
              value={hours}
              onChange={(e) => set('printTimeMinutes', Math.max(0, Number(e.target.value) || 0) * 60 + minutes)}
              className="w-24"
            />
            <span className="font-bold">Std.</span>
          </label>
          <label className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={59}
              step={5}
              value={minutes}
              onChange={(e) => set('printTimeMinutes', hours * 60 + Math.min(59, Math.max(0, Number(e.target.value) || 0)))}
              className="w-24"
            />
            <span className="font-bold">Min.</span>
          </label>
        </div>
        {errors.printTimeMinutes && <p className="mt-1.5 text-[0.9rem] font-bold text-rose-700">{errors.printTimeMinutes}</p>}
      </fieldset>
    </Section>
  );
}
