import { Plus, Search, Shapes, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { ItemImage } from '../../../components/ItemImage';
import { useToast } from '../../../components/Toast';
import { Field, Input, Button } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import type { AehnlichesTeil, Item } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { passtZurSuche } from '@mosaik3lab/shared/suche';
import { plural } from './itemForm';
import { Section } from './Section';

const MAX_TREFFER = 8;

/** Ähnliche Druckteile: gegenseitige Verknüpfung, wird sofort gespeichert (eigener Endpunkt, nicht mit dem Formular). */
export function AehnlicheSection({ item }: { item?: Item }) {
  const { data: liste, setData } = useApi<AehnlichesTeil[]>(item ? `/items/${item.id}/aehnliche` : null);
  const verknuepft = liste ?? [];
  return (
    <Section
      id="aehnliche"
      icon={Shapes}
      title="Ähnliche Druckteile"
      summary={!item ? 'nach dem ersten Speichern' : verknuepft.length ? `${plural(verknuepft.length, 'Druckteil', 'Druckteile')}: ${verknuepft.slice(0, 3).map((t) => t.name).join(', ')}${verknuepft.length > 3 ? ' …' : ''}` : 'Keine'}
    >
      {item ? (
        <AehnlicheEditor item={item} verknuepft={verknuepft} onChange={setData} />
      ) : (
        <p className="rounded-xl bg-stone-50 px-4 py-3 text-stone-700 ring-1 ring-stone-200">
          Nach dem ersten Speichern („Druckteil anlegen“) können Sie hier ähnliche Druckteile verknüpfen.
        </p>
      )}
    </Section>
  );
}

function AehnlicheEditor({ item, verknuepft, onChange }: { item: Item; verknuepft: AehnlichesTeil[]; onChange: (l: AehnlichesTeil[]) => void }) {
  const toast = useToast();
  const [suche, setSuche] = useState('');
  const [busy, setBusy] = useState<string>();
  const sucheRef = useRef<HTMLInputElement>(null);
  // Alle Druckteile erst laden, wenn gesucht wird (für die Schule genügt die Suche im Browser).
  const { data: alle, loading } = useApi<Item[]>(suche.trim() ? '/items?all=1' : null);
  const treffer = (alle ?? [])
    .filter((i) => i.id !== item.id && !verknuepft.some((v) => v.id === i.id))
    .filter((i) => passtZurSuche([i.name, i.number], suche));

  const aendern = async (id: string, fn: () => Promise<AehnlichesTeil[]>, fehler: string) => {
    if (busy) return;
    setBusy(id);
    try {
      onChange(await fn());
      // Der geklickte Knopf verschwindet – Fokus zurück ins Suchfeld (Tastatur).
      setSuche('');
      sucheRef.current?.focus();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : fehler);
    } finally {
      setBusy(undefined);
    }
  };
  const hinzufuegen = (t: Item) =>
    aendern(t.id, () => api<AehnlichesTeil[]>(`/items/${item.id}/aehnliche`, { method: 'POST', body: { id: t.id } }), 'Verknüpfen fehlgeschlagen.');
  const entfernen = (t: AehnlichesTeil) =>
    aendern(t.id, () => api<AehnlichesTeil[]>(`/items/${item.id}/aehnliche/${t.id}`, { method: 'DELETE' }), 'Entfernen fehlgeschlagen.');

  return (
    <div className="space-y-5">
      <p className="text-hinweis text-stone-600">
        Ähnliche Druckteile erscheinen ganz unten auf der Seite des Druckteils als kleine Karten – und umgekehrt auch dort.
        Änderungen werden sofort gespeichert. Nicht veröffentlichte Teile sehen nur das Druck-Team.
      </p>

      {verknuepft.length > 0 && (
        <ul className="space-y-2" aria-label="Verknüpfte Druckteile">
          {verknuepft.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-2xl p-2 ring-1 ring-stone-200">
              <Vorschau name={t.name} category={t.category} images={t.image ? [t.image] : []} />
              <Name name={t.name} entwurf={!t.published} />
              <Button variant="secondary" icon={Trash2} loading={busy === t.id} onClick={() => entfernen(t)} aria-label={`„${t.name}“ entfernen`} className="min-h-[44px] min-w-[44px] text-rose-700">
                <span className="hidden sm:inline">Entfernen</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Field label="Druckteil hinzufügen" hint="Nach Name oder Nummer suchen, z. B. „Griff“ oder „ART-0042“.">
        {({ id, describedBy }) => (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-stone-500" aria-hidden />
            <Input
              ref={sucheRef}
              id={id}
              type="search"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              // Enter soll nicht das ganze Formular absenden.
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              aria-describedby={describedBy}
              autoComplete="off"
              className="pl-11"
              placeholder="Name oder Nummer"
            />
          </div>
        )}
      </Field>

      {suche.trim() && (
        <div aria-live="polite">
          {loading && !alle ? (
            <p className="text-hinweis text-stone-600">Suche …</p>
          ) : treffer.length === 0 ? (
            <p className="text-hinweis text-stone-600">Kein passendes Druckteil gefunden.</p>
          ) : (
            <ul className="space-y-2" aria-label="Suchergebnisse">
              {treffer.slice(0, MAX_TREFFER).map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-2xl p-2 ring-1 ring-stone-200">
                  <Vorschau name={t.name} category={t.category} images={t.images} />
                  <Name name={t.name} number={t.number} entwurf={!t.published} />
                  <Button variant="soft" icon={Plus} loading={busy === t.id} onClick={() => hinzufuegen(t)} aria-label={`„${t.name}“ hinzufügen`} className="min-h-[44px] min-w-[44px]">
                    <span className="hidden sm:inline">Hinzufügen</span>
                  </Button>
                </li>
              ))}
              {treffer.length > MAX_TREFFER && (
                <li className="text-hinweis text-stone-600">… und {treffer.length - MAX_TREFFER} weitere – bitte genauer suchen.</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Vorschau(props: { name: string; category: string; images: string[] }) {
  return (
    <span className="size-12 shrink-0 overflow-hidden rounded-xl bg-stone-100" aria-hidden>
      <ItemImage item={props} iconSize="size-5" className="[&>div]:p-2" />
    </span>
  );
}

function Name({ name, number, entwurf }: { name: string; number?: string; entwurf: boolean }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block wrap-anywhere font-bold text-stone-900">{name}</span>
      <span className="block text-hinweis text-stone-600">
        {number}
        {entwurf && `${number ? ' · ' : ''}Nicht veröffentlicht`}
      </span>
    </span>
  );
}
