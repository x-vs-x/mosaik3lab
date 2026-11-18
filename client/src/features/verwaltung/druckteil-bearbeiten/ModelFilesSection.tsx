import { Download, FileBox, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { DateiLaden } from '../../../components/DateiLaden';
import { useToast } from '../../../components/Toast';
import { api, modelUrl, fehlerText } from '../../../lib/api';
import { formatBytes, formatDate } from '../../../lib/format';
import type { Item } from '../../../lib/types';
import { FilePicker, useUpload } from './FilePicker';
import { plural } from './itemForm';
import { AfterFirstSave, Section } from './Section';

/** Druckdateien (STL/3MF) – nur für Team und Administration, erst nach dem ersten Speichern. */
export function ModelFilesSection({ item, onChange }: { item?: Item; onChange: (i: Item) => void }) {
  return (
    <Section
      id="druckdateien"
      icon={FileBox}
      title="Druckdateien"
      summary={item ? plural(item.modelFiles.length, 'Datei', 'Dateien') : 'nach dem ersten Speichern'}
    >
      {item ? <ModelFilesEditor item={item} onChange={onChange} /> : <AfterFirstSave />}
    </Section>
  );
}

function ModelFilesEditor({ item, onChange }: { item: Item; onChange: (i: Item) => void }) {
  const { uploading, upload, status, abbrechen } = useUpload(item, 'models', onChange);
  const toast = useToast();

  const [busyId, setBusyId] = useState<string>();

  const remove = async (modelId: string, name: string) => {
    if (busyId || !window.confirm(`Druckdatei „${name}“ wirklich löschen?`)) return;
    setBusyId(modelId);
    try {
      onChange(await api<Item>(`/items/${item.id}/models/${modelId}`, { method: 'DELETE' }));
    } catch (err) {
      toast('error', fehlerText(err, 'Löschen fehlgeschlagen.'));
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <div>
      <p className="mb-4 text-hinweis text-stone-600">
        Nur für das 3D-Druck-Team und die Administration sichtbar. Dateien werden nur gespeichert und zum Download angeboten.
      </p>
      {item.modelFiles.length > 0 && (
        <ul className="mb-4 divide-y divide-stone-100 rounded-2xl ring-1 ring-stone-200">
          {item.modelFiles.map((m) => (
            <li key={m.id} className="flex items-center gap-3 p-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-[0.75rem] font-bold uppercase text-stone-700">
                {m.format}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-all font-bold text-stone-900">{m.originalName}</p>
                <p className="text-hinweis text-stone-500">
                  {formatBytes(m.sizeBytes)} · {formatDate(m.uploadedAt)}
                </p>
              </div>
              {/* Per fetch statt Link: auf dem iPad (Web-App) führte der Link in eine Dateivorschau ohne Rückweg. */}
              <DateiLaden
                pfad={modelUrl(item.id, m.id)}
                ersatzname={m.originalName}
                titel={m.originalName}
                icon={Download}
                className="grid size-11 shrink-0 place-items-center rounded-xl text-stone-700 hover:bg-stone-100 disabled:opacity-60"
                aria-label={`${m.originalName} herunterladen`}
              />
              <button
                type="button"
                onClick={() => remove(m.id, m.originalName)}
                disabled={busyId === m.id}
                className="grid size-11 place-items-center rounded-xl text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                aria-label={`${m.originalName} löschen`}
              >
                <Trash2 className="size-5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <FilePicker
        accept=".stl,.3mf"
        label="STL / 3MF auswählen"
        hint="STL oder 3MF · max. 50 MB pro Datei · max. 10 Dateien"
        uploading={uploading}
        status={status}
        onFiles={upload}
        onAbbrechen={abbrechen}
        icon={FileBox}
      />
    </div>
  );
}
