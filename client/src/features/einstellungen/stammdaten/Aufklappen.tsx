import { ChevronDown } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

/** Selten gebrauchte Felder einer Zeile: zugeklappt, bei neuen Einträgen oder Fehlern offen. */
export function Aufklappen({ label, open: forceOpen, children }: { label: string; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!forceOpen);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group">
      <summary className="inline-flex min-h-tipp cursor-pointer list-none items-center gap-1.5 py-1 rounded-xl px-2 font-bold text-brand-700 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-5 shrink-0 self-start mt-0.5 transition-transform group-open:rotate-180" aria-hidden />
        {label}
      </summary>
      <div className="mt-3 space-y-4">{children}</div>
    </details>
  );
}
