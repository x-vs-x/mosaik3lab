import { MAX_COLOR_AREAS } from '@mosaik3lab/shared/werte/katalog';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Copy, List, MoreHorizontal, Palette, Plus, Trash2, Undo2 } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BlattDialog } from '../../../components/BlattDialog';
import { cx, inputClass } from '../../../components/ui';
import { useAutoHoehe } from '../../../lib/autoHoehe';
import type { ColorArea, Filament } from '../../../lib/types';
import { FarbauswahlDialog } from './GemeinsameFarben';
import { auswahlSchluessel, farbAnzahl, MAX_TEILNAME, verschiebe, type Auswahl } from './teileRegeln';
import { MehrereTeileDialog } from './MehrereTeileDialog';
import { newId } from './itemForm';

const iconKnopf = 'grid size-[48px] shrink-0 place-items-center rounded-xl ring-1 ring-inset ring-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:hover:bg-transparent';

/**
 * Schritt 2 beim Anlegen: die Teile als Liste mit Namensfeld, Farb-Schild („Farben aus Schritt 1“ / „eigene: 3 Farben“),
 * nach oben/unten und „⋯“ (Eigene Farben, Verschieben, Verdoppeln, Entfernen). Dazu „Teil hinzufügen“ und
 * „Mehrere Teile auf einmal“. Die Reihenfolge ist die im Anfrageformular.
 */
export function TeileListe({
  areas,
  gemeinsam,
  filaments,
  manageLink,
  onChange,
  onEntfernen,
  fehlerName,
}: {
  areas: ColorArea[];
  gemeinsam: Required<Auswahl>;
  filaments: Filament[];
  manageLink: boolean;
  onChange: (areas: ColorArea[]) => void;
  /** Entfernt ein Teil (bleibt eines übrig, wird das Druckteil einfarbig). */
  onEntfernen: (index: number) => void;
  /** Markiert leere Namen (nach einem Fehler beim Speichern). */
  fehlerName: boolean;
}) {
  const uid = useId();
  const listeRef = useRef<HTMLUListElement>(null);
  const [menue, setMenue] = useState<number | null>(null);
  const [eigene, setEigene] = useState<number | null>(null);
  const [viele, setViele] = useState(false);
  const gemeinsamKey = auswahlSchluessel(gemeinsam, filaments);
  const voll = areas.length >= MAX_COLOR_AREAS;

  const fokus = (index: number, aktion: string) =>
    requestAnimationFrame(() => {
      const zeile = listeRef.current?.querySelector(`[data-teil="${index}"]`);
      const ziel = zeile?.querySelector<HTMLElement>(`[data-aktion="${aktion}"]:not(:disabled)`) ?? zeile?.querySelector<HTMLElement>('[data-aktion="mehr"]');
      ziel?.focus();
    });
  const update = (i: number, patch: Partial<ColorArea>) => onChange(areas.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const bewege = (i: number, delta: number, aktion: string) => {
    onChange(verschiebe(areas, i, delta));
    fokus(i + delta, aktion);
  };
  const hinzufuegen = () => {
    onChange([...areas, { id: newId('teil'), name: `Teil ${areas.length + 1}`, ...gemeinsam, colors: [...gemeinsam.colors], gruppen: [...gemeinsam.gruppen] }]);
    requestAnimationFrame(() => listeRef.current?.querySelector<HTMLTextAreaElement>(`[data-teil="${areas.length}"] textarea`)?.select());
  };
  const verdoppeln = (i: number) => {
    const a = areas[i];
    let name = `${a.name} (2)`.slice(0, MAX_TEILNAME);
    for (let n = 3; areas.some((x) => x.name.toLowerCase() === name.toLowerCase()); n++) name = `${a.name.slice(0, MAX_TEILNAME - 5)} (${n})`;
    onChange([...areas.slice(0, i + 1), { ...a, id: newId('teil'), name }, ...areas.slice(i + 1)]);
    fokus(i + 1, 'mehr');
  };
  const eigenText = (a: ColorArea) => (auswahlSchluessel(a, filaments) === gemeinsamKey ? undefined : `eigene: ${farbAnzahl(a, filaments)} Farben`);

  const menueTeil = menue !== null ? areas[menue] : undefined;
  const eigeneTeil = eigene !== null ? areas[eigene] : undefined;
  const menuePunkt = (icon: ReactNode, text: string, onClick: () => void, extra?: { disabled?: boolean; gefahr?: boolean }) => (
    <button
      type="button"
      disabled={extra?.disabled}
      onClick={onClick}
      className={cx(
        'flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left font-bold hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-transparent',
        extra?.gefahr ? 'text-rose-700' : 'text-stone-800',
      )}
    >
      <span className="shrink-0">{icon}</span>
      {text}
    </button>
  );
  const ausMenue = (aktion: () => void) => () => {
    setMenue(null);
    aktion();
  };

  return (
    <div>
      <ul ref={listeRef} className="@container divide-y divide-stone-200 rounded-2xl ring-1 ring-inset ring-stone-300" aria-label="Teile">
        {areas.map((a, i) => {
          const eigen = eigenText(a);
          return (
            <li key={a.id} data-teil={i} className="px-[8px] py-[8px] sm:px-[12px]">
              <div className="flex items-start gap-[8px] @max-[15rem]:flex-wrap">
                <span className="mt-[12px] w-7 shrink-0 text-right text-hinweis text-stone-500 @max-[15rem]:mt-0 @max-[15rem]:w-auto @max-[15rem]:flex-1 @max-[15rem]:self-center @max-[15rem]:text-left">
                  <span className="hidden @max-[15rem]:inline">Teil </span>
                  {i + 1}
                </span>
                <NameFeld
                  wert={a.name}
                  label={`Name von Teil ${i + 1}`}
                  invalid={fehlerName && !a.name.trim()}
                  onChange={(name) => update(i, { name })}
                />
                <button
                  type="button"
                  data-aktion="farben"
                  onClick={() => setEigene(i)}
                  aria-label={`Farben für ${a.name || `Teil ${i + 1}`}: ${eigen ?? 'wie Schritt 1'}, ändern`}
                  className={cx(
                    'hidden min-h-[48px] w-[12.5rem] shrink-0 items-center gap-[6px] rounded-xl px-[10px] py-[6px] text-left text-hinweis font-bold leading-snug sm:inline-flex @max-[15rem]:hidden',
                    eigen ? 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-300 hover:bg-amber-100' : 'text-stone-600 ring-1 ring-inset ring-stone-200 hover:bg-stone-50',
                  )}
                >
                  <Palette className="size-5 shrink-0" aria-hidden />
                  {eigen ?? 'Farben aus Schritt 1'}
                </button>
                <button type="button" data-aktion="hoch" className={cx(iconKnopf, 'hidden sm:grid @max-[15rem]:hidden')} disabled={i === 0} onClick={() => bewege(i, -1, 'hoch')} aria-label={`${a.name || `Teil ${i + 1}`} nach oben`}>
                  <ChevronUp className="size-5" aria-hidden />
                </button>
                <button
                  type="button"
                  data-aktion="runter"
                  className={cx(iconKnopf, 'hidden sm:grid @max-[15rem]:hidden')}
                  disabled={i === areas.length - 1}
                  onClick={() => bewege(i, 1, 'runter')}
                  aria-label={`${a.name || `Teil ${i + 1}`} nach unten`}
                >
                  <ChevronDown className="size-5" aria-hidden />
                </button>
                <button type="button" data-aktion="mehr" className={cx(iconKnopf, '@max-[15rem]:order-2')} aria-haspopup="dialog" onClick={() => setMenue(i)} aria-label={`Mehr zu ${a.name || `Teil ${i + 1}`}`}>
                  <MoreHorizontal className="size-5" aria-hidden />
                </button>
              </div>
              {eigen && (
                <p className="ml-[36px] mt-[6px] sm:hidden @max-[15rem]:ml-0">
                  <button
                    type="button"
                    onClick={() => setEigene(i)}
                    className="inline-flex min-h-[48px] items-center gap-[6px] rounded-lg bg-amber-50 px-[8px] py-[4px] text-hinweis font-bold text-amber-900 ring-1 ring-inset ring-amber-300"
                  >
                    <Palette className="size-4 shrink-0" aria-hidden />
                    {eigen}
                    <span className="sr-only"> für {a.name}, ändern</span>
                  </button>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={hinzufuegen}
          disabled={voll}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-brand-50 px-4 font-bold text-brand-800 ring-1 ring-inset ring-brand-200 hover:bg-brand-100 disabled:bg-stone-100 disabled:text-stone-500 disabled:ring-stone-200"
        >
          <Plus className="size-5" aria-hidden /> Teil hinzufügen
        </button>
        <button
          type="button"
          onClick={() => setViele(true)}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-white px-4 font-bold text-stone-800 ring-1 ring-inset ring-stone-300 hover:bg-stone-50"
          id={`${uid}-viele`}
        >
          <List className="size-5" aria-hidden /> Mehrere Teile auf einmal
        </button>
      </div>
      {voll && (
        <p className="mt-2 text-hinweis font-bold text-stone-700" role="status">
          Höchstens {MAX_COLOR_AREAS} Teile – das Druckteil ist voll. Entfernen Sie ein Teil, um ein neues hinzuzufügen.
        </p>
      )}
      <p className="mt-3 text-hinweis text-stone-600">
        Ohne eigene Auswahl gelten für jedes Teil die Farben aus Schritt 1. Eigene Farben (z. B. Grundplatte nur Schwarz, Weiß,
        Grau) über das Farb-Schild oder „⋯“ beim Teil.
      </p>

      {menueTeil &&
        menue !== null &&
        createPortal(
          <BlattDialog
            open
            breite="sm"
            onClose={() => {
              const i = menue;
              setMenue(null);
              fokus(i, 'mehr');
            }}
            labelledBy={`${uid}-menue`}
            kopf={
              <p id={`${uid}-menue`} className="pt-2 text-hinweis text-stone-600 hyphens-auto wrap-break-word">
                Teil {menue + 1}: <b className="text-stone-900">{menueTeil.name || 'ohne Namen'}</b>
              </p>
            }
          >
            <div className="pb-2">
              {menuePunkt(<Palette className="size-5" aria-hidden />, eigenText(menueTeil) ? 'Eigene Farben ändern' : 'Eigene Farben festlegen', ausMenue(() => setEigene(menue)))}
              {eigenText(menueTeil) &&
                menuePunkt(<Undo2 className="size-5" aria-hidden />, 'Farben aus Schritt 1 verwenden', ausMenue(() => {
                  update(menue, { ...gemeinsam });
                  fokus(menue, 'mehr');
                }))}
              {menuePunkt(<ArrowUp className="size-5" aria-hidden />, 'Nach oben', ausMenue(() => bewege(menue, -1, 'mehr')), { disabled: menue === 0 })}
              {menuePunkt(<ArrowDown className="size-5" aria-hidden />, 'Nach unten', ausMenue(() => bewege(menue, 1, 'mehr')), { disabled: menue === areas.length - 1 })}
              {menuePunkt(<Copy className="size-5" aria-hidden />, 'Teil verdoppeln', ausMenue(() => verdoppeln(menue)), { disabled: voll })}
              {menuePunkt(
                <Trash2 className="size-5" aria-hidden />,
                'Teil entfernen',
                ausMenue(() => {
                  onEntfernen(menue);
                  fokus(Math.max(0, menue - 1), 'mehr');
                }),
                { gefahr: true },
              )}
            </div>
          </BlattDialog>,
          document.body,
        )}
      {eigeneTeil && eigene !== null && (
        <FarbauswahlDialog
          open
          titel={`Farben für „${eigeneTeil.name || `Teil ${eigene + 1}`}“`}
          hinweis={eigenText(eigeneTeil) ? 'Eigene Auswahl nur für dieses Teil.' : 'Ändern Sie hier etwas, bekommt dieses Teil eine eigene Auswahl. Die anderen Teile behalten die Farben aus Schritt 1.'}
          auswahl={eigeneTeil}
          filaments={filaments}
          manageLink={manageLink}
          onChange={(neu) => update(eigene, neu)}
          zusatzKnopf={eigenText(eigeneTeil) ? { text: 'Farben aus Schritt 1 verwenden', onClick: () => update(eigene, { ...gemeinsam }) } : undefined}
          onClose={() => {
            const i = eigene;
            setEigene(null);
            fokus(i, 'farben');
          }}
        />
      )}
      {viele && (
        <MehrereTeileDialog
          areas={areas}
          gemeinsam={gemeinsam}
          onUebernehmen={(neu) => {
            onChange(neu);
            setViele(false);
            requestAnimationFrame(() => document.getElementById(`${uid}-viele`)?.focus());
          }}
          onClose={() => {
            setViele(false);
            requestAnimationFrame(() => document.getElementById(`${uid}-viele`)?.focus());
          }}
        />
      )}
    </div>
  );
}

/** Namensfeld, das mit dem Text wächst (lange Namen brechen um statt abgeschnitten zu werden); kein Zeilenumbruch im Namen. */
function NameFeld({ wert, label, invalid, onChange }: { wert: string; label: string; invalid: boolean; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoHoehe(ref, wert);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={wert}
      maxLength={MAX_TEILNAME}
      aria-label={label}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.preventDefault();
      }}
      className={cx(inputClass(invalid), 'min-h-[48px] min-w-0 flex-1 resize-none overflow-hidden py-[10px] font-bold leading-snug hyphens-auto wrap-break-word @max-[15rem]:order-3 @max-[15rem]:basis-full')}
    />
  );
}
