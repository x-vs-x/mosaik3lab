import { RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, onAbgelehnt } from '../lib/api';
import { APP_VERSION } from '../lib/version';
import { andereVersion, versionPruefungFaellig } from '../lib/versionPruefung';
import { Button } from './ui';

/**
 * „Mosaik³LAB wurde aktualisiert – Seite neu laden“: erscheint, wenn der Server eine andere Version meldet als diese
 * geladene Seite (alter Tab nach einem Update). Geprüft wird, wenn der Tab wieder sichtbar wird und wenn der Server eine
 * Eingabe ablehnt (genau dann fällt ein alter Tab auf), höchstens einmal je Minute. Fest am oberen Rand, damit man den
 * Hinweis auch unten im Formular neben „Speichern“ sieht.
 */
export function VersionsHinweis() {
  const [veraltet, setVeraltet] = useState(false);

  useEffect(() => {
    let zuletzt = 0;
    let aktiv = true;
    const pruefe = () => {
      if (!versionPruefungFaellig(zuletzt)) return;
      zuletzt = Date.now();
      api<{ version?: string }>('/health', { silent401: true, timeoutMs: 8000 })
        .then((antwort) => {
          if (aktiv && andereVersion(APP_VERSION, antwort?.version)) setVeraltet(true);
        })
        .catch(() => {
          /* Server gerade nicht erreichbar: kein Hinweis – die Seite zeigt ihren eigenen Fehler. */
        });
    };
    const sichtbar = () => {
      if (document.visibilityState === 'visible') pruefe();
    };
    document.addEventListener('visibilitychange', sichtbar);
    onAbgelehnt(pruefe);
    return () => {
      aktiv = false;
      document.removeEventListener('visibilitychange', sichtbar);
      onAbgelehnt(undefined);
    };
  }, []);

  if (!veraltet) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div role="alert" className="toast-in pointer-events-auto flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-lg sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="font-bold">Mosaik³LAB wurde aktualisiert</p>
          <p className="text-hinweis">
            Diese Seite ist noch vom alten Stand – Speichern kann deshalb fehlschlagen. Bitte laden Sie die Seite neu.
          </p>
        </div>
        <Button icon={RotateCw} className="shrink-0" onClick={() => window.location.reload()}>
          Seite neu laden
        </Button>
      </div>
    </div>
  );
}
