import { EGAL_FARBE_NAME } from '@mosaik3lab/shared/werte/anfragen';
import { ChevronRight, Shuffle } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { ColorSwatch } from '../../components/ColorSwatch';
import { cx } from '../../components/ui';
import type { Filament } from '../../lib/types';
import { FarbwahlFenster } from './FarbwahlFenster';
import { gewaehlteFarbe } from './teileFarbwahl';

/** Bis zu so vielen Farben stehen sie als Knöpfe direkt im Formular, darüber als eine Zeile mit Farbwahl-Fenster. */
export const FARBKNOEPFE_BIS = 8;

/**
 * Farbwahl eines einfarbigen Druckteils mit vielen Farben: eine Zeile (Farbtupfer, Farbname, „Ändern“), ein Tipp öffnet
 * das Farbwahl-Fenster mit Suche und Farbfamilien – wie eine Zeile der Teile-Liste mehrfarbiger Druckteile. Ein Tipp im
 * Fenster wählt und schließt; der Fokus kehrt zur Zeile zurück.
 */
export function FarbZeile({
  legend,
  filaments,
  value,
  onChange,
  error,
}: {
  legend: string;
  filaments: Filament[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const uid = useId();
  const knopf = useRef<HTMLButtonElement>(null);
  const [offen, setOffen] = useState(false);
  const wahl = gewaehlteFarbe(filaments, value);
  const farbname = wahl === 'egal' ? EGAL_FARBE_NAME : wahl?.colorName;
  const schliessen = () => {
    setOffen(false);
    requestAnimationFrame(() => knopf.current?.focus());
  };
  return (
    <div className="min-w-0">
      <p className="mb-2 font-bold text-stone-800">
        {legend}
        <span className="ml-1 text-rose-700" aria-hidden>
          *
        </span>
      </p>
      <button
        ref={knopf}
        type="button"
        onClick={() => setOffen(true)}
        aria-haspopup="dialog"
        // data-fehler: aria-invalid ist an Knöpfen nicht erlaubt (siehe lib/fokus.ts)
        data-fehler={error ? true : undefined}
        aria-label={`${legend} (Pflicht): ${farbname ? `${farbname}, ändern` : 'noch keine Farbe, wählen'}`}
        aria-describedby={error ? `${uid}-fehler` : undefined}
        className={cx(
          'flex min-h-[56px] w-full items-center gap-[12px] rounded-xl bg-white px-[12px] py-[8px] text-left ring-inset hover:bg-stone-50',
          error ? 'ring-2 ring-rose-400' : 'ring-1 ring-stone-300',
        )}
      >
        <span className="shrink-0">
          {wahl === 'egal' ? (
            <span className="grid size-[32px] place-items-center rounded-full bg-stone-100 text-stone-600 ring-1 ring-inset ring-stone-300">
              <Shuffle className="size-4" aria-hidden />
            </span>
          ) : wahl ? (
            <ColorSwatch hex={wahl.hex} className="size-[32px]" />
          ) : (
            <span className={cx('block size-[32px] rounded-full border-2 border-dashed', error ? 'border-rose-500' : 'border-stone-400')} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx('block font-bold leading-snug hyphens-auto wrap-break-word', farbname ? 'text-stone-900' : 'text-brand-700')}>{farbname ?? 'Farbe wählen'}</span>
          <span className="block text-hinweis leading-snug text-stone-600">{filaments.length} Farben zur Wahl</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-hinweis font-bold text-brand-700">
          {farbname ? 'Ändern' : 'Wählen'}
          <ChevronRight className="size-5 text-stone-500" aria-hidden />
        </span>
      </button>
      {error && (
        <p id={`${uid}-fehler`} className="mt-1.5 text-hinweis font-bold text-rose-700">
          {error}
        </p>
      )}
      <FarbwahlFenster
        open={offen}
        ziel={{ art: 'eine', farben: filaments, gewaehlt: value || undefined }}
        anzahl={1}
        schonGewaehlt={[]}
        onWaehle={(id) => {
          onChange(id);
          schliessen();
        }}
        onClose={schliessen}
      />
    </div>
  );
}
