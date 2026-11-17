import { Save, Server, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { AnfrageAblaufSection } from './AnfrageAblaufSection';
import { ListEditor } from '../../components/ListEditor';
import { useToast } from '../../components/Toast';
import { ActionBar, Alert, Button, buttonClass, Field, PageHeader, Panel, Spinner, Stack, Switch } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { withBase } from '../../lib/basePath';
import { useConfig } from '../../lib/config';
import { formatDateTime } from '../../lib/format';
import type { AdminSettings } from '../../lib/types';
import { useApi, useDocumentTitle } from '../../lib/useApi';

export function SettingsPage() {
  useDocumentTitle('Einstellungen');
  const { data, setData, error, loading } = useApi<AdminSettings>('/admin/settings');
  const { user } = useAuth();

  return (
    <>
      <PageHeader
        eyebrow="Einstellungen"
        title="Einstellungen"
        description="Anfrageformular, Ablauf der Anfragen und Schalter für spätere Funktionen. Betrieb (Mailserver, Sicherungen, Ordner, Updates) regelt der Server-Manager."
      />
      {error && <Alert kind="error">{error.message}</Alert>}
      {loading && !data && <Spinner />}
      {data && (
        <Stack>
          {user?.role === 'admin' && <ManagerSection settings={data} />}
          <OrderFormSection settings={data} onSaved={setData} />
          <AnfrageAblaufSection />
          <FeaturesSection settings={data} onSaved={setData} />
        </Stack>
      )}
    </>
  );
}

type SectionProps = { settings: AdminSettings; onSaved: (s: AdminSettings) => void };

function errorText(err: unknown, fallback = 'Speichern fehlgeschlagen.') {
  return err instanceof ApiError ? err.message : fallback;
}

// ---------------------------------------------------------------------------------
// Server-Manager (nur Administratoren; gleiche Anmeldung wie hier)

function ManagerSection({ settings }: { settings: AdminSettings }) {
  // Nur wenn etwas zu tun ist: Mailversand fehlerhaft oder zuletzt gescheitert – eingerichtet wird er im Server-Manager.
  const mailProblem =
    settings.mail.state === 'invalid'
      ? 'Die Mail-Einstellungen sind fehlerhaft – es werden keine E-Mails verschickt.'
      : settings.mailStatus && !settings.mailStatus.ok
        ? `Der letzte Mailversand ist fehlgeschlagen (${formatDateTime(settings.mailStatus.at)}).`
        : null;
  const [port, setPort] = useState(5190);
  useEffect(() => {
    // Port des Notzugangs vom Manager selbst (über <pfad>/manager); antwortet er nicht, bleibt der Standard.
    fetch(withBase('/manager/api/auth'), { credentials: 'same-origin', signal: AbortSignal.timeout(5000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((a: { managerPort?: number } | null) => a?.managerPort && setPort(a.managerPort))
      .catch(() => {});
  }, []);
  return (
    <Panel
      icon={Server}
      title="Server-Manager"
      description="Betrieb: Dienste, Sicherungen, Updates, Netzwerk, Mailserver und Ordner. Gleiche Anmeldung wie hier."
    >
      {mailProblem && (
        <Alert kind="warning" className="mb-4" title="E-Mail">
          {mailProblem} Bitte im Server-Manager unter „E-Mail“ prüfen.
        </Alert>
      )}
      <a href={withBase('/manager/')} className={buttonClass('primary')} data-testid="open-manager">
        <Server className="size-5 shrink-0" aria-hidden />
        Server-Manager öffnen
      </a>
      <p className="mt-3 text-hinweis text-stone-600" data-testid="manager-emergency">
        Notzugang: Läuft die App einmal nicht, öffnen Sie den Server-Manager direkt am Server unter http://127.0.0.1:{port} –
        mit demselben Administrator-Login.
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------
// Anfrageformular

function OrderFormSection({ settings, onSaved }: SectionProps) {
  const { reload } = useConfig();
  const toast = useToast();
  const [domains, setDomains] = useState(settings.orderForm.allowedEmailDomains);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  const dirty = JSON.stringify(domains) !== JSON.stringify(settings.orderForm.allowedEmailDomains);

  const normalize = (values: string[]) =>
    [...new Set(values.map((v) => v.trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];

  const save = async () => {
    setSaving(true);
    setFormError(undefined);
    try {
      const saved = await api<AdminSettings>('/admin/settings/orderform', {
        method: 'PUT',
        body: { allowedEmailDomains: domains },
      });
      onSaved(saved);
      setDomains(saved.orderForm.allowedEmailDomains);
      await reload();
      toast('success', 'Anfrageformular gespeichert.');
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      icon={ShieldCheck}
      title="Anfrageformular"
      footer={
        <ActionBar
          hint={dirty ? 'Ungespeicherte Änderungen' : undefined}
          primary={
            <Button icon={Save} loading={saving} disabled={!dirty} onClick={save}>
              Anfrageformular speichern
            </Button>
          }
        />
      }
      description="Lehrkräfte geben beim Anfragen ihre Schul-E-Mail an. Hier legen Sie fest, welche Adressen angenommen werden."
    >
      <Field label="Erlaubte E-Mail-Domains" hint="Nur der Teil nach dem @, z. B. mosaikschule-lu.de. Eingabe mit Enter bestätigen.">
        {({ id, describedBy }) => (
          <ListEditor
            id={id}
            values={domains}
            onChange={(v) => setDomains(normalize(v))}
            placeholder="mosaikschule-lu.de"
            describedBy={describedBy}
            itemLabel="Domain"
          />
        )}
      </Field>
      {domains.length === 0 && (
        <Alert kind="warning" className="mt-4" title="Alle E-Mail-Adressen erlaubt">
          Ohne Einschränkung kann jede beliebige E-Mail-Adresse Anfragen stellen. Tragen Sie mindestens die Schul-Domain ein.
        </Alert>
      )}
      {formError && <Alert kind="error" className="mt-4">{formError}</Alert>}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------
// Für später

function FeaturesSection({ settings, onSaved }: SectionProps) {
  const { reload } = useConfig();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const toggle = async (requesterTracking: boolean) => {
    setSaving(true);
    try {
      const saved = await api<AdminSettings>('/admin/settings/features', { method: 'PUT', body: { requesterTracking } });
      onSaved(saved);
      await reload();
      toast('success', requesterTracking ? 'Statusanzeige für Lehrkräfte eingeschaltet.' : 'Statusanzeige für Lehrkräfte ausgeschaltet.');
    } catch (err) {
      toast('error', errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel icon={Sparkles} title="Für später" description="Funktionen, die vorbereitet, aber derzeit nicht vorgesehen sind.">
      <Switch
        checked={settings.features.requesterTracking}
        onChange={toggle}
        disabled={saving}
        label="Lehrkräfte sehen den Bearbeitungsstand"
        description="Derzeit nicht vorgesehen – das Druck-Team bringt fertige Druckteile persönlich vorbei. Eingeschaltet erscheint „Meine Anfragen“ mit Status für Lehrkräfte."
      />
    </Panel>
  );
}
