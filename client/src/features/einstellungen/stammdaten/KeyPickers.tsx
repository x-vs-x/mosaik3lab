import { Check } from 'lucide-react';
import { cx } from '../../../components/ui';
import { COLOR_KEYS, COLOR_STYLES, ICON_KEYS, ICONS } from '../../../lib/constants';
import type { ColorKey, IconKey } from '../../../lib/types';

/** Farbauswahl (Mosaikfarben) als Radiogruppe. */
export function ColorKeyPicker({ name, value, onChange, legend }: { name: string; value: ColorKey; onChange: (c: ColorKey) => void; legend: string }) {
  return (
    <fieldset>
      <legend className="mb-2 font-bold text-stone-800">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {COLOR_KEYS.map((c) => {
          const checked = c === value;
          return (
            <label
              key={c}
              className={cx(
                'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full py-1 pl-1.5 pr-3.5 text-[0.9rem] font-bold ring-1 ring-inset transition-colors',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600',
                checked ? 'bg-white text-stone-900 ring-2 ring-stone-900' : 'bg-white text-stone-700 ring-stone-300 hover:bg-stone-50',
              )}
            >
              <input type="radio" name={name} value={c} checked={checked} onChange={() => onChange(c)} className="sr-only" />
              <span
                aria-hidden
                className="grid size-8 place-items-center rounded-full ring-1 ring-inset ring-black/10"
                style={{ backgroundColor: COLOR_STYLES[c].swatch }}
              >
                {checked && <Check className="size-4 text-stone-900" />}
              </span>
              {COLOR_STYLES[c].label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Symbolauswahl als Radiogruppe. */
export function IconKeyPicker({ name, value, onChange }: { name: string; value: IconKey; onChange: (i: IconKey) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 font-bold text-stone-800">Symbol</legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ICON_KEYS.map((k) => {
          const checked = k === value;
          const Icon = ICONS[k].icon;
          return (
            <label
              key={k}
              className={cx(
                'flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-[0.85rem] font-bold break-words ring-1 ring-inset transition-colors',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600',
                checked ? 'bg-stone-900 text-white ring-stone-900' : 'bg-white text-stone-700 ring-stone-300 hover:bg-stone-50',
              )}
            >
              <input type="radio" name={name} value={k} checked={checked} onChange={() => onChange(k)} className="sr-only" />
              <Icon className="size-6" aria-hidden />
              <span className="leading-tight">{ICONS[k].label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
