import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useToast } from '../../../components/Toast';
import { buttonClass, cx } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import type { Item } from '../../../lib/types';

/** Mehrere Bilder oder Druckdateien auf einmal hochladen; liefert das aktualisierte Druckteil. */
export function useUpload(item: Item, kind: 'images' | 'models', onChange: (i: Item) => void) {
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const count = files.length; // FileList ist „live“ und nach dem Leeren des Felds (onChange) leer
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('files', f));
    setUploading(true);
    try {
      onChange(await api<Item>(`/items/${item.id}/${kind}`, { method: 'POST', form: fd }));
      toast('success', count === 1 ? 'Datei hochgeladen.' : `${count} Dateien hochgeladen.`);
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Upload fehlgeschlagen.');
    } finally {
      setUploading(false);
    }
  };
  return { uploading, upload };
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
}: {
  accept: string;
  label: string;
  hint: string;
  uploading: boolean;
  onFiles: (f: FileList | null) => void;
  icon: typeof Upload;
  multiple?: boolean;
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
        onFiles(e.dataTransfer.files);
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
      <p className="mt-2 text-[0.85rem] text-stone-600">{hint}</p>
    </div>
  );
}
