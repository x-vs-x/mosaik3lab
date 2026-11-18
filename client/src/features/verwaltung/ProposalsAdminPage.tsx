import { Lightbulb, PackagePlus, Pencil, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { FilterKnopf, LadeFehler, Suchfeld } from '../../components/Listenwerkzeug';
import { useToast } from '../../components/Toast';
import { Alert, Button, Card, cx, EmptyState, Field, PageHeader, Select, Spinner, Textarea, Email } from '../../components/ui';
import { api, ApiError, fehlerText } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useSuchParameter } from '../../lib/suchParameter';
import { useApi, useDocumentTitle } from '../../lib/useApi';
import {
  PhotoGrid,
  ProposalStatusBadge,
  SafeLinks,
  STATUS_LABELS,
  URGENCY_LABELS,
  type Proposal,
  type ProposalStatus,
} from '../vorschlaege/proposals';
import { passtZurSuche } from '@mosaik3lab/shared/suche';
import type { ProposalUmgewandelt } from '@mosaik3lab/shared/vorschlaege';

type Filter = 'offen' | 'alle' | ProposalStatus;

const STATUSES = Object.keys(STATUS_LABELS) as ProposalStatus[];

function ProposalCard({ proposal, highlight, onChange }: { proposal: Proposal; highlight: boolean; onChange: (p: Proposal) => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  // Mit Entwurf im Katalog gilt immer „Umgesetzt“ (ältere Daten können noch einen anderen Status tragen).
  const [status, setStatus] = useState<ProposalStatus>(proposal.itemId ? 'umgesetzt' : proposal.status);
  const [reply, setReply] = useState(proposal.reply);
  const [busy, setBusy] = useState<'save' | 'convert'>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const editable = can('vorschlaege:bearbeiten');
  const canConvert = can('vorschlaege:umwandeln') && can('catalog:manage') && !proposal.itemId;
  const dirty = status !== proposal.status || reply !== proposal.reply;

  const save = async () => {
    setBusy('save');
    setFields({});
    try {
      const updated = await api<Proposal>(`/proposals/${proposal.id}`, { method: 'PATCH', body: { status, reply } });
      onChange(updated);
      // Der Server kürzt Leerzeichen – lokalen Stand angleichen, sonst bleibt „Speichern“ aktiv.
      setStatus(updated.status);
      setReply(updated.reply);
      toast('success', `${proposal.number} gespeichert.`);
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        toast('error', err.message);
      } else toast('error', 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(undefined);
    }
  };

  const convert = async () => {
    setBusy('convert');
    try {
      const r = await api<ProposalUmgewandelt>(`/proposals/${proposal.id}/convert`, { method: 'POST' });
      onChange(r.proposal);
      toast('success', `${proposal.number} wurde als Entwurf in den Katalog übernommen. Bitte die Angaben ergänzen.`);
      navigate(`/verwaltung/hilfsmittel/${r.itemId}`);
    } catch (err) {
      toast('error', fehlerText(err, 'Umwandeln fehlgeschlagen.'));
      setBusy(undefined);
    }
  };

  return (
    <Card as="article" className={cx('space-y-4 p-5 sm:p-6', highlight && 'ring-4 ring-brand-600/30')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-hinweis font-bold text-stone-600">
            {proposal.number} · {formatDateTime(proposal.createdAt)}
          </p>
          <h2 className="text-abschnitt font-bold text-stone-900 sm:text-xl">{proposal.title}</h2>
          <p className="text-base text-stone-600">
            von{' '}
            {/* Die Anfragen der Lehrkraft sieht nur, wer Anfragen bearbeiten darf. */}
            {can('orders:view') ? (
              <Link to={`/verwaltung/bestellungen?email=${encodeURIComponent(proposal.requesterEmail)}&status=alle`} className="font-bold text-brand-800 hover:underline">
                <Email adresse={proposal.requesterEmail || 'unbekannt'} />
              </Link>
            ) : (
              <strong>
                <Email adresse={proposal.requesterEmail || 'unbekannt'} />
              </strong>
            )}
          </p>
        </div>
        <ProposalStatusBadge status={proposal.status} />
      </div>

      <p className="whitespace-pre-line text-stone-800">{proposal.description}</p>
      {proposal.usage && (
        <p className="text-stone-800">
          <strong>Einsatz:</strong> {proposal.usage}
        </p>
      )}
      <p className="text-base text-stone-600">
        Menge: {proposal.quantity} · Dringlichkeit: <strong className={proposal.urgency === 'dringend' ? 'text-rose-800' : undefined}>{URGENCY_LABELS[proposal.urgency]}</strong>
      </p>
      <SafeLinks links={proposal.links} />
      <PhotoGrid proposalId={proposal.id} photos={proposal.photos} />

      {proposal.itemId && (
        <Alert kind="info">
          Als Entwurf im Katalog angelegt.{' '}
          {can('catalog:manage') && (
            <Link to={`/verwaltung/hilfsmittel/${proposal.itemId}`} className="font-bold underline">
              Druckteil bearbeiten
            </Link>
          )}
        </Alert>
      )}

      {editable && (
        <div className="grid gap-4 border-t border-stone-100 pt-4 md:grid-cols-[14rem_1fr]">
          <Field
            label="Status"
            error={fields.status}
            hint={proposal.itemId ? 'Bleibt „Umgesetzt“, solange der Entwurf im Katalog steht.' : undefined}
          >
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={status}
                disabled={!!proposal.itemId}
                onChange={(e) => setStatus(e.target.value as ProposalStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Antwort an die Lehrkraft" error={fields.reply} hint={status === 'abgelehnt' ? 'Bei „Abgelehnt“ bitte kurz begründen.' : 'Sichtbar für die Lehrkraft unter „Meine Vorschläge“.'}>
            {({ id, describedBy, invalid }) => (
              <Textarea id={id} aria-describedby={describedBy} invalid={invalid} rows={3} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} />
            )}
          </Field>
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <Button icon={Save} onClick={save} loading={busy === 'save'} disabled={!dirty || !!busy}>
              Speichern
            </Button>
            {canConvert && (
              <Button variant="soft" icon={PackagePlus} onClick={convert} loading={busy === 'convert'} disabled={!!busy}>
                In Druckteil umwandeln
              </Button>
            )}
            {proposal.itemId && can('catalog:manage') && (
              <Link to={`/verwaltung/hilfsmittel/${proposal.itemId}`} className="inline-flex min-h-12 items-center gap-2 px-3 font-bold text-brand-800 hover:underline">
                <Pencil className="size-5" aria-hidden />
                Druckteil öffnen
              </Link>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/** Verwaltung → Vorschläge der Lehrkräfte (neben den Anfragen). */
export function ProposalsAdminPage() {
  useDocumentTitle('Vorschläge');
  const { data, setData, error, loading, reload } = useApi<Proposal[]>('/proposals');
  const [params, setze] = useSuchParameter();
  const filter = (params.get('status') as Filter | null) ?? 'offen';
  const highlight = params.get('offen');
  const [q, setQ] = useState('');

  const setFilter = (f: Filter) => setze({ status: f, offen: null });

  const counts = useMemo(() => {
    const c: Record<string, number> = { alle: data?.length ?? 0, offen: 0 };
    for (const p of data ?? []) {
      c[p.status] = (c[p.status] ?? 0) + 1;
      if (p.status === 'neu' || p.status === 'in_pruefung') c.offen++;
    }
    return c;
  }, [data]);

  const visible = useMemo(() => {
    const list = (data ?? [])
      .filter((p) => !!highlight || filter === 'alle' || (filter === 'offen' ? p.status === 'neu' || p.status === 'in_pruefung' : p.status === filter))
      .filter((p) => passtZurSuche([p.number, p.title, p.description, p.requesterEmail], q));
    return highlight ? [...list].sort((a, b) => Number(b.id === highlight) - Number(a.id === highlight)) : list;
  }, [data, filter, q, highlight]);

  const filters: { key: Filter; label: string }[] = [
    { key: 'offen', label: 'Offen' },
    { key: 'alle', label: 'Alle' },
    ...STATUSES.map((s) => ({ key: s as Filter, label: STATUS_LABELS[s] })),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Verwaltung"
        title="Vorschläge"
        description="Druckteile, die sich Lehrkräfte wünschen und die noch nicht im Katalog sind. Antworten sind für die Lehrkraft sichtbar."
      />
      <LadeFehler error={error} onRetry={() => void reload()} loading={loading} />
      {loading && !data && <Spinner />}
      {data && (
        <>
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center">
            <div role="group" aria-label="Nach Status filtern" className="flex flex-1 flex-wrap gap-2">
              {filters.map((f) => (
                <FilterKnopf key={f.key} label={f.label} count={counts[f.key] ?? 0} active={filter === f.key && !highlight} onClick={() => setFilter(f.key)} />
              ))}
            </div>
            <Suchfeld id="proposal-search" label="Vorschläge durchsuchen" value={q} onChange={setQ} placeholder="Suchen …" className="lg:w-72" />
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={Lightbulb} title={data.length === 0 ? 'Noch keine Vorschläge' : 'Keine passenden Vorschläge'}>
              {data.length === 0 ? 'Sobald eine Lehrkraft etwas vorschlägt, erscheint es hier.' : 'Anderen Filter oder Suchbegriff versuchen.'}
            </EmptyState>
          ) : (
            <ul className="space-y-5">
              {visible.map((p) => (
                <li key={p.id}>
                  <ProposalCard proposal={p} highlight={p.id === highlight} onChange={(u) => setData((list) => list?.map((x) => (x.id === u.id ? u : x)))} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
