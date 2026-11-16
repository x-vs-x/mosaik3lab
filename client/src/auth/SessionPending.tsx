import { RotateCw } from 'lucide-react';
import { Alert, Button, Spinner } from '../components/ui';
import { useConfig } from '../lib/config';
import { useAuth } from './AuthContext';

/** Anzeige, solange die Anmeldung beim Start geprüft wird – oder wenn der Server dabei nicht antwortet. */
export function SessionPending() {
  const { checkError, retrying, retry } = useAuth();
  const { config, error: configError } = useConfig();
  if (checkError) {
    // Fehlen auch die Grunddaten, steht der Hinweis schon oben im Layout (mit „Erneut versuchen“) – nicht doppelt.
    if (configError && !config) return null;
    return (
      <div className="mx-auto max-w-lg px-5 py-12" data-testid="session-check-error">
        <Alert kind="warning" title="Anmeldung konnte nicht geprüft werden">
          {checkError}
        </Alert>
        <Button icon={RotateCw} onClick={retry} className="mt-4">
          Erneut versuchen
        </Button>
      </div>
    );
  }
  return <Spinner label={retrying ? 'Server antwortet nicht – neuer Versuch …' : 'Anmeldung wird geprüft …'} />;
}
