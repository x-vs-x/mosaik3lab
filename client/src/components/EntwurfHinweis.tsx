import { Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './ui';

const uhrzeit = new Intl.DateTimeFormat('de-DE', { timeStyle: 'short' });
const datumUhrzeit = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

function wann(savedAt: number) {
  const d = new Date(savedAt);
  return d.toDateString() === new Date().toDateString() ? `${uhrzeit.format(d)} Uhr` : datumUhrzeit.format(d);
}

/** Hinweis-Leiste nach dem Wiederherstellen eines Formular-Entwurfs (siehe lib/useEntwurf.ts). */
export function EntwurfHinweis({ savedAt, onDiscard, children }: { savedAt: number; onDiscard: () => void; children?: ReactNode }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="text-base">
        <p className="font-bold">Entwurf von {wann(savedAt)} wiederhergestellt</p>
        {children && <p className="mt-0.5">{children}</p>}
      </div>
      <Button variant="secondary" icon={Undo2} onClick={onDiscard} className="shrink-0">
        Verwerfen
      </Button>
    </div>
  );
}
