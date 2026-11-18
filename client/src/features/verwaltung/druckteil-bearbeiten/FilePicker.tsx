import { LoaderCircle, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useToast } from '../../../components/Toast';
import { Button, buttonClass, cx } from '../../../components/ui';
import { apiUpload, ApiError, UPLOAD_ABGEBROCHEN } from '../../../lib/api';
import { bilderVerkleinern } from '../../../lib/bildVerkleinern';
import type { Item } from '../../../lib/types';

/** Fortschritt beim Hochladen: erst die Übertragung, danach – bei Bildern – das Erzeugen der Vorschaubilder auf dem Server. */
export function uploadStatus(kind: 'images' | 'models', anteil: number | null) {
  if (anteil === null) return '';
  if (anteil < 1) return `Wird hochgeladen … ${Math.round(anteil * 100)} %`;
  return kind === 'images' ? 'Vorschau wird erzeugt … bitte warten' : 'Wird gespeichert … bitte warten';
}

/** Mehrere Bilder oder Druckdateien auf einmal hochladen; liefert das aktualisierte Druckteil. */
export function useUpload(item: Item, kind: 'images' | 'models', onChange: (i: Item) => void) {
  const [uploading, setUploading] = useState(false);
  const [anteil, setAnteil] = useState<number | null>(null);
  const toast = useToast();
  const laufend = useRef<AbortController | undefined>(undefined);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const count = files.length; // FileList ist „live“ und nach dem Leeren des Felds (onChange) leer
    const liste = Array.from(files);
    setUploading(true);
    setAnteil(0);
    const ctrl = new AbortController();
    laufend.current = ctrl;
    try {
      // Bilder vorher im Browser verkleinern (kleinere Ablage und Exporte, schneller auf dem Handy)
      const fd = new FormData();
      (kind === 'images' ? await bilderVerkleinern(liste) : liste).forEach((f) => fd.append('files', f));
      // Erst wenn der Server fertig ist (bei Bildern: Vorschaubilder erzeugt), erscheint das Bild in der Liste.
      onChange(await apiUpload<Item>(`/items/${item.id}/${kind}`, fd, setAnteil, { signal: ctrl.signal }));
      toast('success', count === 1 ? 'Datei hochgeladen.' : `${count} Dateien hochgeladen.`);
    } catch (err) {
      // Selbst abgebrochen: keine Fehlermeldung.
      if (!(err instanceof ApiError && err.message === UPLOAD_ABGEBROCHEN)) toast('error', err instanceof ApiError ? err.message : 'Upload fehlgeschlagen.');
    } finally {
      laufend.current = undefined;
      setUploading(false);
      setAnteil(null);
    }
  };
  return { uploading, upload, status: uploadStatus(kind, anteil), abbrechen: () => laufend.current?.abort() };
}

/** Dateiauswahl per Knopf oder Drag & Drop. */
export function FilePicker({
  accept,
  label,
  hint,
  uploading,
  onFiles,
  icon: Icon,
  multiple = true,
  status = '',
  onAbbrechen,
}: {
  accept: string;
  label: string;
  hint: string;
  uploading: boolean;
  onFiles: (f: FileList | null) => void;
  icon: typeof Upload;
  multiple?: boolean;
  /** Fortschritt („Wird hochgeladen … 40 %“, „Vorschau wird erzeugt … bitte warten“). */
  status?: string;
  /** Während des Hochladens: Knopf „Abbrechen“. */
  onAbbrechen?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!uploading) onFiles(e.dataTransfer.files);
      }}
      className={cx(
        'rounded-2xl border-2 border-dashed p-5 text-center transition-colors',
        dragging ? 'border-brand-500 bg-brand-50' : 'border-stone-300 bg-stone-50/60',
      )}
    >
      <input
        ref={ref}
        type="file"
        multiple={multiple}
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <button type="button" onClick={() => ref.current?.click()} className={buttonClass('soft', 'md')} disabled={uploading}>
        <Icon className="size-5" aria-hidden />
        {uploading ? 'Wird hochgeladen …' : label}
      </button>
      {/* immer vorhanden, damit Bildschirmleser die Änderungen ansagen */}
      <p role="status" aria-live="polite" className={cx('text-center font-bold text-balance text-stone-800', status && 'mt-3')}>
        {status && <LoaderCircle className="mr-2 inline size-5 animate-spin align-[-4px] text-brand-700 motion-reduce:animate-none" aria-hidden />}
        {status}
      </p>
      {uploading && onAbbrechen && (
        <Button variant="secondary" icon={X} className="mt-3" onClick={onAbbrechen}>
          Abbrechen
        </Button>
      )}
      <p className="mt-2 text-hinweis text-stone-600">{hint}</p>
    </div>
  );
}
