import { Field, Input } from '../../../components/ui';
import { passendeVorschlaege } from './vorschlaege';

/**
 * Freies Textfeld mit Vorschlägen als Knöpfe darunter (statt <datalist>, das auf iPad/iPhone kaum bedienbar ist):
 * per Touch, Tastatur und Screenreader gleich gut erreichbar; Tippen grenzt die Vorschläge ein.
 */
export function VorschlagFeld({
  label,
  value,
  onChange,
  vorschlaege,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  vorschlaege: string[];
  maxLength: number;
  placeholder?: string;
}) {
  const passend = passendeVorschlaege(vorschlaege, value);
  return (
    <Field label={label}>
      {({ id }) => (
        <>
          <Input id={id} value={value} maxLength={maxLength} placeholder={placeholder} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
          {passend.length > 0 && (
            <div role="group" aria-label={`Vorschläge für ${label}`} className="mt-1.5 flex flex-wrap gap-1.5">
              {passend.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChange(v)}
                  aria-label={`${label} „${v}“ übernehmen`}
                  className="inline-flex min-h-tipp max-w-full items-center rounded-full bg-white px-3 text-hinweis font-bold text-stone-700 ring-1 ring-inset ring-stone-300 hover:bg-brand-50 hover:text-brand-800 hover:ring-brand-300"
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Field>
  );
}
