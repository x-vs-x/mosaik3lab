import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(kind: ToastKind, message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, kind, message }]);
      // Fehler bleiben, bis man sie schließt – wer langsam liest oder gerade anders beschäftigt ist, verpasst sie sonst.
      if (kind === 'success') setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-8"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`toast-in pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border bg-white p-4 shadow-lg ${
              t.kind === 'error' ? 'border-rose-200' : 'border-emerald-200'
            }`}
          >
            {t.kind === 'error' ? (
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden />
            ) : (
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
            )}
            <p className="flex-1 text-base text-stone-800">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              // Tippfläche 41 px wie beim Dialog-Schließen; negative Ränder halten die Meldung so kompakt wie bisher
              className="-my-2.5 -mr-2.5 grid size-tipp shrink-0 place-items-center rounded-xl text-stone-500 hover:bg-stone-100 hover:text-stone-800"
              aria-label="Meldung schließen"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
