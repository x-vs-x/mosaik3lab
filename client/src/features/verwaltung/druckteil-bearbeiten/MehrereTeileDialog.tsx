import { MAX_COLOR_AREAS } from '@mosaik3lab/shared/werte/katalog';
import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { BlattDialog } from '../../../components/BlattDialog';
import { Button, inputClass } from '../../../components/ui';
import type { ColorArea } from '../../../lib/types';
import { teileAusText, type Auswahl } from './teileRegeln';

/**
 * „Mehrere Teile auf einmal“: Namen eintippen oder einfügen, ein Teil je Zeile. Darunter eine nummerierte Vorschau –
 * lange Namen brechen im Textfeld weich um, und „Grundplatte / links unten“ sähe sonst aus wie zwei Teile.
 * Wird bei jedem Öffnen neu eingehängt (key), damit das Textfeld den aktuellen Stand zeigt.
 */
export function MehrereTeileDialog({
  areas,
  gemeinsam,
  onUebernehmen,
  onClose,
}: {
  areas: ColorArea[];
  gemeinsam: Auswahl;
  onUebernehmen: (areas: ColorArea[]) => void;
  onClose: () => void;
}) {
  const uid = useId();
  const [text, setText] = useState(() => areas.map((a) => a.name).join('\n'));
  const ergebnis = teileAusText(text, areas, gemeinsam);
  return createPortal(
    <BlattDialog
      open
      onClose={onClose}
      labelledBy={`${uid}-titel`}
      breite="md"
      ersterFokus={() => document.getElementById(`${uid}-text`)}
      kopf={
        <h2 id={`${uid}-titel`} className="pt-2 text-abschnitt font-bold leading-snug text-stone-900 sm:text-xl">
          Mehrere Teile auf einmal
        </h2>
      }
      fuss={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => onUebernehmen(ergebnis.areas)} disabled={!!ergebnis.fehler}>
            {ergebnis.namen.length} Teile übernehmen
          </Button>
        </div>
      }
    >
      <p id={`${uid}-hilfe`} className="mb-2 text-hinweis text-stone-600">
        Ein Teil je Zeile (Eingabetaste = neues Teil), auch zum Einfügen aus einer Liste. Neue Teile bekommen die Farben aus
        Schritt 1, Teile mit gleichem Namen behalten ihre Farben.
      </p>
      <label htmlFor={`${uid}-text`} className="sr-only">
        Namen der Teile, ein Teil je Zeile
      </label>
      <textarea
        id={`${uid}-text`}
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-describedby={`${uid}-hilfe ${uid}-zahl`}
        aria-invalid={ergebnis.fehler ? true : undefined}
        className={`${inputClass(!!ergebnis.fehler)} min-h-[10rem] leading-relaxed`}
      />
      <p id={`${uid}-zahl`} className={ergebnis.fehler ? 'mt-1 text-hinweis font-bold text-rose-700' : 'mt-1 text-hinweis font-bold text-stone-700'} aria-live="polite">
        {ergebnis.namen.length} {ergebnis.namen.length === 1 ? 'Teil' : 'Teile'} erkannt · höchstens {MAX_COLOR_AREAS}
        {ergebnis.fehler && <span className="block">{ergebnis.fehler}</span>}
      </p>
      {ergebnis.namen.length > 0 && (
        <>
          <h3 className="mt-3 text-hinweis font-bold uppercase tracking-wide text-stone-600">Vorschau</h3>
          <ol className="mt-1 divide-y divide-stone-200 rounded-xl text-hinweis ring-1 ring-inset ring-stone-200">
            {ergebnis.namen.map((n, i) => (
              <li key={i} className="flex gap-[8px] px-[10px] py-[6px]">
                <span className="w-[2.2em] shrink-0 text-right text-stone-500">{i + 1}.</span>
                <b className="min-w-0 flex-1 text-stone-900 hyphens-auto wrap-break-word">{n}</b>
              </li>
            ))}
          </ol>
        </>
      )}
    </BlattDialog>,
    document.body,
  );
}
