import { LoaderCircle, Share, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { DownloadFehler, holeDatei, speichereLokal, teile, wegFuer } from '../lib/herunterladen';
import { Dialog } from './Dialog';
import { useToast } from './Toast';
import { ActionBar, Button } from './ui';

/**
 * Knopf zum Herunterladen, der das App-Fenster nie wegnavigiert (siehe lib/herunterladen.ts):
 * lädt per fetch, zeigt währenddessen eine Ladeanzeige, auf iPad/iPhone danach das Teilen-Menü („In Dateien sichern“).
 */
export function DateiLaden({
  pfad,
  ersatzname,
  titel,
  icon: Icon,
  className,
  children,
  disabled,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: {
  /** Adresse der Datei, schon mit Basis-Pfad (withBase). */
  pfad: string;
  /** Dateiname, falls der Server keinen nennt. */
  ersatzname: string;
  /** Überschrift im Teilen-Menü. */
  titel: string;
  icon?: LucideIcon;
  className: string;
  children?: ReactNode;
  disabled?: boolean;
  'aria-label'?: string;
  'data-testid'?: string;
}) {
  const toast = useToast();
  const [laedt, setLaedt] = useState(false);
  // Safari erlaubt das Teilen nur direkt nach einem Tippen – dauert das Laden zu lange, braucht es ein zweites Tippen.
  const [bereit, setBereit] = useState<File>();

  const start = async () => {
    setLaedt(true);
    try {
      const file = await holeDatei(pfad, ersatzname);
      if (wegFuer(file) === 'teilen') {
        if ((await teile(file, titel)) === 'braucht-tippen') setBereit(file);
      } else speichereLokal(file);
    } catch (err) {
      toast('error', err instanceof DownloadFehler ? err.message : 'Herunterladen fehlgeschlagen.');
    } finally {
      setLaedt(false);
    }
  };

  const jetztTeilen = async () => {
    const file = bereit;
    setBereit(undefined);
    if (file) await teile(file, titel);
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={disabled || laedt}
        aria-busy={laedt || undefined}
        aria-label={ariaLabel}
        className={className}
        data-testid={testId}
      >
        {laedt ? <LoaderCircle className="size-5 shrink-0 animate-spin" aria-hidden /> : Icon && <Icon className="size-5 shrink-0" aria-hidden />}
        {children}
        {laedt && <span className="sr-only"> – wird geladen</span>}
      </button>
      <Dialog open={!!bereit} onClose={() => setBereit(undefined)} title="Datei ist bereit" size="sm">
        <p className="text-stone-700">
          „<strong className="wrap-anywhere">{bereit?.name}</strong>“ ist geladen. Tippen Sie auf „Sichern oder teilen“ und wählen Sie
          dann z. B. „In Dateien sichern“.
        </p>
        <ActionBar
          className="mt-6"
          secondary={<Button variant="secondary" onClick={() => setBereit(undefined)}>Abbrechen</Button>}
          primary={<Button icon={Share} onClick={jetztTeilen}>Sichern oder teilen</Button>}
        />
      </Dialog>
    </>
  );
}
