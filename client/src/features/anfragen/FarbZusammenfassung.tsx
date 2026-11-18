import { abweichendeTeile, farbZusammenfassung, nachFarbe, teileText, type TeilFarbe } from '@mosaik3lab/shared/werte/farbgruppen';
import { ChevronDown, Shuffle } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { ColorSwatch } from '../../components/ColorSwatch';
import { TupferReihe } from '../../components/TupferReihe';
import { cx } from '../../components/ui';
import { TeilSchilder } from '../../components/TeilSchilder';

/**
 * Farben einer mehrteiligen Anfrage, kompakt: zugeklappt „10 Teile · 7 Farben“ mit Farbtupfern, aufgeklappt die Teile
 * nach Farbe gebündelt (so druckt das Team eine Farbrolle nach der anderen) – umschaltbar auf Teile-Reihenfolge.
 * Für „Meine Anfragen“ und die Verwaltung; `zusatz` zeigt dem Team die Rolle (Marke, Linie, Nummer) zur Farbe.
 */
export function FarbZusammenfassung({
  teile,
  praefix,
  vergleich,
  zusatz,
  fuerTeam = false,
}: {
  teile: TeilFarbe[];
  /** z. B. „3 ×“ bei mehreren Stückzahlen. */
  praefix?: string;
  /** Farben der ersten Stückzahl – zeigt „abweichend: Dach, Tor“. */
  vergleich?: TeilFarbe[];
  zusatz?: (colorId: string) => ReactNode;
  fuerTeam?: boolean;
}) {
  const uid = useId();
  const [offen, setOffen] = useState(false);
  const [nachTeilen, setNachTeilen] = useState(false);
  const gruppen = nachFarbe(teile);
  const tupfer = gruppen.filter((g) => !g.egal && g.colorHex).map((g) => g.colorHex);
  const abweichend = vergleich ? abweichendeTeile(teile, vergleich) : [];

  const farbtupfer = (t: Pick<TeilFarbe, 'colorHex'> & { egal?: boolean }, size: string) =>
    t.egal || !t.colorHex ? (
      <span className={cx('grid shrink-0 place-items-center rounded-full bg-stone-100 text-stone-600 ring-1 ring-inset ring-stone-300', size)}>
        <Shuffle className="size-4" aria-hidden />
      </span>
    ) : (
      <ColorSwatch hex={t.colorHex} className={size} />
    );

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
        aria-controls={`${uid}-liste`}
        className="flex min-h-[48px] w-full items-center gap-[12px] rounded-xl bg-stone-50 px-[12px] py-[8px] text-left ring-1 ring-inset ring-stone-200 hover:bg-stone-100"
      >
        {praefix && <b className="shrink-0 whitespace-nowrap text-stone-900">{praefix}</b>}
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <b className="text-stone-900">{farbZusammenfassung(teile)}</b>
          <TupferReihe farben={tupfer} />
          {vergleich && (
            <span className="w-full text-hinweis font-normal text-stone-600">
              {abweichend.length ? 'abweichend:' : 'Farben wie bei der ersten Stückzahl'}
              {abweichend.length > 0 && <TeilSchilder namen={abweichend.map((t) => t.area)} />}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-hinweis font-bold text-brand-700">
          <span className="sr-only min-[400px]:not-sr-only">{offen ? 'Weniger' : 'Alle Teile'}</span>
          <ChevronDown className={cx('size-5 transition-transform', offen && 'rotate-180')} aria-hidden />
        </span>
      </button>
      {offen && (
        <div id={`${uid}-liste`}>
          <ul className="mt-2 divide-y divide-stone-200 rounded-xl bg-white ring-1 ring-inset ring-stone-200">
            {nachTeilen
              ? teile.map((t, i) => (
                  <li key={t.areaId} className="flex items-start gap-[12px] px-[12px] py-[8px]">
                    <span className="mt-[2px]">{farbtupfer({ ...t, egal: t.colorId === 'egal' }, 'size-6')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-stone-900 hyphens-auto wrap-break-word">
                        <span className="font-normal text-stone-500">{i + 1}.&nbsp;</span>
                        {t.area}
                      </span>
                      <span className="block text-hinweis text-stone-600 hyphens-auto wrap-break-word">
                        {t.color} {zusatz?.(t.colorId)}
                      </span>
                    </span>
                  </li>
                ))
              : gruppen.map((g) => (
                  <li key={g.schluessel} className="flex items-start gap-[12px] px-[12px] py-[10px]">
                    {farbtupfer(g, 'size-[28px]')}
                    <span className="min-w-0 flex-1">
                      <b className="block text-stone-900 hyphens-auto wrap-break-word">{g.egal ? 'Farbe egal – das Druck-Team wählt' : g.color}</b>
                      <span className="block text-hinweis text-stone-600">
                        <b className="whitespace-nowrap">{teileText(g.teile.length)}</b> {!g.egal && zusatz?.(g.colorId)}
                      </span>
                      <TeilSchilder namen={g.teile.map((t) => t.area)} />
                    </span>
                  </li>
                ))}
          </ul>
          {fuerTeam && !nachTeilen && <p className="mt-1.5 text-hinweis text-stone-600">Nach Farbe sortiert – so druckt das Team eine Farbrolle nach der anderen.</p>}
          <div className="mt-1.5 inline-flex rounded-xl p-1 ring-1 ring-inset ring-stone-300" role="group" aria-label="Sortierung der Teile">
            {(
              [
                [false, 'Nach Farbe'],
                [true, 'Nach Teilen'],
              ] as const
            ).map(([wert, text]) => (
              <button
                key={text}
                type="button"
                aria-pressed={nachTeilen === wert}
                onClick={() => setNachTeilen(wert)}
                className={cx('min-h-[44px] rounded-lg px-3 text-hinweis font-bold', nachTeilen === wert ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100')}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
