import { Settings } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ColorSwatch } from '../../components/ColorSwatch';
import { useToast } from '../../components/Toast';
import { Alert, Badge, Card, cx, LinkButton, PageHeader, Spinner, Switch } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useConfig, useMasterData } from '../../lib/config';
import { ohneVorraetigeFarbe } from '../../lib/colors';
import type { Filament, Item, MasterData } from '../../lib/types';
import { useApi, useDocumentTitle } from '../../lib/useApi';

type View = 'alle' | 'leer';

/** Druckraum: Farbrollen schnell als leer/vorrätig markieren – auch am Handy. */
export function FilamentsPage() {
  useDocumentTitle('Farbrollen');
  const { can } = useAuth();
  const { config, error: configError, reload } = useConfig();
  const md = useMasterData();
  const toast = useToast();
  const { data: items } = useApi<Item[]>('/items?all=1');
  const [view, setView] = useState<View>('alle');
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const empty = md.filaments.filter((f) => !f.available);
  const shown = view === 'leer' ? empty : md.filaments;

  // Nach Produktlinie gruppiert, damit man die Rollen im Regal schnell wiederfindet.
  const groups = useMemo(() => {
    const map = new Map<string, Filament[]>();
    for (const f of shown) {
      const key = [f.brand, f.line].filter(Boolean).join(' ') || 'Weitere';
      map.set(key, [...(map.get(key) ?? []), f]);
    }
    return [...map.entries()];
  }, [shown]);

  const usage = (id: string) => items?.filter((i) => i.colors.includes(id)).length ?? 0;
  const withoutColor = (items ?? []).filter((i) => i.published && ohneVorraetigeFarbe(i, md));

  const toggle = async (f: Filament, available: boolean) => {
    setBusy(f.id);
    setError(undefined);
    try {
      await api<MasterData>(`/filaments/${encodeURIComponent(f.id)}/availability`, { method: 'PATCH', body: { available } });
      await reload();
      toast('success', `${f.colorName} ist jetzt ${available ? 'vorrätig' : 'als leer markiert'}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Verwaltung"
        title="Farbrollen"
        shortDescription="Leere Rollen ausschalten."
        description="Leere Rollen ausschalten – die Farbe wird dann bei keinem Druckteil mehr angeboten. Wieder einschalten, sobald Nachschub da ist."
        actions={
          can('masterdata:manage') && (
            <LinkButton to="/verwaltung/stammdaten?liste=filaments" variant="secondary" icon={Settings}>
              Farbrollen bearbeiten
            </LinkButton>
          )
        }
      />

      {configError && !config && <Alert kind="error">{configError}</Alert>}
      {!config && !configError && <Spinner />}
      {error && (
        <Alert kind="error" className="mb-5">
          {error}
        </Alert>
      )}

      {config && (
        <>
          {withoutColor.length > 0 && (
            <Alert kind="warning" className="mb-5" title="Ohne vorrätige Farbe">
              Diese veröffentlichten Druckteile können gerade nicht angefragt werden: {withoutColor.map((i) => i.name).join(', ')}.
            </Alert>
          )}

          <div role="group" aria-label="Anzeige" className="mb-5 flex flex-wrap gap-2">
            {(
              [
                ['alle', `Alle (${md.filaments.length})`],
                ['leer', `Leer (${empty.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={cx(
                  'inline-flex min-h-12 items-center rounded-2xl px-4 font-bold transition-colors',
                  view === key ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 ring-1 ring-inset ring-stone-300 hover:bg-stone-50',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <Card className="px-6 py-8 text-center text-stone-600">
              {view === 'leer' ? 'Keine Rolle ist als leer markiert.' : 'Noch keine Farbrollen angelegt.'}
            </Card>
          ) : (
            <div className="space-y-4 sm:space-y-6">
              {groups.map(([group, list]) => (
                <Card as="section" key={group} className="p-4 sm:p-6">
                  <h2 className="mb-3 text-abschnitt font-bold text-stone-900">{group}</h2>
                  <ul className="divide-y divide-stone-100">
                    {list.map((f) => {
                      const n = usage(f.id);
                      return (
                        <li key={f.id} className="flex items-center gap-3 py-3 sm:gap-4">
                          <ColorSwatch hex={f.hex} className={cx('size-8 shrink-0 sm:size-10', !f.available && 'opacity-40')} />
                          <div className="min-w-0 flex-1">
                            <Switch
                              checked={f.available}
                              disabled={busy === f.id}
                              onChange={(v) => void toggle(f, v)}
                              label={f.colorName}
                              description={`${f.herstellerNummer ? `Nr. ${f.herstellerNummer} · ` : ''}${f.available ? 'Vorrätig' : 'Leer – wird nicht angeboten'}${items ? ` · in ${n} ${n === 1 ? 'Druckteil' : 'Druckteilen'}` : ''}`}
                            />
                          </div>
                          {!f.available && <Badge className="hidden bg-rose-50 text-rose-800 ring-rose-200 sm:inline-flex">Leer</Badge>}
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
