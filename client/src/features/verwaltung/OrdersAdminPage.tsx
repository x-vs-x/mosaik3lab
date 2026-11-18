import { Mail, PackageSearch, X } from 'lucide-react';
import { useMemo } from 'react';
import { FilterKnopf, LadeFehler, Suchfeld } from '../../components/Listenwerkzeug';
import { Button, Card, Email, EmptyState, PageHeader, Spinner } from '../../components/ui';
import { useConfig, useMasterData } from '../../lib/config';
import { statusMeta } from '../../lib/constants';
import { useSuchParameter } from '../../lib/suchParameter';
import type { MasterData, Order } from '../../lib/types';
import { useApi, useDocumentTitle } from '../../lib/useApi';
import { passtZurSuche } from '@mosaik3lab/shared/suche';
import { OrderRow } from './OrderRow';

/** 'unerledigt' = Phasen open + active, 'alle' = alles, sonst eine Status-ID. */
type Filter = string;

const isOpenPhase = (md: MasterData, status: string) => {
  const phase = statusMeta(md, status).def.phase;
  return phase === 'open' || phase === 'active';
};

export function OrdersAdminPage() {
  useDocumentTitle('Anfragen');
  const md = useMasterData();
  const { data: orders, setData, error, loading, reload } = useApi<Order[]>('/orders');
  const [params, setze] = useSuchParameter();
  const filter: Filter = params.get('status') ?? 'unerledigt';
  const highlight = params.get('offen');
  const email = params.get('email')?.trim().toLowerCase() || '';
  const tracking = useConfig().config?.features.requesterTracking ?? false;
  // Suchbegriff wie der Status-Filter in der Adresse, damit er „Zurück“ und Neuladen übersteht.
  const q = params.get('q') ?? '';
  const setQ = (value: string) => setze({ q: value });
  const setFilter = (f: Filter) => setze({ status: f, offen: null });
  const clearEmail = () => setze({ email: null });

  // Lehrkraft-Filter wirkt vor den Zählern, damit die Zahlen zur Ansicht passen.
  const scoped = useMemo(
    () => (orders ?? []).filter((o) => !email || o.requesterEmail.toLowerCase() === email),
    [orders, email],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { alle: scoped.length, unerledigt: 0 };
    for (const o of scoped) {
      c[o.status] = (c[o.status] ?? 0) + 1;
      if (isOpenPhase(md, o.status)) c.unerledigt++;
    }
    return c;
  }, [scoped, md]);

  const visible = useMemo(() => {
    const list = scoped
      .filter((o) => {
        if (highlight) return true;
        if (filter === 'alle') return true;
        if (filter === 'unerledigt') return isOpenPhase(md, o.status);
        return o.status === filter;
      })
      .filter((o) => passtZurSuche([o.number, o.itemName, o.classOrTeam, o.requesterEmail, o.requesterName, o.color], q));
    return highlight ? [...list].sort((a, b) => Number(b.id === highlight) - Number(a.id === highlight)) : list;
  }, [scoped, filter, q, highlight, md]);

  const replace = (updated: Order) => setData((list) => list?.map((o) => (o.id === updated.id ? updated : o)));

  const filters: { key: Filter; label: string }[] = [
    { key: 'unerledigt', label: 'Unerledigt' },
    { key: 'alle', label: 'Alle' },
    // auch ausgeschaltete Status, solange noch Anfragen darin stehen (sonst wären sie nicht mehr zu finden)
    ...md.orderStatuses
      .filter((s) => s.active || s.id === filter || orders?.some((o) => o.status === s.id))
      .map((s) => ({ key: s.id, label: s.name })),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Verwaltung"
        title="Anfragen"
        description={`Anfragen der Lehrkräfte bearbeiten und den Druckstand festhalten. ${
          tracking ? 'Lehrkräfte sehen Status und Notizen ihrer Anfragen.' : 'Status und Notizen sind nur für das Team sichtbar.'
        }`}
      />

      <LadeFehler error={error} onRetry={() => void reload()} loading={loading} />
      {loading && !orders && <Spinner />}

      {orders && (
        <>
          {email && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-brand-900 ring-1 ring-brand-200">
              <Mail className="size-5 shrink-0" aria-hidden />
              <p className="flex-1">
                Nur Anfragen von <strong><Email adresse={email} /></strong>
              </p>
              <Button variant="secondary" size="sm" icon={X} onClick={clearEmail}>
                Filter aufheben
              </Button>
            </div>
          )}

          <Card as="section" aria-label="Anfragen filtern" className="mb-5 flex min-w-0 flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div role="group" aria-label="Nach Status filtern" className="flex min-w-0 max-w-full flex-wrap gap-2">
              {filters.map((f) => (
                <FilterKnopf key={f.key} label={f.label} count={counts[f.key] ?? 0} active={!highlight && filter === f.key} onClick={() => setFilter(f.key)} />
              ))}
            </div>
            <Suchfeld id="order-search" label="Anfragen durchsuchen" value={q} onChange={setQ} placeholder="Nummer, Druckteil, E-Mail …" className="lg:w-80" />
          </Card>

          {visible.length === 0 ? (
            <EmptyState icon={PackageSearch} title="Keine Anfragen in dieser Ansicht">
              {filter === 'unerledigt' && !q && 'Alle Anfragen sind erledigt. Ältere finden Sie unter „Alle“.'}
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {visible.map((o) => (
                <OrderRow key={o.id} order={o} onUpdated={replace} initiallyOpen={o.id === highlight} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
