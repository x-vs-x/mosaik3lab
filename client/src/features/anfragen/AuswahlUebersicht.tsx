import { EGAL_FARBE, EGAL_FARBE_NAME } from '@mosaik3lab/shared/werte/anfragen';
import { Pencil, Shuffle } from 'lucide-react';
import type { ReactNode } from 'react';
import { ColorSwatch } from '../../components/ColorSwatch';
import { Button } from '../../components/ui';
import type { AreaColors } from '../../lib/colors';
import type { CustomField } from '../../lib/types';
import { teilFarben, type ColorRowValue } from './anfrageAuswahl';
import { FarbZusammenfassung } from './FarbZusammenfassung';

/**
 * Im Anfrage-Fenster: die schon auf der Druckteil-Seite getroffene Auswahl als kurze Zusammenfassung (Anzahl, Farbe(n),
 * Größe, Personalisierung). „Ändern“ klappt die Felder im Fenster auf – es ist derselbe Zustand wie auf der Seite.
 */
export function AuswahlUebersicht({
  titel,
  titelId,
  row,
  areas,
  multiColor,
  size,
  customFields,
  custom,
  onAendern,
}: {
  titel: string;
  titelId: string;
  row: ColorRowValue;
  areas: AreaColors[];
  multiColor: boolean;
  size: string;
  customFields: CustomField[];
  custom: Record<string, string>;
  onAendern: () => void;
}) {
  const farben = teilFarben(areas, row.colors);
  const einzeln = !multiColor ? farben[0] : undefined;
  const felder = customFields.filter((f) => custom[f.id]?.trim());
  return (
    <section aria-labelledby={titelId} className="min-w-0 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titelId} tabIndex={-1} className="text-abschnitt font-bold text-stone-900 focus:outline-none">
          {titel}
        </h3>
        <Button variant="secondary" icon={Pencil} onClick={onAendern} aria-label={`${titel} ändern`}>
          Ändern
        </Button>
      </div>
      <dl className="mt-3 grid gap-3">
        <Zeile label="Anzahl">{row.quantity} Stück</Zeile>
        {multiColor && farben.length > 0 && (
          <Zeile label="Farben">
            <FarbZusammenfassung teile={farben} />
          </Zeile>
        )}
        {einzeln && (
          <Zeile label="Farbe">
            <span className="inline-flex items-center gap-2">
              {einzeln.colorId === EGAL_FARBE ? <Shuffle className="size-5 text-stone-600" aria-hidden /> : <ColorSwatch hex={einzeln.colorHex} />}
              {einzeln.colorId === EGAL_FARBE ? `${EGAL_FARBE_NAME} – das Druck-Team wählt` : einzeln.color}
            </span>
          </Zeile>
        )}
        {size && <Zeile label="Größe">{size}</Zeile>}
        {felder.map((f) => (
          <Zeile key={f.id} label={f.label}>
            {custom[f.id].trim()}
          </Zeile>
        ))}
      </dl>
    </section>
  );
}

function Zeile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-hinweis font-bold text-stone-600 wrap-break-word">{label}</dt>
      <dd className="font-bold text-stone-900 wrap-anywhere">{children}</dd>
    </div>
  );
}
