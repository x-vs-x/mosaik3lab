import { Lightbulb, Plus } from 'lucide-react';
import { LadeFehler } from '../../components/Listenwerkzeug';
import { Alert, Card, EmptyState, LinkButton, PageHeader, Spinner } from '../../components/ui';
import { formatDate } from '../../lib/format';
import { useApi, useDocumentTitle } from '../../lib/useApi';
import { PhotoGrid, ProposalStatusBadge, SafeLinks, URGENCY_LABELS, type OwnProposal } from './proposals';

/** „Meine Vorschläge“: eigene Vorschläge der angemeldeten Lehrkraft mit Status und Antwort des Teams. */
export function MyProposalsPage() {
  useDocumentTitle('Meine Vorschläge');
  const { data, error, loading, reload } = useApi<OwnProposal[]>('/proposals/mine');

  return (
    <>
      <PageHeader
        eyebrow="Mosaik³LAB"
        title="Meine Vorschläge"
        description="Druckteile, die Sie vorgeschlagen haben – mit dem aktuellen Stand und der Antwort des 3D-Druck-Teams."
        actions={
          <LinkButton to="/vorschlag/neu" icon={Plus}>
            Etwas vorschlagen
          </LinkButton>
        }
      />
      <LadeFehler error={error} onRetry={() => void reload()} loading={loading} />
      {loading && !data && <Spinner />}
      {data && data.length === 0 && (
        <EmptyState icon={Lightbulb} title="Noch kein Vorschlag" action={<LinkButton to="/vorschlag/neu" icon={Plus}>Etwas vorschlagen</LinkButton>}>
          Fehlt im Katalog ein Druckteil? Schlagen Sie es dem 3D-Druck-Team vor.
        </EmptyState>
      )}
      {data && data.length > 0 && (
        <ul className="space-y-5">
          {data.map((p) => (
            <li key={p.id}>
              <Card as="article" className="space-y-4 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-hinweis font-bold text-stone-600">
                      {p.number} · eingereicht am {formatDate(p.createdAt)}
                    </p>
                    <h2 className="text-abschnitt font-bold text-stone-900 sm:text-xl">{p.title}</h2>
                  </div>
                  <ProposalStatusBadge status={p.status} />
                </div>
                <p className="whitespace-pre-line text-stone-700">{p.description}</p>
                {p.usage && (
                  <p className="text-stone-700">
                    <strong>Einsatz:</strong> {p.usage}
                  </p>
                )}
                <p className="text-base text-stone-600">
                  Menge: {p.quantity} · Dringlichkeit: {URGENCY_LABELS[p.urgency]}
                </p>
                <SafeLinks links={p.links} />
                <PhotoGrid proposalId={p.id} photos={p.photos} />
                {p.reply && (
                  <Alert kind="info" title="Antwort des 3D-Druck-Teams">
                    <span className="whitespace-pre-line">{p.reply}</span>
                  </Alert>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
