import { Compass, LayoutGrid, Lock } from 'lucide-react';
import { EmptyState, LinkButton } from './ui';
import { useDocumentTitle } from '../lib/useApi';

export function NotFoundPage() {
  useDocumentTitle('Seite nicht gefunden');
  return (
    <EmptyState
      icon={Compass}
      title="Seite nicht gefunden"
      headingLevel="h1"
      action={
        <LinkButton to="/katalog" icon={LayoutGrid}>
          Zum Katalog
        </LinkButton>
      }
    >
      Die aufgerufene Adresse gibt es nicht (mehr).
    </EmptyState>
  );
}

export function ForbiddenPage() {
  useDocumentTitle('Kein Zugriff');
  return (
    <EmptyState
      icon={Lock}
      title="Kein Zugriff"
      headingLevel="h1"
      action={
        <LinkButton to="/katalog" icon={LayoutGrid}>
          Zum Katalog
        </LinkButton>
      }
    >
      Für diesen Bereich fehlt Ihrem Konto die Berechtigung. Wenden Sie sich bei Bedarf an die Administration.
    </EmptyState>
  );
}
