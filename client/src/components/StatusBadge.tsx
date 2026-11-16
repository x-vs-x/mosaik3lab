import { Check } from 'lucide-react';
import { useMasterData } from '../lib/config';
import { statusMeta } from '../lib/constants';
import { formatDateTime } from '../lib/format';
import type { Order } from '../lib/types';
import { Badge, cx } from './ui';

/** Status-Badge mit Symbol und Name (aus den Stammdaten). */
export function StatusBadge({ status }: { status: string }) {
  const md = useMasterData();
  const meta = statusMeta(md, status);
  return (
    <Badge className={meta.chip} icon={meta.icon}>
      {meta.label}
    </Badge>
  );
}

/** Fortschrittsanzeige über die Bearbeitungsschritte in der Reihenfolge der Stammdaten. */
export function StatusProgress({ status }: { status: string }) {
  const md = useMasterData();
  const steps = md.orderStatuses.filter((s) => s.active || s.id === status);
  const current = steps.findIndex((s) => s.id === status);
  if (steps.length === 0 || current < 0) return null;
  return (
    <div>
      <ol className="flex items-center gap-1.5" aria-label="Bearbeitungsfortschritt">
        {steps.map((s, i) => (
          <li key={s.id} className="flex-1">
            <span
              className={cx('block h-2 rounded-full', i <= current ? 'bg-brand-600' : 'bg-stone-200')}
              aria-hidden
            />
            <span className="sr-only">
              {s.name}: {i < current ? 'erledigt' : i === current ? 'aktueller Schritt' : 'ausstehend'}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[0.85rem] text-stone-600" aria-hidden>
        Schritt {current + 1} von {steps.length}: {steps[current].name}
      </p>
    </div>
  );
}

/** Verlauf einer Anfrage, neuester Eintrag oben. */
export function OrderTimeline({ order }: { order: Order }) {
  const md = useMasterData();
  const entries = [...order.history].reverse();
  return (
    <ol className="relative space-y-5 border-l-2 border-stone-200 pl-6">
      {entries.map((h, i) => {
        const meta = statusMeta(md, h.status);
        const Icon = i === 0 ? meta.icon : Check;
        return (
          <li key={`${h.at}-${i}`} className="relative">
            <span
              className={cx(
                'absolute -left-[2.15rem] top-0.5 grid size-6 place-items-center rounded-full ring-4 ring-white',
                meta.dot,
              )}
              aria-hidden
            >
              <Icon className="size-3.5 text-white" />
            </span>
            <p className="font-bold text-stone-900">{meta.label}</p>
            <p className="text-[0.85rem] text-stone-600">
              <time dateTime={h.at}>{formatDateTime(h.at)}</time>
              {h.byName && <> · {h.byName}</>}
            </p>
            {h.comment && (
              <p className="mt-1.5 rounded-xl bg-stone-50 px-3 py-2 text-[0.95rem] text-stone-800 ring-1 ring-stone-200">
                {h.comment}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
