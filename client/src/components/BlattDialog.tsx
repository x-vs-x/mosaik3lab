import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from './ui';

/**
 * Fenster mit eigenem Kopf und Fuß: auf dem Handy von unten (Bottom-Sheet), ab Tablet in der Mitte.
 * Natives <dialog> wie `Dialog`: Fokusfalle, Escape, inerter Hintergrund. Kopf und Fuß bleiben stehen, nur der Inhalt
 * scrollt. Den Fokus beim Öffnen setzt `ersterFokus`; nach dem Schließen setzt ihn der Aufrufer zurück (er weiß, wohin).
 */
export function BlattDialog({
  open,
  onClose,
  labelledBy,
  kopf,
  fuss,
  children,
  breite = 'lg',
  ersterFokus,
}: {
  open: boolean;
  onClose: () => void;
  /** ID der Überschrift im Kopf. */
  labelledBy: string;
  kopf: ReactNode;
  fuss?: ReactNode;
  children: ReactNode;
  breite?: 'sm' | 'md' | 'lg';
  /** Element, das beim Öffnen den Fokus bekommt (sonst das erste Bedienelement). */
  ersterFokus?: () => HTMLElement | null | undefined;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const offen = useRef(open);
  const fokus = useRef(ersterFokus);
  fokus.current = ersterFokus;

  useEffect(() => {
    offen.current = open;
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      const ziel = fokus.current?.();
      if (ziel) ziel.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const abbrechen = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    // Schließt der Browser trotzdem (zweites Escape in Chrome), wie „Schließen“ behandeln – siehe Dialog.tsx.
    const geschlossen = () => {
      if (offen.current) onClose();
    };
    el.addEventListener('cancel', abbrechen);
    el.addEventListener('close', geschlossen);
    return () => {
      el.removeEventListener('cancel', abbrechen);
      el.removeEventListener('close', geschlossen);
    };
  }, [onClose]);

  return (
    // Klick nur auf den Hintergrund (Maus/Touch); Tastatur schließt über Escape (natives „cancel“).
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onPointerDown={(e) => {
        pressedOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (e.target === ref.current && pressedOnBackdrop.current) onClose();
        pressedOnBackdrop.current = false;
      }}
      className={cx(
        'dialog mx-0 mb-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-visible bg-transparent p-0',
        'sm:m-auto sm:max-h-[88dvh] sm:w-[calc(100%-3rem)]',
        breite === 'sm' && 'sm:max-w-md',
        breite === 'md' && 'sm:max-w-2xl',
        breite === 'lg' && 'sm:max-w-3xl',
      )}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[88dvh] sm:rounded-3xl [@media(max-height:30rem)]:overflow-y-auto">
          <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-stone-300 sm:hidden" aria-hidden />
          <div className="shrink-0 border-b border-stone-200 px-[16px] pb-[10px] pt-[4px] sm:px-[24px] sm:pt-[16px]">{kopf}</div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[16px] py-[12px] sm:px-[24px] [@media(max-height:30rem)]:shrink-0 [@media(max-height:30rem)]:overflow-visible">
            {children}
          </div>
          {fuss && <div className="shrink-0 border-t border-stone-200 px-[16px] py-[10px] sm:px-[24px]">{fuss}</div>}
        </div>
      )}
    </dialog>
  );
}
