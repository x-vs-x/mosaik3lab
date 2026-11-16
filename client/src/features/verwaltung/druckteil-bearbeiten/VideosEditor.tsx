import { Link2, Trash2, Upload, Video } from 'lucide-react';
import { useId, useState } from 'react';
import { useToast } from '../../../components/Toast';
import { Button, Field, Input } from '../../../components/ui';
import { api, ApiError, videoUrl } from '../../../lib/api';
import { formatBytes, formatDate } from '../../../lib/format';
import type { Item } from '../../../lib/types';
import { FilePicker } from './FilePicker';
import { MAX_VIDEOS } from './itemForm';

/** Videos: Datei hochladen (MP4/WebM, ohne Autoplay angezeigt) oder Link hinterlegen. */
export function VideosEditor({ item, onChange }: { item: Item; onChange: (i: Item) => void }) {
  const toast = useToast();
  const uid = useId();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState<string>();
  const videos = item.videos ?? [];
  const full = videos.length >= MAX_VIDEOS;

  const run = async (action: () => Promise<Item>, success: string) => {
    setBusy(true);
    try {
      onChange(await action());
      toast('success', success);
      setTitle('');
      setUrl('');
      setLinkError(undefined);
      return true;
    } catch (err) {
      const message = err instanceof ApiError ? (err.fields.url ?? err.message) : 'Speichern fehlgeschlagen.';
      toast('error', message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const uploadFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('file', file);
    run(() => api<Item>(`/items/${item.id}/videos`, { method: 'POST', form: fd }), 'Video hochgeladen.');
  };

  const addLink = () => {
    if (!/^https?:\/\/\S+$/i.test(url.trim())) {
      setLinkError('Bitte einen vollständigen Link angeben, z. B. https://…');
      return;
    }
    run(() => api<Item>(`/items/${item.id}/videos/link`, { method: 'POST', body: { title: title.trim(), url: url.trim() } }), 'Link gespeichert.');
  };

  const remove = (videoId: string, name: string) => {
    if (busy || !window.confirm(`Video „${name}“ wirklich entfernen?`)) return;
    void run(() => api<Item>(`/items/${item.id}/videos/${videoId}`, { method: 'DELETE' }), 'Video entfernt.');
  };

  return (
    <div className="border-t border-stone-100 pt-5">
      <h3 className="flex items-center gap-2 text-abschnitt font-bold text-stone-900">
        <Video className="size-5 text-stone-600" aria-hidden />
        Videos
      </h3>
      <p className="mb-4 mt-1 text-hinweis text-stone-600">
        Zeigen, was man mit dem Druckteil machen kann. Videos starten nie automatisch.
      </p>
      {videos.length > 0 && (
        <ul className="mb-4 space-y-3">
          {videos.map((v) => (
            <li key={v.id} className="flex flex-col gap-3 rounded-2xl p-3 ring-1 ring-stone-200 sm:flex-row sm:items-center">
              {v.file ? (
                <video controls preload="metadata" playsInline className="aspect-video w-full rounded-xl bg-stone-900 sm:w-56">
                  <source src={videoUrl(v.file)} type={v.file.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
                </video>
              ) : (
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-700">
                  <Link2 className="size-5" aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="break-all font-bold text-stone-900">{v.title}</p>
                <p className="break-all text-hinweis text-stone-600">
                  {v.file ? `${formatBytes(v.sizeBytes)} · ${formatDate(v.uploadedAt)}` : v.url}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(v.id, v.title)}
                disabled={busy}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                aria-label={`Video „${v.title}“ entfernen`}
              >
                <Trash2 className="size-5" aria-hidden />
                <span className="sm:sr-only">Entfernen</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {full ? (
        <p className="text-hinweis text-stone-600">Höchstens {MAX_VIDEOS} Videos pro Druckteil.</p>
      ) : (
        <div className="space-y-4">
          <Field label="Titel des Videos" hint="Optional – gilt für das nächste Video bzw. den nächsten Link.">
            {({ id, describedBy }) => (
              <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} aria-describedby={describedBy} placeholder="z. B. So wird der Griff aufgesteckt" />
            )}
          </Field>
          <FilePicker
            accept=".mp4,.m4v,.webm,video/mp4,video/webm"
            label="Video hochladen"
            hint="MP4 oder WebM · max. 50 MB · ein Video pro Upload"
            uploading={busy}
            onFiles={uploadFile}
            icon={Upload}
            multiple={false}
          />
          <div>
            <label htmlFor={`${uid}-url`} className="mb-1.5 block font-bold text-stone-800">
              … oder Link zu einem Video
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id={`${uid}-url`}
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  // Enter soll nicht das ganze Druckteil speichern.
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addLink();
                  }
                }}
                maxLength={500}
                placeholder="https://…"
                invalid={!!linkError}
                aria-describedby={linkError ? `${uid}-url-error` : undefined}
                className="flex-1"
              />
              <Button variant="soft" icon={Link2} onClick={addLink} disabled={busy || !url.trim()}>
                Link hinzufügen
              </Button>
            </div>
            {linkError && (
              <p id={`${uid}-url-error`} className="mt-1.5 text-hinweis font-bold text-rose-700">
                {linkError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
