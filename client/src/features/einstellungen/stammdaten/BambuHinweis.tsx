import { Alert, Button } from '../../../components/ui';
import type { BambuAbgleichHinweis } from '../../../lib/types';

/** Hinweis nach einem Update: was der Abgleich an den Bambu-Farbrollen geändert hat und welche Farben neu sind. */
export function BambuHinweis({
  hinweis,
  onNeueAnsehen,
  onGelesen,
}: {
  hinweis: BambuAbgleichHinweis;
  onNeueAnsehen: () => void;
  onGelesen: () => void;
}) {
  const { aenderungen, neu } = hinweis;
  return (
    <Alert className="mt-3 text-stone-900" title="Bambu-Lab-Farben wurden aktualisiert">
      <p>
        Beim letzten Update wurde der Bambu-Katalog abgeglichen (Stand {hinweis.stand}). „Vorrätig“ und Ihre eigenen Farbrollen
        bleiben unverändert.
      </p>
      {aenderungen.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          {aenderungen.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
      {neu.length > 0 && <p className="mt-2">{neu.length === 1 ? '1 Farbe ist' : `${neu.length} Farben sind`} neu im Katalog.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {neu.length > 0 && (
          <Button size="sm" variant="soft" onClick={onNeueAnsehen}>
            Neue Farben ansehen
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onGelesen}>
          Hinweis ausblenden
        </Button>
      </div>
    </Alert>
  );
}
