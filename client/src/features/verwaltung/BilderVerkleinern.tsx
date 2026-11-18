import { ImageDown } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Alert, Button } from '../../components/ui';
import { api, imageUrl } from '../../lib/api';
import { bildVerkleinern } from '../../lib/bildVerkleinern';
import { formatBytes, plural } from '../../lib/format';
import type { Item } from '../../lib/types';

/** Ersetzt werden nur Bilder, die dadurch mindestens 20 % kleiner werden. */
const MINDEST_ERSPARNIS = 0.2;

interface Stand {
  fertig: number;
  gesamt: number;
  vorher: number;
  nachher: number;
  ersetzt: number;
  fehler: number;
}

/**
 * Einmalig: alle vorhandenen Druckteil-Bilder im Browser verkleinern (wie beim Hochladen) und auf dem Server ersetzen.
 * Nacheinander, damit Handy und Server nicht überlastet werden.
 */
export function BilderVerkleinernDialog({ items, open, onClose, onDone }: { items: Item[]; open: boolean; onClose: () => void; onDone: () => void }) {
  const [stand, setStand] = useState<Stand>();
  const [laeuft, setLaeuft] = useState(false);
  const bilder = items.flatMap((item) => item.images.map((file) => ({ item, file })));

  const schliessen = () => {
    if (laeuft) return;
    const geaendert = !!stand?.ersetzt;
    setStand(undefined);
    onClose();
    if (geaendert) onDone();
  };

  const starte = async () => {
    setLaeuft(true);
    const s: Stand = { fertig: 0, gesamt: bilder.length, vorher: 0, nachher: 0, ersetzt: 0, fehler: 0 };
    setStand({ ...s });
    for (const { item, file } of bilder) {
      try {
        const res = await fetch(imageUrl(file), { credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok || res.headers.get('x-datei-fehlt')) throw new Error('Bild nicht ladbar');
        const blob = await res.blob();
        const original = new File([blob], file, { type: blob.type });
        s.vorher += original.size;
        const klein = await bildVerkleinern(original, MINDEST_ERSPARNIS);
        if (klein !== original) {
          const fd = new FormData();
          fd.append('file', klein);
          await api<Item>(`/items/${item.id}/images/${encodeURIComponent(file)}`, { method: 'PUT', form: fd });
          s.ersetzt++;
        }
        s.nachher += klein.size;
      } catch {
        s.fehler++;
      }
      s.fertig++;
      setStand({ ...s });
    }
    setLaeuft(false);
  };

  const ende = stand && !laeuft;
  return (
    <Dialog
      open={open}
      onClose={schliessen}
      title="Vorhandene Bilder verkleinern"
      description="Große Bilder werden auf höchstens 2000 Pixel verkleinert. Das spart Speicherplatz, macht Exporte kleiner und den Katalog auf dem Handy schneller."
    >
      <div className="space-y-4">
        {!stand && (
          <>
            <p className="text-stone-700">
              {plural(bilder.length, 'Bild', 'Bilder')} in {plural(items.filter((i) => i.images.length > 0).length, 'Druckteil', 'Druckteilen')}. Ersetzt wird ein Bild nur, wenn es dadurch deutlich
              kleiner wird; Reihenfolge und Titelbild bleiben gleich. Das kann einige Minuten dauern – bitte diese Seite so lange geöffnet lassen.
            </p>
            <Alert kind="info">Tipp: Vorher ein Backup machen. Die ursprünglichen Bilder werden ersetzt.</Alert>
          </>
        )}
        {stand && (
          <div aria-live="polite">
            <label htmlFor="bilder-fortschritt" className="font-bold text-stone-800">
              {laeuft ? `Bild ${Math.min(stand.fertig + 1, stand.gesamt)} von ${stand.gesamt} …` : 'Fertig'}
            </label>
            <progress id="bilder-fortschritt" className="mt-2 h-3 w-full accent-brand-600" max={stand.gesamt || 1} value={stand.fertig} />
          </div>
        )}
        {ende && (
          <Alert kind={stand.fehler ? 'warning' : 'info'}>
            {plural(stand.gesamt, 'Bild', 'Bilder')}, {formatBytes(stand.vorher)} → {formatBytes(stand.nachher)}. {plural(stand.ersetzt, 'Bild', 'Bilder')} verkleinert.
            {stand.fehler > 0 && ` ${plural(stand.fehler, 'Bild konnte', 'Bilder konnten')} nicht bearbeitet werden und ${stand.fehler === 1 ? 'bleibt' : 'bleiben'} unverändert.`}
          </Alert>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {!laeuft && (
            <Button variant="secondary" onClick={schliessen}>
              {ende ? 'Schließen' : 'Abbrechen'}
            </Button>
          )}
          {!ende && (
            <Button icon={ImageDown} onClick={() => void starte()} loading={laeuft} disabled={bilder.length === 0}>
              {laeuft ? 'Wird verkleinert …' : 'Jetzt verkleinern'}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
