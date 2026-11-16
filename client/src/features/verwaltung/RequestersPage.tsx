import { ChevronRight, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Card, EmptyState, inputClass, PageHeader, Spinner } from '../../components/ui';
import { formatDate, formatRelative } from '../../lib/format';
import type { Requester } from '../../lib/types';
import { useApi, useDocumentTitle } from '../../lib/useApi';

export function RequestersPage() {
  useDocumentTitle('Lehrkräfte');
  const { data, error, loading } = useApi<Requester[]>('/orders/requesters');
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...(data ?? [])]
      .filter((r) => !needle || r.email.toLowerCase().includes(needle))
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

      {error && <Alert kind="error">{error.message}</Alert>}
      {loading && !data && <Spinner />}

      {data && data.length === 0 && (
        <EmptyState icon={Users} title="Noch keine Lehrkräfte">
          Sobald die erste Anfrage eingeht, erscheint die E-Mail-Adresse hier.
        </EmptyState>
      )}

      {data && data.length > 0 && (
        <>
          <div className="relative mb-5 max-w-md">
            <label htmlFor="requester-search" className="sr-only">
              Lehrkräfte nach E-Mail filtern
            </label>
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-500" aria-hidden />
            <input
              id="requester-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nach E-Mail filtern"
              className={`${inputClass()} pl-12`}
            />
          </div>

          <Card as="section" className="overflow-hidden">
            <h2 className="sr-only">Liste der Lehrkräfte</h2>
            <div
              aria-hidden
              className="hidden grid-cols-[minmax(0,2fr)_8rem_10rem_10rem_1.5rem] gap-4 border-b border-stone-100 px-6 py-3 text-[0.85rem] font-bold uppercase tracking-wide text-stone-500 md:grid"
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
                    className="grid gap-1 px-6 py-4 hover:bg-stone-50 focus-visible:bg-stone-50 md:grid-cols-[minmax(0,2fr)_8rem_10rem_10rem_1.5rem] md:items-center md:gap-4"
                  >
                    <span className="break-all font-bold text-stone-900">{r.email}</span>
                    <span className="text-[0.95rem] text-stone-700 md:text-right">
                      <span className="md:hidden">Anfragen: </span>
                      <strong>{r.orderCount}</strong>
                    </span>
                    <span className="text-[0.9rem] text-stone-600">
                      <span className="md:hidden">Erste Anfrage: </span>
                      <time dateTime={r.createdAt}>{formatDate(r.createdAt)}</time>
                    </span>
                    <span className="text-[0.9rem] text-stone-600">
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
