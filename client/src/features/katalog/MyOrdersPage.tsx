import { ClipboardList, LayoutGrid, Lightbulb, Search } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Button, Card, cx, EmptyState, Input, LinkButton, PageHeader, Spinner } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useMasterData } from '../../lib/config';
import { statusMeta } from '../../lib/constants';
import { getSavedCodes, normalizeCode, saveCode } from '../../lib/guestOrders';
import type { Item, Order, OwnOrder, RequestTemplate } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useApi';
import { isTracked, OrderCard, type TrackedOrder } from './OrderCard';
import { RequestDialog } from './RequestDialog';

type Tab = 'offen' | 'abgeschlossen' | 'alle';

/**
 * Angemeldete Lehrkraft: alle Anfragen zu ihrer E-Mail (GET /orders/mine).
 * Sonst: die auf diesem Gerät gemerkten Anfragen per Code (nur bei features.requesterTracking erreichbar).
 */
function useMyOrders(teacher: boolean) {
  const [orders, setOrders] = useState<OwnOrder[]>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const codes = getSavedCodes();
      const list = teacher
        ? await api<OwnOrder[]>('/orders/mine')
        : codes.length
          ? // Abruf per Code: nur ansehen, Ändern nur angemeldet.
            (await api<Order[]>('/orders/track', { method: 'POST', body: { codes } })).map((o) => ({ ...o, editable: false }))
          : [];
      setOrders([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setError(undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Anfragen konnten nicht geladen werden.');
    }
  }, [teacher]);

  useEffect(() => {
    void load();
  }, [load]);

  return { orders, error, reload: load };
}

function CodeLookup({ onFound }: { onFound: () => void }) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const c = normalizeCode(code);
    if (c.length !== 8) {
      setMessage('Der Code hat 8 Zeichen, z. B. „ABCD-EFGH“.');
      return;
    }
    setBusy(true);
    try {
      const found = await api<Order[]>('/orders/track', { method: 'POST', body: { codes: [c] } });
      if (found.length === 0) {
        setMessage('Zu diesem Code wurde keine Anfrage gefunden. Bitte Schreibweise prüfen.');
      } else {
        saveCode(c);
        setCode('');
        setMessage(undefined);
        onFound();
      }
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Abruf fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="section" className="mb-6 p-4 sm:mb-8 sm:p-6">
      <h2 className="text-lg font-bold text-stone-900">Anfrage an einem anderen Gerät gestellt?</h2>
      <p className="mt-1 text-stone-600">Geben Sie den Anfrage-Code ein, um sie hier anzuzeigen.</p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row" noValidate>
        <label htmlFor="track-code" className="sr-only">
          Anfrage-Code
        </label>
        <Input
          id="track-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD-EFGH"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          className="font-mono text-lg tracking-widest sm:max-w-xs"
          aria-describedby={message ? 'track-msg' : undefined}
        />
        <Button type="submit" variant="secondary" icon={Search} loading={busy}>
          Anfrage suchen
        </Button>
      </form>
      {message && (
        <p id="track-msg" role="alert" className="mt-2 font-bold text-rose-700">
          {message}
        </p>
      )}
    </Card>
  );
}

/** Sucht in allen sichtbaren Angaben einer Anfrage (ohne Groß-/Kleinschreibung). */
function matches(o: OwnOrder, q: string) {
  const text = [o.itemName, o.number, o.classOrTeam, o.color, o.size, o.customization, ...(o.personalization ?? []).map((p) => p.value)]
    .join(' ')
    .toLocaleLowerCase('de-DE');
  return q
    .toLocaleLowerCase('de-DE')
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => text.includes(part));
}

export function MyOrdersPage() {
  useDocumentTitle('Meine Anfragen');
  const { user, can } = useAuth();
  const teacher = can('orders:own');
  const { orders, error, reload } = useMyOrders(teacher);
  const loading = !orders && !error;
  const [tab, setTab] = useState<Tab>('offen');
  const [query, setQuery] = useState('');
  const md = useMasterData();

  // „Erneut anfragen“ und „Anfrage bearbeiten“: Vorlage vom Server holen, Druckteil laden, Anfrageformular vorausgefüllt öffnen.
  const [repeating, setRepeating] = useState<string>();
  const [repeatNotice, setRepeatNotice] = useState<string>();
  const [savedNotice, setSavedNotice] = useState<string>();
  const [repeat, setRepeat] = useState<{ item: Item; template: RequestTemplate; edit: boolean; opened: number }>();
  const [repeatOpen, setRepeatOpen] = useState(false);
  const repeatOrder = async (order: OwnOrder, edit = false) => {
    setRepeating(`${edit ? 'edit' : 'repeat'}:${order.id}`);
    setRepeatNotice(undefined);
    setSavedNotice(undefined);
    try {
      const template = await api<RequestTemplate>(`/orders/${order.id}/vorlage`);
      if (!template.available) {
        const what = edit ? 'bearbeitet' : 'erneut angefragt';
        setRepeatNotice(`${order.itemName} (${order.number}) kann nicht ${what} werden: ${template.hinweise.join(' ')}`);
        return;
      }
      const item = await api<Item>(`/items/${template.itemId}`);
      // `opened`: bei jedem Öffnen neu aufbauen, damit die aktuelle Vorlage gilt (nicht der Stand vom letzten Öffnen).
      setRepeat({ item, template, edit, opened: Date.now() });
      setRepeatOpen(true);
    } catch (err) {
      setRepeatNotice(err instanceof ApiError ? err.message : 'Die Anfrage konnte nicht vorbereitet werden. Bitte versuchen Sie es erneut.');
    } finally {
      setRepeating(undefined);
    }
  };
  const closeRepeat = () => {
    setRepeatOpen(false);
    void reload();
  };
  const saved = () => {
    setSavedNotice(`Ihre Änderungen an Anfrage ${repeat?.template.number} sind gespeichert.`);
    closeRepeat();
  };

  // Ohne eingeschaltete Statusanzeige liefert der Server keinen Bearbeitungsstand – dann keine Filter nach Stand.
  const tracked = orders?.every(isTracked) ? orders.filter(isTracked) : undefined;
  const isDone = (o: TrackedOrder) => statusMeta(md, o.status).def.phase === 'done';
  const searched = (orders ?? []).filter((o) => matches(o, query));
  const countOpen = tracked?.filter((o) => !isDone(o)).length ?? 0;
  const countDone = tracked?.filter(isDone).length ?? 0;
  const visible = searched.filter((o) => {
    if (!tracked || tab === 'alle') return true;
    return tab === 'offen' ? !isDone(o as TrackedOrder) : isDone(o as TrackedOrder);
  });

  const description = teacher
    ? `Alle Druckteile, die Sie mit ${user?.email} angefragt haben. ${
        tracked ? 'Den Bearbeitungsstand sehen Sie bei jeder Anfrage.' : 'Fertige Druckteile bringt das 3D-Druck-Team persönlich vorbei.'
      }`
    : 'Hier sehen Sie die Druckteile, die Sie an diesem Gerät angefragt haben, und den aktuellen Bearbeitungsstand.';

  return (
    <>
      <PageHeader
        title="Meine Anfragen"
        description={description}
        shortDescription={user ? `Ihre Anfragen als ${user.email}` : 'Ihre Anfragen an diesem Gerät.'}
        actions={
          <>
            <LinkButton to="/katalog" variant="secondary" icon={LayoutGrid}>
              Zum Katalog
            </LinkButton>
            {can('vorschlaege:eigene') && (
              <LinkButton to="/vorschlag/neu" icon={Lightbulb}>
                Etwas vorschlagen
              </LinkButton>
            )}
          </>
        }
      />

      {error && <Alert kind="error">{error}</Alert>}
      {repeatNotice && (
        <Alert kind="warning" className="mb-4 sm:mb-6">
          {repeatNotice}
        </Alert>
      )}
      {savedNotice && (
        <Alert kind="info" className="mb-4 sm:mb-6">
          <span role="status">{savedNotice}</span>
        </Alert>
      )}
      {loading && <Spinner />}

      {orders && orders.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title="Noch keine Anfragen"
          action={
            <LinkButton to="/katalog" icon={LayoutGrid}>
              Druckteile entdecken
            </LinkButton>
          }
        >
          Wählen Sie im Katalog ein Druckteil aus und klicken Sie auf „Druckteil anfragen“.
        </EmptyState>
      )}

      {orders && orders.length > 0 && (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
            {tracked && (
              <div role="tablist" aria-label="Anfragen filtern" className="inline-flex self-start rounded-2xl bg-stone-200/60 p-1">
                {(
                  [
                    ['offen', `Offen (${countOpen})`],
                    ['abgeschlossen', `Erledigt (${countDone})`],
                    ['alle', `Alle (${tracked.length})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    role="tab"
                    type="button"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={cx(
                      'min-h-11 rounded-xl px-3 font-bold transition-colors sm:min-h-12 sm:px-4',
                      tab === key ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-700 hover:text-stone-900',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className="relative lg:w-96">
              <label htmlFor="orders-search" className="sr-only">
                Anfragen durchsuchen
              </label>
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-500" aria-hidden />
              <Input
                id="orders-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Suchen: Name, Nummer, Klasse, Farbe …"
                autoComplete="off"
                className="pl-12"
              />
            </div>
          </div>

          <p className="sr-only" role="status">
            {visible.length} {visible.length === 1 ? 'Anfrage' : 'Anfragen'} angezeigt
          </p>
          {visible.length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-stone-700 ring-1 ring-stone-200">
              {query.trim()
                ? 'Keine Anfrage passt zu Ihrer Suche. Prüfen Sie die Schreibweise oder wählen Sie „Alle“.'
                : tab === 'offen'
                  ? 'Keine offenen Anfragen. Erledigte finden Sie unter „Erledigt“.'
                  : 'In dieser Ansicht gibt es keine Anfragen.'}
            </p>
          ) : (
            <ul className="space-y-3 sm:space-y-5">
              {visible.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  onRepeat={teacher ? () => void repeatOrder(o) : undefined}
                  repeating={repeating === `repeat:${o.id}`}
                  onEdit={teacher ? () => void repeatOrder(o, true) : undefined}
                  editing={repeating === `edit:${o.id}`}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {orders && !teacher && <div className="mt-10"><CodeLookup onFound={reload} /></div>}

      {repeat && (
        <RequestDialog
          key={repeat.opened}
          item={repeat.item}
          template={repeat.template}
          edit={repeat.edit}
          open={repeatOpen}
          onClose={closeRepeat}
          onSaved={saved}
        />
      )}
    </>
  );
}
