import { EGAL_FARBE, EGAL_FARBE_NAME } from '@mosaik3lab/shared/werte/anfragen';
import { farbenText, teileText } from '@mosaik3lab/shared/werte/farbgruppen';
import { CircleCheck, Minus, Plus, Shuffle, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ColorSwatch } from '../../components/ColorSwatch';
import { TeilSchilder } from '../../components/TeilSchilder';
import { TupferReihe } from '../../components/TupferReihe';
import { TeileFarbListe } from './TeileFarbListe';
import { Alert, Button, cx, Field, Input, Select } from '../../components/ui';
import type { AreaColors } from '../../lib/colors';
import type { CustomField, Filament } from '../../lib/types';
import type { ColorRowValue } from './anfrageAuswahl';

// Eingabefelder des Anfrageformulars (RequestDialog): Anzahl, Farbwahl je Zeile, Personalisierung.

export type { ColorRowValue } from './anfrageAuswahl';

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
  collapsed = false,
  onExpand,
  compareTo,
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
  /** Mehrteilige Druckteile mit mehreren Stückzahlen: diese Zeile nur als Zusammenfassung zeigen. */
  collapsed?: boolean;
  onExpand?: () => void;
  /** Farben der ersten Zeile – für „abweichend: Dach, Tor“ in der Zusammenfassung. */
  compareTo?: Record<string, string>;
}) {
  const prefix = index ? `variants.${index}.` : '';
  const title = numbered ? (multiColor ? `Stückzahl ${index + 1}` : `Farbe ${index + 1}`) : 'Farbe';
  const titleId = `farbzeile-${index}`;
  const fields = collapsed ? (
    <VarianteKurz row={row} areas={areas} compareTo={index ? compareTo : undefined} onExpand={onExpand} title={title} />
  ) : (
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
      {/* Mehrteilig: kurze Teile-Liste mit Farbwahl-Fenster; einfarbig bleibt das Knopf-Raster direkt im Formular. */}
      {multiColor && (
        <TeileFarbListe
          teile={areas}
          colors={row.colors}
          onChange={(colors) => onChange({ ...row, colors })}
          fehler={(areaId) => errors[`${prefix}color.${areaId}`]}
          titel={numbered ? `Farben (${title})` : 'Farben'}
        />
      )}
      {!multiColor && areas.map(({ area, filaments }) => (
        <EinfarbigeWahl
          key={area.id}
          legend={title}
          name={`farbe-${index}-${area.id}`}
          filaments={filaments}
          value={row.colors[area.id] ?? ''}
          onChange={(v) => onChange({ ...row, colors: { ...row.colors, [area.id]: v } })}
          error={errors[`${prefix}color`]}
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

/**
 * Zugeklappte Stückzahl eines mehrteiligen Druckteils: „2 × · 10 Teile · 2 Farben · abweichend: Dach, Tor“ – ein Tipp klappt
 * sie auf. Die abweichenden Teile stehen als Schildchen (bei Komma-Listen sähe man nach einem Umbruch nicht, wo ein Name endet).
 */
function VarianteKurz({
  row,
  areas,
  compareTo,
  onExpand,
  title,
}: {
  row: ColorRowValue;
  areas: AreaColors[];
  compareTo?: Record<string, string>;
  onExpand?: () => void;
  title: string;
}) {
  const ids = areas.map((a) => a.area.id);
  const gewaehlt = ids.map((id) => row.colors[id]).filter((c) => c && c !== EGAL_FARBE);
  const hex = [...new Set(gewaehlt)].map((id) => areas.flatMap((a) => a.filaments).find((f) => f.id === id)?.hex).filter((h): h is string => !!h);
  const abweichend = compareTo ? areas.filter((a) => (row.colors[a.area.id] ?? '') !== (compareTo[a.area.id] ?? '')) : [];
  const offen = ids.filter((id) => !row.colors[id]).length;
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-expanded={false}
      className="flex min-h-[48px] w-full items-center gap-[12px] rounded-xl bg-white px-[12px] py-[8px] text-left ring-1 ring-inset ring-stone-300 hover:bg-stone-50"
    >
      <b className="shrink-0 whitespace-nowrap">{row.quantity} ×</b>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <b>
          {teileText(ids.length)} · {farbenText(new Set(gewaehlt).size)}
        </b>
        <TupferReihe farben={hex} />
        {offen > 0 && <span className="text-hinweis font-bold text-brand-700">{offen} noch ohne Farbe</span>}
        {compareTo && (
          <span className="w-full text-hinweis text-stone-600">
            {abweichend.length ? 'abweichend:' : 'Farben wie oben'}
            {abweichend.length > 0 && <TeilSchilder namen={abweichend.map((a) => a.area.name)} />}
          </span>
        )}
      </span>
      <span className="shrink-0 text-hinweis font-bold text-brand-700">
        <span className="sr-only">{title} </span>Aufklappen
      </span>
    </button>
  );
}

/** Farbknöpfe eines einfarbigen Druckteils (vorrätige Farben + „Farbe egal“) – im Anfrage-Fenster und auf der Seite. */
export function EinfarbigeWahl({
  legend,
  name,
  filaments,
  value,
  onChange,
  error,
}: {
  legend: string;
  name: string;
  filaments: Filament[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <ChoiceGroup
      legend={legend}
      name={name}
      value={value}
      onChange={onChange}
      error={error}
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
  );
}

/** Hinweis, wenn ein Farbbereich gerade keine vorrätige Farbe hat (dann kann nicht angefragt werden). */
export function KeineFarbeHinweis({ leer, multiColor }: { leer: AreaColors[]; multiColor: boolean }) {
  if (!leer.length) return null;
  return (
    <Alert kind="warning" title="Derzeit keine Farbe vorrätig">
      {multiColor
        ? `Für „${leer.map((a) => a.area.name).join('“, „')}“ ist gerade keine Farbe vorrätig. Bitte versuchen Sie es später noch einmal.`
        : 'Alle Farben für dieses Druckteil sind gerade leer. Bitte versuchen Sie es später noch einmal.'}
    </Alert>
  );
}

/** Anzahl mit Minus/Plus. `context`: ID der Zeilenüberschrift, damit Screenreader „Farbe 2 Anzahl“ vorlesen. */
export function QuantityInput({
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
                  // min-w: auch kurze Werte („S“, „M“) sind mindestens so breit wie hoch (Tippfläche)
                  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-3 py-1.5 font-bold ring-inset transition-colors sm:min-h-12 sm:min-w-12 sm:gap-2.5 sm:px-4 sm:py-2',
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
