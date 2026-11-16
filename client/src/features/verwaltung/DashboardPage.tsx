import { ArrowRight, Boxes, Plus, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { StatusBadge } from '../../components/StatusBadge';
import { Alert, Card, LinkButton, PageHeader, Spinner } from '../../components/ui';
import { useMasterData } from '../../lib/config';
import { activeStatuses, statusMeta } from '../../lib/constants';
import { formatRelative } from '../../lib/format';
import type { DashboardData, StatusPhase } from '../../lib/types';
import { useApi, useDocumentTitle } from '../../lib/useApi';

const PHASE_HINTS: Record<StatusPhase, string> = {
  open: 'Wartet auf Bearbeitung',
  active: 'Wird gerade bearbeitet',
  done: 'Abgeschlossen',
};

export function DashboardPage() {
  useDocumentTitle('Übersicht');
  const { user, can } = useAuth();
  const md = useMasterData();
  const { data, error, loading } = useApi<DashboardData>('/dashboard');

  // Nur eingeschaltete Status erscheinen als Kachel (Einstellungen → Ablauf der Anfragen).
  const statuses = activeStatuses(md);

  return (
    <>
      <PageHeader
        eyebrow="Verwaltung"
        title={`Hallo, ${user?.displayName ?? ''}`}
        description="Der aktuelle Stand im 3D-Druck auf einen Blick."
        actions={
          can('catalog:manage') && (
            <LinkButton to="/verwaltung/hilfsmittel/neu" icon={Plus}>
              Neues Druckteil
            </LinkButton>
          )
        }
      />

      {error && <Alert kind="error">{error.message}</Alert>}
      {loading && !data && <Spinner />}

      {data && (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Stat
              icon={Boxes}
              label="Druckteile im Katalog"
              value={data.items.total}
              hint={`${data.items.published} veröffentlicht`}
              tone="bg-indigo-50 text-indigo-700"
              to="/verwaltung/hilfsmittel"
            />
            {statuses.map((st) => {
              const meta = statusMeta(md, st.id);
              return (
                <Stat
                  key={st.id}
                  icon={meta.icon}
                  label={st.name}
                  value={data.orders.byStatus[st.id] ?? 0}
                  hint={PHASE_HINTS[st.phase]}
                  tone={meta.chip}
                  to={`/verwaltung/bestellungen?status=${encodeURIComponent(st.id)}`}
                />
              );
            })}
          </ul>

          <Card as="section" className="mt-8">
            <div className="flex items-center justify-between gap-4 border-b border-stone-100 px-6 py-5">
              <h2 className="text-xl font-bold text-stone-900">Neueste Anfragen</h2>
              <Link
                to="/verwaltung/bestellungen?status=alle"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-bold text-brand-700 hover:text-brand-900"
              >
                Alle Anfragen
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            {data.latest.length === 0 ? (
              <p className="px-6 py-8 text-stone-600">Noch keine Anfragen vorhanden.</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {data.latest.map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/verwaltung/bestellungen?offen=${encodeURIComponent(o.id)}`}
                      className="flex flex-col gap-1.5 px-4 py-3 hover:bg-stone-50 sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:py-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-stone-900">{o.itemName}</p>
                        <p className="break-all text-[0.9rem] text-stone-600">
                          {o.number} · {o.quantity} × · {o.classOrTeam} · {o.requesterEmail || o.requesterName}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[0.9rem] text-stone-500">{formatRelative(o.createdAt)}</span>
                        <StatusBadge status={o.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  to,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
  tone: string;
  to: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex h-full flex-col rounded-2xl border border-stone-200/80 bg-white p-3.5 sm:rounded-3xl sm:p-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)] transition hover:border-stone-300 hover:shadow-md sm:p-6"
      >
        <span className={`grid size-10 place-items-center rounded-2xl sm:size-12 ${tone}`}>
          <Icon className="size-5 sm:size-6" aria-hidden />
        </span>
        <span className="mt-2.5 text-[1.75rem] sm:mt-5 sm:text-[2.4rem] font-bold leading-none tracking-tight text-stone-900">{value}</span>
        <span className="mt-2 font-bold text-stone-800">{label}</span>
        <span className="mt-0.5 text-[0.85rem] text-stone-600 sm:text-[0.9rem]">{hint}</span>
      </Link>
    </li>
  );
}
