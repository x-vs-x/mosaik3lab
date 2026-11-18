import { ChevronDown, Lock, Save, Send } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ColorSwatch } from '../../components/ColorSwatch';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { Button, Card, cx, DemoBadge, Email, Field, Select, Textarea } from '../../components/ui';
import { api, fehlerText } from '../../lib/api';
import { findFilament } from '../../lib/colors';
import { useConfig, useMasterData } from '../../lib/config';
import { nextStatus, statusMeta } from '../../lib/constants';
import { formatDate, formatDateTime, formatRelative } from '../../lib/format';
import type { Order } from '../../lib/types';
import { filamentRolle } from '@mosaik3lab/shared/werte/stammdaten';
import { OrderTimeline } from '../anfragen/AnfrageVerlauf';
import { farbAnzeige } from '../anfragen/farbAnzeige';
import { FarbZusammenfassung } from '../anfragen/FarbZusammenfassung';
import { TupferReihe } from '../../components/TupferReihe';
import { farbZusammenfassung } from '@mosaik3lab/shared/werte/farbgruppen';

/** Eine Anfrage in der Verwaltung: Kopfzeile zum Aufklappen, Details, Verlauf und „Status bearbeiten“. */
export function OrderRow({
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
    // inline-block: Punkt und Rolle bleiben zusammen (kein einzelner „·“ am Zeilenende)
    return roll && <span className="inline-block font-normal text-stone-600">· {roll}</span>;
  };
  const [status, setStatus] = useState<string>(order.status);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const suggestion = nextStatus(md, order.status);
  const panelId = `order-${order.id}`;
  const knownStatus = md.orderStatuses.some((s) => s.id === order.status);
  const farben = farbAnzeige(order);
  const mehrteilig = farben.art === 'bereiche' || (farben.art === 'varianten' && farben.varianten.some((v) => v.colorChoices.length > 1));
  const kurzFarben =
    farben.art === 'bereiche'
      ? farbZusammenfassung(farben.bereiche)
      : farben.art === 'varianten'
        ? farben.varianten.map((v) => `${v.quantity} × ${farbZusammenfassung(v.colorChoices)}`).join(', ')
        : '';
  const tupfer = mehrteilig
    ? [...new Set((farben.art === 'bereiche' ? farben.bereiche : farben.art === 'varianten' ? farben.varianten.flatMap((v) => v.colorChoices) : []).map((c) => c.colorHex).filter(Boolean))]
    : [];

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
      toast('error', fehlerText(err, 'Speichern fehlgeschlagen.'));
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
          {/* Trennpunkt jeweils mit der folgenden Angabe zusammen – sonst stand er bei langen Farbangaben allein in einer Zeile */}
          <p className="mt-1 flex flex-wrap items-start gap-x-2 gap-y-1 text-hinweis text-stone-600">
            <span>{order.classOrTeam}</span>
            {mehrteilig ? (
              // Statt „Grundplatte: Rot; Stall: Gelb; …“ (bis 20 Teile) nur „10 Teile · 7 Farben“ mit Farbtupfern
              <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
                <span aria-hidden>·</span>
                <span className="min-w-0">{kurzFarben}</span>
                <TupferReihe farben={tupfer} tupfer="size-4" />
              </span>
            ) : (
              <span className="inline-flex min-w-0 items-start gap-1.5">
                <span aria-hidden>·</span>
                {order.colorHex && <ColorSwatch hex={order.colorHex} className="mt-[0.2em] size-4" />}
                <span className="min-w-0">{order.color}</span>
              </span>
            )}
            {order.size && (
              <span className="inline-flex min-w-0 gap-2">
                <span aria-hidden>·</span>
                <span className="min-w-0">{order.size}</span>
              </span>
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
          {/* Container: Bezeichnung neben dem Wert nur, wenn die Spalte breit genug ist (iPad quer: drei schmale Spalten) */}
          <div className="@container">
            <h3 className="font-bold text-stone-900">Details</h3>
            <dl className="mt-3 space-y-2.5 text-base sm:space-y-2">
              <Row label="Druckteil">
                <Link to={`/verwaltung/hilfsmittel/${order.itemId}`} className="font-bold text-brand-700 underline-offset-2 hover:underline">
                  {order.itemName}
                </Link>
              </Row>
              <Row label="Anzahl">{order.quantity} Stück</Row>
              {mehrteilig ? (
                // Mehrteiliger Druck: kompakt „10 Teile · 7 Farben“, aufgeklappt nach Farbe gebündelt (über die volle Spaltenbreite)
                <div>
                  <dt className="text-hinweis text-stone-500">Farben</dt>
                  <dd className="mt-1 space-y-2">
                    {farben.art === 'bereiche' ? (
                      <FarbZusammenfassung teile={farben.bereiche} zusatz={rollOf} fuerTeam />
                    ) : farben.art === 'varianten' ? (
                      farben.varianten.map((v, i) => (
                        <FarbZusammenfassung
                          key={i}
                          teile={v.colorChoices}
                          praefix={`${v.quantity} ×`}
                          vergleich={i ? farben.varianten[0].colorChoices : undefined}
                          zusatz={rollOf}
                          fuerTeam
                        />
                      ))
                    ) : null}
                  </dd>
                </div>
              ) : farben.art === 'varianten' ? (
                // Mehrere Farben in einer Anfrage: Stückzahl je Farbe
                farben.varianten.map((v, i) => (
                  <Row key={i} label={`Farbe ${i + 1} (${v.quantity} Stück)`}>
                    <span className="flex flex-col gap-1">
                      {v.colorChoices.map((c) => (
                        // Fließtext statt Flex: Farbtupfer bleibt vor dem Namen, auch wenn der Bereichsname umbricht
                        <span key={c.areaId} className="block">
                          {c.colorHex && <ColorSwatch hex={c.colorHex} className="mr-2 align-[-0.25em]" />}
                          {v.colorChoices.length > 1 && `${c.area}: `}
                          {c.color} {rollOf(c.colorId)}
                        </span>
                      ))}
                    </span>
                  </Row>
                ))
              ) : farben.art === 'eine' ? (
                <Row label="Farbe">
                  <span className="inline-flex flex-wrap items-center gap-x-2">
                    {farben.farbe.colorHex && <ColorSwatch hex={farben.farbe.colorHex} />}
                    {farben.farbe.color}
                    {rollOf(farben.farbe.colorId)}
                  </span>
                </Row>
              ) : null}
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
    <div className="@xs:flex @xs:gap-3">
      <dt className="text-hinweis text-stone-500 @xs:w-32 @xs:shrink-0 @xs:text-base">{label}</dt>
      <dd className="min-w-0 wrap-anywhere font-bold text-stone-800">{children}</dd>
    </div>
  );
}
