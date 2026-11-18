import { ImagePlus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ItemImage } from '../../../components/ItemImage';
import { useToast } from '../../../components/Toast';
import { api, ApiError } from '../../../lib/api';
import type { Item } from '../../../lib/types';
import { FilePicker, useUpload } from './FilePicker';
import { plural } from './itemForm';
import { AfterFirstSave, Section } from './Section';
import { VideosEditor } from './VideosEditor';

/** Bilder & Videos – erst nach dem ersten Speichern möglich. */
export function MediaSection({ item, onChange }: { item?: Item; onChange: (i: Item) => void }) {
  return (
    <Section
      id="medien"
      icon={ImagePlus}
      title="Bilder & Videos"
      summary={item ? `${plural(item.images.length, 'Bild', 'Bilder')} · ${plural(item.videos?.length ?? 0, 'Video', 'Videos')}` : 'nach dem ersten Speichern'}
      defaultOpen={!!item && item.images.length === 0}
    >
      {item ? (
        <>
          <ImagesEditor item={item} onChange={onChange} />
          <VideosEditor item={item} onChange={onChange} />
        </>
      ) : (
        <AfterFirstSave />
      )}
    </Section>
  );
}

function ImagesEditor({ item, onChange }: { item: Item; onChange: (i: Item) => void }) {
  const { uploading, upload } = useUpload(item, 'images', onChange);
  const toast = useToast();

  const [busyFile, setBusyFile] = useState<string>();

  const remove = async (file: string, nr: number) => {
    if (busyFile || !window.confirm(`Bild ${nr} wirklich löschen?`)) return;
    setBusyFile(file);
    try {
      onChange(await api<Item>(`/items/${item.id}/images/${file}`, { method: 'DELETE' }));
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Löschen fehlgeschlagen.');
    } finally {
      setBusyFile(undefined);
    }
  };

  const makeCover = async (file: string) => {
    const images = [file, ...item.images.filter((f) => f !== file)];
    try {
      onChange(await api<Item>(`/items/${item.id}/images/order`, { method: 'PUT', body: { images } }));
      toast('success', 'Titelbild geändert.');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  return (
    <div>
      <h3 className="text-abschnitt font-bold text-stone-900">Bilder</h3>
      <p className="mb-4 mt-1 text-hinweis text-stone-600">Das erste Bild ist das Titelbild im Katalog.</p>
      {item.images.length > 0 && (
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {item.images.map((file, i) => (
            <li key={file} className="overflow-hidden rounded-2xl ring-1 ring-stone-200">
              <div className="relative aspect-[4/3]">
                <ItemImage item={item} index={i} />
                {i === 0 && (
                  <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2.5 py-1 text-hinweis font-bold text-stone-800">
                    Titelbild
                  </span>
                )}
              </div>
              <div className="flex">
                {i !== 0 && (
                  <button
                    type="button"
                    onClick={() => makeCover(file)}
                    className="flex min-h-11 flex-1 items-center justify-center gap-1.5 text-hinweis font-bold text-stone-700 hover:bg-stone-50"
                    aria-label={`Bild ${i + 1} als Titelbild verwenden`}
                  >
                    <Star className="size-4" aria-hidden /> Titelbild
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(file, i + 1)}
                  disabled={busyFile === file}
                  className="flex min-h-11 flex-1 items-center justify-center gap-1.5 text-hinweis font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  aria-label={`Bild ${i + 1} löschen`}
                >
                  <Trash2 className="size-4" aria-hidden /> Löschen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <FilePicker
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        label="Bilder auswählen"
        hint="JPG, PNG oder WebP · große Bilder werden automatisch verkleinert · max. 8 Bilder · auch per Drag & Drop"
        uploading={uploading}
        onFiles={upload}
        icon={ImagePlus}
      />
    </div>
  );
}
