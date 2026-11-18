import { ChevronRight, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LadeFehler, Suchfeld } from '../../components/Listenwerkzeug';
import { Alert, Card, EmptyState, PageHeader, Spinner, Email } from '../../components/ui';
import { formatDate, formatRelative } from '../../lib/format';
import type { Requester } from '../../lib/types';
import { useApi, useDocumentTitle } from '../../lib/useApi';
import { passtZurSuche } from '@mosaik3lab/shared/suche';

export function RequestersPage() {
  useDocumentTitle('Lehrkräfte');
  const { data, error, loading, reload } = useApi<Requester[]>('/orders/requesters');
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    return [...(data ?? [])]
      .filter((r) => passtZurSuche([r.email], q))
      .sort((a, b) => (b.lastOrderAt ?? '').localeCompare(a.lastOrderAt ?? ''));
  }, [data, q]);

  return (
    <>
      <PageHeader
        eyebrow="Verwaltung"
        title="Lehrkräfte"
        description="Alle Schul-E-Mail-Adressen, von denen bereits Anfragen eingegangen sind."
      />

      <Alert className="mb-6">
        Lehrkräfte werden beim ersten Bestellen mit ihrer Schul-E-Mail automatisch angelegt – ohne Passwort.
      </Alert>

      <LadeFehler error={error} onRetry={() => void reload()} loading={loading} />
      {loading && !data && <Spinner />}

      {data && data.length === 0 && (
        <EmptyState icon={Users} title="Noch keine Lehrkräfte">
          Sobald die erste Anfrage eingeht, erscheint die E-Mail-Adresse hier.
        </EmptyState>
      )}

      {data && data.length > 0 && (
        <>
          <Suchfeld id="requester-search" label="Lehrkräfte nach E-Mail filtern" value={q} onChange={setQ} placeholder="Nach E-Mail filtern" className="mb-5 max-w-md" />

          <Card as="section" className="overflow-hidden">
            <h2 className="sr-only">Liste der Lehrkräfte</h2>
            <div
              aria-hidden
              className="hidden grid-cols-[minmax(0,2fr)_8rem_10rem_10rem_1.5rem] gap-4 border-b border-stone-100 px-4 py-3 sm:px-6 text-hinweis font-bold uppercase tracking-wide text-stone-500 md:grid"
            >
              <span>Schul-E-Mail</span>
              <span className="text-right">Anfragen</span>
              <span>Erste Anfrage</span>
              <span>Letzte Anfrage</span>
              <span />
            </div>
            <ul className="divide-y divide-stone-100">
              {list.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/verwaltung/bestellungen?status=alle&email=${encodeURIComponent(r.email)}`}
                    className="grid gap-1 px-4 py-3 sm:px-6 sm:py-4 hover:bg-stone-50 focus-visible:bg-stone-50 md:grid-cols-[minmax(0,2fr)_8rem_10rem_10rem_1.5rem] md:items-center md:gap-4"
                  >
                    <span className="font-bold text-stone-900">
                      <Email adresse={r.email} />
                    </span>
                    <span className="text-base text-stone-700 md:text-right">
                      <span className="md:hidden">Anfragen: </span>
                      <strong>{r.orderCount}</strong>
                    </span>
                    <span className="text-hinweis text-stone-600">
                      <span className="md:hidden">Erste Anfrage: </span>
                      <time dateTime={r.createdAt}>{formatDate(r.createdAt)}</time>
                    </span>
                    <span className="text-hinweis text-stone-600">
                      <span className="md:hidden">Letzte Anfrage: </span>
                      {r.lastOrderAt ? (
                        <time dateTime={r.lastOrderAt} title={formatDate(r.lastOrderAt)}>
                          {formatRelative(r.lastOrderAt)}
                        </time>
                      ) : (
                        '—'
                      )}
                    </span>
                    <ChevronRight className="hidden size-5 text-stone-400 md:block" aria-hidden />
                    <span className="sr-only">– Anfragen anzeigen</span>
                  </Link>
                </li>
              ))}
            </ul>
            {list.length === 0 && <p className="px-6 py-6 text-stone-600">Keine Treffer für „{q}“.</p>}
          </Card>
        </>
      )}
    </>
  );
}
