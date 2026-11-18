import { ChevronDown, Pencil, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ColorSwatch } from '../../components/ColorSwatch';
import { ItemImage } from '../../components/ItemImage';
import { Badge, Button, Card, cx, DemoBadge } from '../../components/ui';
import { useMasterData } from '../../lib/config';
import { statusMeta } from '../../lib/constants';
import { formatDate } from '../../lib/format';
import type { Order, OwnOrder } from '../../lib/types';
import { OrderTimeline, StatusProgress } from './AnfrageVerlauf';
import { farbAnzeige } from './farbAnzeige';
import { FarbZusammenfassung } from './FarbZusammenfassung';

/** Anfrage mit Bearbeitungsstand (nur bei eingeschalteter Statusanzeige). */
export type TrackedOrder = OwnOrder & Pick<Order, 'status' | 'history' | 'trackingCode'>;
export const isTracked = (o: OwnOrder): o is TrackedOrder => typeof o.status === 'string' && Array.isArray(o.history);

/** Eine eigene Anfrage als Karte: Angaben, Fortschritt, Verlauf, „Anfrage bearbeiten“ (solange offen), „Nochmals anfragen“. */
export function OrderCard({
  order,
  onRepeat,
  repeating,
  onEdit,
  editing = false,
}: {
  order: OwnOrder;
  onRepeat?: () => void;
  repeating: boolean;
  onEdit?: () => void;
  editing?: boolean;
}) {
  const md = useMasterData();
  const [expanded, setExpanded] = useState(false);
  const tracked = isTracked(order) ? order : undefined;
  const meta = tracked ? statusMeta(md, tracked.status) : undefined;
  // Letzter Kommentar des Druck-Teams (der erste Eintrag stammt von der Anfrage selbst, Änderungen der Lehrkraft ohne Benutzer-ID).
  const lastComment = tracked?.history.slice(1).reverse().find((h) => h.comment && h.byUserId);
  const farben = farbAnzeige(order);
  const colors = farben.art === 'eine' ? [{ areaId: 'farbe', area: 'Farbe', ...farben.farbe }] : [];
  // Gesperrt-Hinweis nur, solange das Team noch daran arbeitet (nicht bei erledigten Anfragen).
  const lockedHint = onEdit && !order.editable && meta && meta.def.phase !== 'done';
  const personalization = order.personalization ?? [];

  return (
    <Card as="li" className="overflow-hidden border-2 border-stone-200">
      <article aria-labelledby={`order-${order.id}`}>
        <div className="flex flex-col sm:flex-row">
          <div className="h-28 shrink-0 sm:h-auto sm:w-44">
            <ItemImage item={{ name: order.itemName, category: order.itemCategory ?? '', images: order.itemImages ?? [] }} sizes="(min-width: 640px) 176px, calc(100vw - 24px)" iconSize="size-12" />
          </div>
          <div className="min-w-0 flex-1 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-hinweis font-bold text-stone-600">
                  Nr. {order.number} · <time dateTime={order.createdAt}>{formatDate(order.createdAt)}</time>
                </p>
                <h2 id={`order-${order.id}`} className="mt-0.5 wrap-anywhere text-abschnitt font-bold text-stone-900 sm:mt-1 sm:text-xl">
                  <Link to={`/katalog/${order.itemId}`} className="inline-flex min-h-11 items-center hover:text-brand-800 hover:underline">
                    {order.itemName}
                  </Link>
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {order.isDemo && <DemoBadge />}
                {meta && (
                  <Badge className={meta.chip} icon={meta.icon}>
                    {meta.label}
                  </Badge>
                )}
              </div>
            </div>

            {/* Spalten nach Platz: bei großer Schrift einspaltig statt zwei schmaler Spalten mit Silbenresten */}
            <dl className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(100%,8rem),1fr))] gap-x-4 gap-y-2.5 text-base sm:mt-4 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-3">
              <Detail label="Menge" value={`${order.quantity} Stück`} />
              <Detail label="Klasse / Team" value={order.classOrTeam} />
              {order.size && <Detail label="Größe" value={order.size} />}
              {farben.art === 'bereiche' || (farben.art === 'varianten' && farben.varianten.some((v) => v.colorChoices.length > 1)) ? (
                // Mehrteilige Drucke: kompakt „10 Teile · 7 Farben“, aufklappbar nach Farbe bzw. Teilen
                <div className="col-span-full">
                  <dt className="text-hinweis text-stone-600">Farben</dt>
                  <dd className="mt-1 space-y-2">
                    {farben.art === 'bereiche' ? (
                      <FarbZusammenfassung teile={farben.bereiche} />
                    ) : (
                      farben.varianten.map((v, i) => (
                        <FarbZusammenfassung key={i} teile={v.colorChoices} praefix={`${v.quantity} ×`} vergleich={i ? farben.varianten[0].colorChoices : undefined} />
                      ))
                    )}
                  </dd>
                </div>
              ) : farben.art === 'varianten' ? (
                // Mehrere Farben in einer Anfrage: „3 × Blau, 4 × Gelb“
                <div className="col-span-full">
                  <dt className="text-hinweis text-stone-600">Farben</dt>
                  <dd>
                    <ul className="flex flex-wrap gap-x-5 gap-y-1 font-bold text-stone-800">
                      {farben.varianten.map((v, i) => (
                        // Umbrechen statt Zusammendrücken: Bei mehreren Farbbereichen wurden die Angaben sonst zu
                        // schmalen Spalten mit einzelnen Silben („Grun|dplat|te“).
                        <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="whitespace-nowrap">{v.quantity} ×</span>
                          {v.colorChoices.map((c) => (
                            <span key={c.areaId} className="inline-flex min-w-0 items-center gap-1.5">
                              {c.colorHex && <ColorSwatch hex={c.colorHex} className="size-5 shrink-0" />}
                              {v.colorChoices.length > 1 ? `${c.area}: ${c.color}` : c.color}
                            </span>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ) : colors.map((c) => (
                <div key={c.areaId} className="col-span-full sm:col-span-1">
                  <dt className="text-hinweis text-stone-600">{colors.length > 1 ? `Farbe: ${c.area}` : 'Farbe'}</dt>
                  <dd className="flex items-center gap-2 font-bold text-stone-800">
                    {c.colorHex && <ColorSwatch hex={c.colorHex} className="size-5 shrink-0" />}
                    <span>{c.color}</span>
                  </dd>
                </div>
              ))}
              {personalization.map((p) => (
                <Detail key={p.fieldId} label={p.label} value={p.value} />
              ))}
            </dl>
            {order.customization && (
              <p className="mt-4 whitespace-pre-line wrap-anywhere text-base text-stone-700">
                <span className="font-bold">Anpassungswünsche:</span> {order.customization}
              </p>
            )}

            {tracked && (
              <div className="mt-5">
                <StatusProgress status={tracked.status} />
              </div>
            )}
            {lastComment && (
              <p className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-base text-brand-900">
                <span className="font-bold">Hinweis vom Druck-Team:</span> {lastComment.comment}
              </p>
            )}

            {lockedHint && (
              <p className="mt-4 text-hinweis text-stone-600">Wird bearbeitet – Änderungen bitte direkt beim Druck-Team.</p>
            )}
            {(onRepeat || (onEdit && order.editable)) && (
              <div className="mt-4 flex flex-col gap-2.5 sm:mt-5 sm:flex-row sm:gap-3">
                {onEdit && order.editable && (
                  <Button
                    icon={Pencil}
                    loading={editing}
                    onClick={onEdit}
                    className="w-full sm:w-auto"
                    aria-label={`Anfrage bearbeiten: ${order.itemName}, Nr. ${order.number}`}
                  >
                    Anfrage bearbeiten
                  </Button>
                )}
                {onRepeat && (
                <Button
                  variant="secondary"
                  icon={RefreshCw}
                  loading={repeating}
                  onClick={onRepeat}
                  className="w-full sm:w-auto"
                  aria-label={`Erneut anfragen: ${order.itemName}, Nr. ${order.number}`}
                >
                  Erneut anfragen
                </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {tracked && (
          <>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="flex min-h-12 w-full items-center justify-center gap-2 border-t border-stone-100 bg-stone-50/60 font-bold text-stone-700 hover:bg-stone-100"
            >
              {expanded ? 'Verlauf ausblenden' : 'Verlauf anzeigen'}
              <ChevronDown className={cx('size-5 transition-transform', expanded && 'rotate-180')} aria-hidden />
            </button>
            {expanded && (
              <div className="border-t border-stone-100 p-4 sm:p-6">
                <h3 className="mb-4 font-bold text-stone-900">Verlauf</h3>
                <OrderTimeline order={tracked} />
              </div>
            )}
          </>
        )}
      </article>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-hinweis text-stone-500">{label}</dt>
      <dd className="font-bold text-stone-800">{value}</dd>
    </div>
  );
}
