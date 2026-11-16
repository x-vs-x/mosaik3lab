import { EGAL_FARBE, EGAL_FARBE_NAME } from '@mosaik3lab/shared/anfragen';
import { CircleCheck, Minus, Plus, Shuffle, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ColorSwatch } from '../../components/ColorSwatch';
import { Button, cx, Field, Input, Select } from '../../components/ui';
import type { AreaColors } from '../../lib/colors';
import type { CustomField } from '../../lib/types';

// Eingabefelder des Anfrageformulars (RequestDialog): Anzahl, Farbwahl je Zeile, Personalisierung.

/** Eine Zeile „Anzahl + Farbe je Farbbereich“ – mehrere Zeilen = mehrere Farben in einer Anfrage. */
export interface ColorRowValue {
  quantity: number;
  colors: Record<string, string>;
}

/**
 * Anzahl und Farbwahl einer Zeile. Ab zwei Zeilen nummeriert („Farbe 1“, „Farbe 2“) in einem eigenen Kasten;
 * Zusatzzeilen haben „Entfernen“. Fehler-Felder wie beim Server: `color…`, ab der zweiten Zeile `variants.<n>.color…`.
 */
export function ColorRow({
  index,
  numbered,
  row,
  areas,
  multiColor,
  max,
  errors,
  onChange,
  onRemove,
}: {
  index: number;
  numbered: boolean;
  row: ColorRowValue;
  areas: AreaColors[];
  multiColor: boolean;
  max: number;
  errors: Record<string, string>;
  onChange: (row: ColorRowValue) => void;
  onRemove?: () => void;
}) {
  const prefix = index ? `variants.${index}.` : '';
  const title = numbered ? `Farbe ${index + 1}` : 'Farbe';
  const titleId = `farbzeile-${index}`;
  const fields = (
    <>
      <QuantityInput
        id={`anzahl-${index}`}
        context={numbered ? titleId : undefined}
        contextLabel={numbered ? ` (${title})` : ''}
        value={row.quantity}
        max={max}
        onChange={(quantity) => onChange({ ...row, quantity })}
        error={index ? undefined : errors.quantity}
      />
      {areas.map(({ area, filaments }) => (
        <ChoiceGroup
          key={area.id}
          legend={multiColor ? `${title}: ${area.name}` : title}
          name={`farbe-${index}-${area.id}`}
          value={row.colors[area.id] ?? ''}
          onChange={(v) => onChange({ ...row, colors: { ...row.colors, [area.id]: v } })}
          error={errors[prefix + (multiColor ? `color.${area.id}` : 'color')]}
          options={[
            ...filaments.map((f) => ({
              value: f.id,
              content: (
                <>
                  <ColorSwatch hex={f.hex} className="size-6 sm:size-7" />
                  <span className="text-left leading-tight">{f.colorName}</span>
                </>
              ),
            })),
            // „Farbe egal“: das Druck-Team wählt die Farbe.
            {
              value: EGAL_FARBE,
              content: (
                <>
                  <Shuffle className="size-5 text-stone-600 sm:size-6" aria-hidden />
                  <span className="text-left leading-tight">{EGAL_FARBE_NAME}</span>
                </>
              ),
            },
          ]}
        />
      ))}
    </>
  );
  if (!numbered) return fields;
  return (
    <section aria-labelledby={titleId} className="min-w-0 space-y-4 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200 sm:space-y-5 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <h3 id={titleId} tabIndex={-1} className="text-abschnitt font-bold text-stone-900 focus:outline-none">
          {title}
        </h3>
        {onRemove && (
          <Button variant="secondary" icon={Trash2} onClick={onRemove} aria-label={`${title} entfernen`}>
            Entfernen
          </Button>
        )}
      </div>
      {fields}
    </section>
  );
}

/** Anzahl mit Minus/Plus. `context`: ID der Zeilenüberschrift, damit Screenreader „Farbe 2 Anzahl“ vorlesen. */
function QuantityInput({
  id,
  context,
  contextLabel,
  value,
  max,
  onChange,
  error,
}: {
  id: string;
  context?: string;
  contextLabel: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
  error?: string;
}) {
  const labelId = `${id}-label`;
  const labelledBy = context ? `${context} ${labelId}` : labelId;
  return (
    <div>
      <p id={labelId} className="mb-1.5 font-bold text-stone-800">
        Anzahl
      </p>
      <div className="inline-flex items-center gap-2" role="group" aria-labelledby={labelledBy}>
        <Button
          variant="secondary"
          icon={Minus}
          aria-label={`Anzahl verringern${contextLabel}`}
          onClick={() => onChange(Math.max(1, value - 1))}
          disabled={value <= 1}
          className="w-12 px-0 sm:px-0"
        />
        <Input
          id={id}
          type="number"
          min={1}
          max={max}
          inputMode="numeric"
          value={value}
          aria-labelledby={labelledBy}
          onChange={(e) => onChange(Math.min(max, Math.max(1, Number(e.target.value) || 1)))}
          className="w-20 text-center text-lg font-bold"
        />
        <Button
          variant="secondary"
          icon={Plus}
          aria-label={`Anzahl erhöhen${contextLabel}`}
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-12 px-0 sm:px-0"
        />
      </div>
      {error && <p className="mt-1.5 text-hinweis font-bold text-rose-700">{error}</p>}
    </div>
  );
}

export function CustomFieldInput({
  field,
  value,
  onChange,
  error,
}: {
  field: CustomField;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const ownHint = field.hint && !/[.!?…]$/.test(field.hint) ? `${field.hint}.` : field.hint;
  const hint = [ownHint, field.type !== 'select' && `Höchstens ${field.maxLength} Zeichen.`].filter(Boolean).join(' ');
  return (
    <Field label={field.label} required={field.required} error={error} hint={hint || undefined}>
      {({ id, describedBy, invalid }) =>
        field.type === 'select' ? (
          <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} invalid={invalid} aria-required={field.required}>
            <option value="">{field.required ? 'Bitte wählen …' : 'Keine Angabe'}</option>
            {field.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        ) : (
          <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={field.maxLength}
            inputMode={field.type === 'number' ? 'decimal' : undefined}
            aria-required={field.required}
            aria-describedby={describedBy}
            invalid={invalid}
            autoComplete="off"
          />
        )
      }
    </Field>
  );
}

export function ChoiceGroup({
  legend,
  name,
  options,
  value,
  onChange,
  error,
}: {
  legend: string;
  name: string;
  options: { value: string; content: ReactNode }[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const errorId = `${name}-error`;
  return (
    <fieldset className="min-w-0" aria-invalid={!!error || undefined} aria-describedby={error ? errorId : undefined}>
      <legend className="mb-2 font-bold text-stone-800">
        {legend}
        <span className="ml-1 text-rose-700" aria-hidden>
          *
        </span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <label key={opt.value} className="cursor-pointer">
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={selected}
                onChange={() => onChange(opt.value)}
                required
                className="peer sr-only"
              />
              <span
                className={cx(
                  'inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-1.5 font-bold ring-inset transition-colors sm:min-h-12 sm:gap-2.5 sm:px-4 sm:py-2',
                  'peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600',
                  selected
                    ? 'bg-brand-50 text-brand-900 ring-2 ring-brand-700'
                    : 'bg-white text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50 hover:ring-stone-400',
                  error && !selected && 'ring-rose-400',
                )}
              >
                {opt.content}
                {selected && <CircleCheck className="size-5 shrink-0 text-brand-700" aria-hidden />}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-hinweis font-bold text-rose-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
