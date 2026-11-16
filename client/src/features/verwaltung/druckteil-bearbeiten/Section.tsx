import { ChevronDown, CircleAlert, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Card, cx } from '../../../components/ui';

/** Klar gerahmter, einklappbarer Abschnitt. Klappt bei Fehlern automatisch auf. */
export function Section({
  id,
  icon: Icon,
  title,
  summary,
  defaultOpen = false,
  hasError = false,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  hasError?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (hasError) setOpen(true);
  }, [hasError]);
  const contentId = `abschnitt-${id}`;
  return (
    <Card as="section" className={cx('overflow-hidden', hasError && 'ring-2 ring-rose-300')}>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left sm:min-h-16 sm:gap-4 sm:px-7 sm:py-4 transition-colors hover:bg-stone-50 focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-brand-600"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 sm:size-11 sm:rounded-2xl">
            <Icon className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold text-stone-900 sm:text-xl">{title}</span>
            {summary && <span className="block break-words text-[0.9rem] font-normal text-stone-600">{summary}</span>}
          </span>
          {hasError && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[0.85rem] font-bold text-rose-800 ring-1 ring-rose-200">
              <CircleAlert className="size-4" aria-hidden />
              Bitte prüfen
            </span>
          )}
          <ChevronDown className={cx('size-6 shrink-0 text-stone-500 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </h2>
      <div id={contentId} hidden={!open} className="space-y-4 border-t border-stone-100 px-4 pb-5 pt-4 sm:space-y-5 sm:px-7 sm:pb-7 sm:pt-6">
        {children}
      </div>
    </Card>
  );
}

/** Platzhalter für Abschnitte mit Uploads, solange das Druckteil noch nicht gespeichert ist. */
export function AfterFirstSave() {
  return (
    <p className="rounded-xl bg-stone-50 px-4 py-3 text-stone-700 ring-1 ring-stone-200">
      Nach dem ersten Speichern („Druckteil anlegen“) können Sie hier Dateien hochladen.
    </p>
  );
}

/** Fehlermeldung unter einem Listen-Editor (Farbbereiche, Personalisierungsfelder). */
export function ListError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="flex items-center gap-1.5 text-[0.9rem] font-bold text-rose-700" role="alert">
      <CircleAlert className="size-4 shrink-0" aria-hidden />
      {error}
    </p>
  );
}
