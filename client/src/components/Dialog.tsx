import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cx } from './ui';

/**
 * Modaler Dialog auf Basis des nativen <dialog>-Elements:
 * Fokusfalle, Escape zum Schließen und inertes Hintergrund-Layout inklusive.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener('cancel', handle);
    return () => el.removeEventListener('cancel', handle);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // Klick auf den Hintergrund
      }}
      className={cx(
        'dialog m-auto max-h-[94dvh] w-[calc(100%-1rem)] overflow-visible rounded-2xl bg-transparent p-0 sm:max-h-[92dvh] sm:w-[calc(100%-1.5rem)] sm:rounded-3xl',
        size === 'sm' && 'max-w-md',
        size === 'md' && 'max-w-xl',
        size === 'lg' && 'max-w-2xl',
      )}
    >
      {open && (
        <div className="flex max-h-[94dvh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[92dvh] sm:rounded-3xl">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-100 px-4 pb-3 pt-4 sm:gap-4 sm:px-6 sm:pb-4 sm:pt-6">
            <div className="min-w-0 break-words">
              <h2 id={titleId} className="text-lg font-bold text-stone-900 sm:text-xl">
                {title}
              </h2>
              {description && <div className="mt-0.5 text-stone-600 sm:mt-1">{description}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-xl text-stone-500 hover:bg-stone-100 hover:text-stone-900"
              aria-label="Dialog schließen"
            >
              <X className="size-5 sm:size-6" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-6">{children}</div>
        </div>
      )}
    </dialog>
  );
}
