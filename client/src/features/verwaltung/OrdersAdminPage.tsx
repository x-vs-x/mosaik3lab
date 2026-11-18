import { ChevronDown, Lock, Mail, PackageSearch, Save, Search, Send, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ColorSwatch } from '../../components/ColorSwatch';
import { OrderTimeline, StatusBadge } from '../../components/StatusBadge';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import {
  Alert,
  Button,
  Card,
  cx,
  DemoBadge,
  EmptyState,
  Field,
  inputClass,
  PageHeader,
  Select,
  Spinner,
  Textarea,
  Email,
} from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useConfig, useMasterData } from '../../lib/config';
import { findFilament, nextStatus, statusMeta } from '../../lib/constants';
import { formatDate, formatDateTime, formatRelative } from '../../lib/format';
import type { MasterData, Order } from '../../lib/types';
import { useApi, useDocumentTitle } from '../../lib/useApi';
import { filamentRolle } from '@mosaik3lab/shared/werte/stammdaten';
import { passtZurSuche } from '@mosaik3lab/shared/suche';

/** 'unerledigt' = Phasen open + active, 'alle' = alles, sonst eine Status-ID. */
type Filter = string;

const isOpenPhase = (md: MasterData, status: string) => {
  const phase = statusMeta(md, status).def.phase;
  return phase === 'open' || phase === 'active';
};

export function OrdersAdminPage() {
  useDocumentTitle('Anfragen');
  const md = useMasterData();
  const { data: orders, setData, error, loading } = useApi<Order[]>('/orders');
  const [params, setParams] = useSearchParams();
  const filter: Filter = params.get('status') ?? 'unerledigt';
  const highlight = params.get('offen');
  const email = params.get('email')?.trim().toLowerCase() || '';
  const tracking = useConfig().config?.features.requesterTracking ?? false;
  // Suchbegriff wie der Status-Filter in der Adresse, damit er „Zurück“ und Neuladen übersteht.
  const q = params.get('q') ?? '';
  const setQ = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    setParams(next, { replace: true });
  };

  const setFilter = (f: Filter) => {
    const next = new URLSearchParams(params);
    next.set('status', f);
    next.delete('offen');
    setParams(next, { replace: true });
  };

  const clearEmail = () => {
    const next = new URLSearchParams(params);
    next.delete('email');
    setParams(next, { replace: true });
  };

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

      {error && <Alert kind="error">{error.message}</Alert>}
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
              {filters.map((f) => {
                const active = !highlight && filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(f.key)}
                    className={cx(
                      'inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full px-3.5 text-base font-bold transition-colors sm:gap-2 sm:px-4',
                      active
                        ? 'bg-stone-900 text-white'
                        : 'bg-white text-stone-700 ring-1 ring-inset ring-stone-300 hover:bg-stone-50',
                    )}
                  >
                    {f.label}
                    <span
                      className={cx(
                        'rounded-full px-2 py-0.5 text-hinweis',
                        active ? 'bg-white/20' : 'bg-stone-100 text-stone-600',
                      )}
                    >
                      <span className="sr-only">Anzahl: </span>
                      {counts[f.key] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="relative lg:w-80">
              <label htmlFor="order-search" className="sr-only">
                Anfragen durchsuchen
              </label>
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-500" aria-hidden />
              <input
                id="order-search"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nummer, Druckteil, E-Mail, Klasse …"
                className={`${inputClass()} pl-12`}
              />
            </div>
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

function OrderRow({
  order,
  onUpdated,
  initiallyOpen,
}: {
  order: Order;
  onUpdated: (o: Order) => void;
  initiallyOpen: boolean;
}) {
  const md = useMasterData();
  const canEdit = useAuth().can('orders:manage');
  // Mit Statusanzeige sehen Lehrkräfte Status und Notiz (als „Hinweis vom Druck-Team“).
  const tracking = useConfig().config?.features.requesterTracking ?? false;
  const [open, setOpen] = useState(initiallyOpen);
  // Anfragende wählen nur die Farbe – welche Rolle (Marke, Linie, Bambu-Nummer) dahintersteht, sieht nur das Team.
  const rollOf = (colorId: string) => {
    const f = findFilament(md, colorId);
    const roll = f ? filamentRolle(f) : '';
    return roll && <span className="font-normal text-stone-600">· {roll}</span>;
  };
  const [status, setStatus] = useState<string>(order.status);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const suggestion = nextStatus(md, order.status);
  const panelId = `order-${order.id}`;
  const knownStatus = md.orderStatuses.some((s) => s.id === order.status);

  useEffect(() => setStatus(order.status), [order.status]);

  const save = async (target: string, note: string) => {
    setSaving(true);
    try {
      const updated = await api<Order>(`/orders/${order.id}/status`, {
        method: 'PATCH',
        body: { status: target, comment: note },
      });
      onUpdated(updated);
      setComment('');
      toast('success', `${order.number}: Status „${statusMeta(md, target).label}“ gespeichert.`);
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save(status, comment);
  };

  return (
    <Card as="li" className={cx('overflow-hidden', initiallyOpen && 'ring-2 ring-brand-500')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full flex-col gap-2.5 p-4 text-left hover:bg-stone-50/70 sm:flex-row sm:items-center sm:gap-6 sm:p-5"
      >
        <div className="min-w-0 flex-1">
          <p className="text-hinweis font-bold text-stone-500">
            {order.number} · <time dateTime={order.createdAt}>{formatDate(order.createdAt)}</time>
            <span className="font-normal"> ({formatRelative(order.createdAt)})</span>
          </p>
          <p className="mt-0.5 text-base font-bold text-stone-900">
            {order.quantity} × {order.itemName}
          </p>
          <p className="mt-0.5 text-hinweis font-bold text-stone-700">
            <Email adresse={order.requesterEmail || order.requesterName || 'Ohne E-Mail'} />
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-hinweis text-stone-600">
            <span>{order.classOrTeam}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1.5">
              {order.colorHex && <ColorSwatch hex={order.colorHex} className="size-4" />}
              {order.color}
            </span>
            {order.size && (
              <>
                <span aria-hidden>·</span>
                <span>{order.size}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {order.isDemo && <DemoBadge />}
          <StatusBadge status={order.status} />
          <ChevronDown className={cx('size-5 text-stone-500 transition-transform', open && 'rotate-180')} aria-hidden />
        </div>
      </button>

      {open && (
        <div id={panelId} className="grid gap-5 border-t border-stone-100 p-4 sm:gap-6 sm:p-5 lg:grid-cols-[1fr_1fr_1fr]">
          <div>
            <h3 className="font-bold text-stone-900">Details</h3>
            <dl className="mt-3 space-y-2.5 text-base sm:space-y-2">
              <Row label="Druckteil">
                <Link to={`/verwaltung/hilfsmittel/${order.itemId}`} className="font-bold text-brand-700 underline-offset-2 hover:underline">
                  {order.itemName}
                </Link>
              </Row>
              <Row label="Anzahl">{order.quantity} Stück</Row>
              {(order.colorVariants ?? []).length > 1 ? (
                // Mehrere Farben in einer Anfrage: Stückzahl je Farbe
                order.colorVariants.map((v, i) => (
                  <Row key={i} label={`Farbe ${i + 1} (${v.quantity} Stück)`}>
                    <span className="flex flex-col gap-1">
                      {v.colorChoices.map((c) => (
                        <span key={c.areaId} className="flex flex-wrap items-center gap-x-2">
                          {c.colorHex && <ColorSwatch hex={c.colorHex} />}
                          {v.colorChoices.length > 1 && `${c.area}: `}
                          {c.color}
                          {rollOf(c.colorId)}
                        </span>
                      ))}
                    </span>
                  </Row>
                ))
              ) : (order.colorChoices ?? []).length > 1 ? (
                // Mehrfarbiger Druck: Farbe je Bereich
                order.colorChoices.map((c) => (
                  <Row key={c.areaId} label={`Farbe ${c.area}`}>
                    <span className="inline-flex flex-wrap items-center gap-x-2">
                      {c.colorHex && <ColorSwatch hex={c.colorHex} />}
                      {c.color}
                      {rollOf(c.colorId)}
                    </span>
                  </Row>
                ))
              ) : (
                <Row label="Farbe">
                  <span className="inline-flex flex-wrap items-center gap-x-2">
                    {order.colorHex && <ColorSwatch hex={order.colorHex} />}
                    {order.color}
                    {rollOf(order.colorId)}
                  </span>
                </Row>
              )}
              <Row label="Größe">{order.size || '—'}</Row>
              {(order.personalization ?? []).map((p) => (
                <Row key={p.fieldId} label={p.label}>
                  <span className="whitespace-pre-line">{p.value}</span>
                </Row>
              ))}
              <Row label="Klasse / Team">{order.classOrTeam}</Row>
              <Row label="Schul-E-Mail">
                {order.requesterEmail ? (
                  <a href={`mailto:${order.requesterEmail}`} className="text-brand-700 underline-offset-2 hover:underline">
                    <Email adresse={order.requesterEmail} />
                  </a>
                ) : (
                  order.requesterName || '—'
                )}
              </Row>
              <Row label="Eingang">{formatDateTime(order.createdAt)}</Row>
            </dl>
            <h3 className="mt-5 font-bold text-stone-900">Anpassungswünsche</h3>
            <p className="mt-1.5 whitespace-pre-line text-stone-700">{order.customization || '—'}</p>
          </div>

          <div>
            <h3 className="mb-4 font-bold text-stone-900">Verlauf</h3>
            <OrderTimeline order={order} />
          </div>

          {/* Nur mit Recht „Anfragen bearbeiten“ – das Backend prüft zusätzlich. */}
          <form onSubmit={submit} hidden={!canEdit} className="min-w-0 space-y-4 rounded-2xl bg-stone-50 p-3.5 ring-1 ring-stone-200 sm:p-5">
            <h3 className="font-bold text-stone-900">Status bearbeiten</h3>
            <p className="flex items-start gap-2 text-hinweis text-stone-600">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              {tracking
                ? 'Lehrkräfte sehen Status und Notiz mit Ihrem Namen (Statusanzeige ist eingeschaltet).'
                : 'Nur intern sichtbar, Lehrkräfte sehen keinen Status.'}
            </p>
            {suggestion && (
              <Button
                variant="soft"
                icon={Send}
                className="w-full whitespace-normal text-left"
                disabled={saving}
                onClick={() => save(suggestion.id, comment)}
              >
                Weiter zu „{suggestion.name}“
              </Button>
            )}
            <Field label="Neuer Status">
              {({ id }) => (
                <Select id={id} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {!knownStatus && <option value={order.status}>{order.status} (unbekannt)</option>}
                  {md.orderStatuses.filter((s) => s.active || s.id === order.status).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label={tracking ? 'Notiz' : 'Interne Notiz'}
              hint={tracking ? 'Optional, z. B. Abholort oder Rückfragen – für die Lehrkraft sichtbar.' : 'Optional, z. B. Drucker, Abholort oder Rückfragen.'}
            >
              {({ id, describedBy }) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={500}
                  aria-describedby={describedBy}
                  className="min-h-20"
                />
              )}
            </Field>
            <Button
              type="submit"
              icon={Save}
              loading={saving}
              disabled={status === order.status && !comment.trim()}
              className="w-full"
            >
              Speichern
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sm:flex sm:gap-3">
      <dt className="text-hinweis text-stone-500 sm:w-32 sm:shrink-0 sm:text-base">{label}</dt>
      <dd className="min-w-0 wrap-anywhere font-bold text-stone-800">{children}</dd>
    </div>
  );
}
