import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button, Input } from './ui';

/** Bearbeitbare Liste (Farben, Größen, Sicherheitshinweise). */
export function ListEditor({
  id,
  values,
  onChange,
  placeholder,
  describedBy,
  invalid,
  multiline = false,
  addLabel = 'Hinzufügen',
  itemLabel,
}: {
  id: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  describedBy?: string;
  invalid?: boolean;
  multiline?: boolean;
  addLabel?: string;
  itemLabel: string;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (!values.includes(value)) onChange([...values, value]);
    setDraft('');
  };

  return (
    <div>
      {values.length > 0 && (
        <ul className={multiline ? 'mb-3 space-y-2' : 'mb-3 flex flex-wrap gap-2'}>
          {values.map((v) => (
            <li
              key={v}
              className={
                multiline
                  ? 'flex items-start gap-2 rounded-xl bg-stone-50 py-2 pl-4 pr-2 ring-1 ring-stone-200'
                  : 'flex items-center gap-1 rounded-full bg-stone-100 py-1 pl-4 pr-1 font-bold text-stone-800 ring-1 ring-stone-200'
              }
            >
              <span className={multiline ? 'flex-1 py-1 text-[0.95rem]' : ''}>{v}</span>
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="grid size-11 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-white hover:text-rose-700"
                aria-label={`${itemLabel} „${v}“ entfernen`}
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          aria-describedby={describedBy}
          invalid={invalid}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="secondary" icon={Plus} onClick={add} disabled={!draft.trim()} className="shrink-0">
          <span className="hidden sm:inline">{addLabel}</span>
          <span className="sr-only sm:hidden">{addLabel}</span>
        </Button>
      </div>
    </div>
  );
}
