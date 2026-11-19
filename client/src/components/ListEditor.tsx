import { Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
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

  const listRef = useRef<HTMLUListElement>(null);
  const remove = (v: string, index: number) => {
    onChange(values.filter((x) => x !== v));
    // Fokus nicht im Nichts lassen: nächster Eintrag, sonst das Eingabefeld.
    requestAnimationFrame(() => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button');
      const next = buttons?.length ? buttons[Math.min(index, buttons.length - 1)] : document.getElementById(id);
      next?.focus();
    });
  };

  return (
    <div>
      {values.length > 0 && (
        <ul ref={listRef} className={multiline ? 'mb-3 space-y-2' : 'mb-3 flex flex-wrap gap-2'}>
          {values.map((v, i) => (
            <li
              key={v}
              className={
                multiline
                  ? 'flex items-start gap-2 rounded-xl bg-stone-50 py-2 pl-4 pr-2 ring-1 ring-stone-200'
                  : 'flex items-center gap-1 rounded-full bg-stone-100 py-1 pl-4 pr-1 font-bold text-stone-800 ring-1 ring-stone-200'
              }
            >
              <span className={multiline ? 'flex-1 py-1 text-base' : ''}>{v}</span>
              <button
                type="button"
                onClick={() => remove(v, i)}
                className="grid size-tipp shrink-0 place-items-center rounded-full text-stone-500 hover:bg-white hover:text-rose-700"
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
          // Getippt, aber nicht bestätigt? Beim Verlassen des Felds trotzdem übernehmen.
          onBlur={add}
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
