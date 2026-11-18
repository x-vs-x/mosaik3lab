import { RotateCw, Search, type LucideIcon } from 'lucide-react';
import { useEffect, useReducer, useRef, type ReactNode } from 'react';
import type { ApiError } from '../lib/api';
import { suchEntwurf, suchEntwurfStart } from '../lib/suchEntwurf';
import { Alert, Button, cx, inputClass } from './ui';

// Gemeinsame Bausteine der Listen-Seiten: Filterknopf, Suchfeld, Ladefehler mit „Erneut versuchen“.

/**
 * Filterknopf als runde Pille (`aria-pressed`). `count` erscheint als Zähler daneben, für Screenreader als „Anzahl: n“.
 * In eine Gruppe mit `role="group"` und `aria-label` setzen.
 */
export function FilterKnopf({
  label,
  active,
  onClick,
  count,
  icon: Icon,
}: {
  label: ReactNode;
  active: boolean;
  onClick: () => void;
  count?: number;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full px-3.5 text-base font-bold transition-colors sm:gap-2 sm:px-4',
        active ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 ring-1 ring-inset ring-stone-300 hover:bg-stone-50 hover:ring-stone-400',
      )}
    >
      {Icon && <Icon className="size-4" aria-hidden />}
      {label}
      {count !== undefined && (
        <span className={cx('rounded-full px-2 py-0.5 text-hinweis', active ? 'bg-white/20' : 'bg-stone-100 text-stone-600')}>
          <span className="sr-only">Anzahl: </span>
          {count}
        </span>
      )}
    </button>
  );
}

/** Pause nach dem letzten Tastendruck, bevor das Suchfeld den Text nach außen gibt (Adresse, Filter). */
export const SUCHE_VERZOEGERUNG_MS = 300;

/**
 * Suchfeld mit Lupe und Beschriftung für Screenreader. `className` gilt für den Rahmen (Breite),
 * `inputClassName` ersetzt die Standard-Optik des Feldes (nur der Katalog hat eine eigene).
 * Das Feld zeigt immer das Getippte und meldet es erst nach einer kurzen Pause über `onChange` – so gehen bei schnellem
 * Tippen keine Zeichen verloren, wenn `value` aus der Adresse kommt (lib/suchEntwurf.ts). Ändert sich `value` von außen
 * (Zurück/Vor, Link mit ?q=, Filter zurücksetzen), übernimmt das Feld den neuen Wert.
 */
export function Suchfeld({
  id,
  label,
  value,
  onChange,
  placeholder,
  className,
  inputClassName,
  verzoegerungMs = SUCHE_VERZOEGERUNG_MS,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  verzoegerungMs?: number;
}) {
  const [stand, dispatch] = useReducer(suchEntwurf, value, suchEntwurfStart);
  // Wert von außen geändert → übernehmen (React erlaubt diese Anpassung während des Renderns).
  if (value !== stand.aussen) dispatch({ typ: 'aussen', wert: value });
  const melden = useRef(onChange);
  useEffect(() => {
    melden.current = onChange;
  });
  const { ausstehend } = stand;
  useEffect(() => {
    if (ausstehend === null) return;
    const t = setTimeout(() => {
      melden.current(ausstehend);
      dispatch({ typ: 'geschrieben' });
    }, verzoegerungMs);
    return () => clearTimeout(t);
  }, [ausstehend, verzoegerungMs]);

  return (
    <div className={cx('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-500" aria-hidden />
      <input
        id={id}
        type="search"
        value={stand.entwurf}
        onChange={(e) => dispatch({ typ: 'tippen', text: e.target.value })}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName ?? cx(inputClass(), 'pl-12')}
      />
    </div>
  );
}

/** Ladefehler einer Seite mit „Erneut versuchen“ (z. B. nach einem WLAN-Aussetzer) – ohne Fehler nichts. */
export function LadeFehler({
  error,
  onRetry,
  loading,
  className = 'mb-4',
}: {
  error: ApiError | string | undefined;
  onRetry: () => void;
  loading?: boolean;
  className?: string;
}) {
  if (!error) return null;
  return (
    <Alert kind="error" className={className}>
      <p>{typeof error === 'string' ? error : error.message}</p>
      <Button variant="secondary" icon={RotateCw} className="mt-3" loading={loading} onClick={onRetry}>
        Erneut versuchen
      </Button>
    </Alert>
  );
}
