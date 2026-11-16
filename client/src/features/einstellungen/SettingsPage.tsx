import { CircleAlert, CircleCheck, FolderOpen, Mail, Save, Server, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { AnfrageAblaufSection } from './AnfrageAblaufSection';
import { ListEditor } from '../../components/ListEditor';
import { useToast } from '../../components/Toast';
import { ActionBar, Alert, Button, buttonClass, cx, Field, PageHeader, Panel, Spinner, Stack, Switch } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { withBase } from '../../lib/basePath';
import { useConfig } from '../../lib/config';
import { formatDateTime } from '../../lib/format';
import type { AdminSettings, PathSet } from '../../lib/types';
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
        description="E-Mail-Benachrichtigung, Anfrageformular, Ablauf der Anfragen, Ablagepfade und Schalter für spätere Funktionen."
      />
      {error && <Alert kind="error">{error.message}</Alert>}
      {loading && !data && <Spinner />}
      {data && (
        <Stack>
          {user?.role === 'admin' && <ManagerSection />}
          <MailSection settings={data} />
          <OrderFormSection settings={data} onSaved={setData} />
          <AnfrageAblaufSection />
          <PathsSection settings={data} />
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

function ManagerSection() {
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
      description="Betrieb: Dienste, Sicherungen, Updates, Adresse, Mailserver und Pfade. Gleiche Anmeldung wie hier."
    >
      <a href={withBase('/manager/')} className={buttonClass('primary')} data-testid="open-manager">
        <Server className="size-5 shrink-0" aria-hidden />
        Server-Manager öffnen
      </a>
      <p className="mt-3 text-stone-600" data-testid="manager-emergency">
        Notzugang: Läuft die App einmal nicht, öffnen Sie den Server-Manager direkt am Server unter http://127.0.0.1:{port} –
        mit demselben Administrator-Login.
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------
// E-Mail

function MailSection({ settings }: { settings: AdminSettings }) {
  const { mail, mailStatus: status } = settings;
  const line = {
    active: { ok: true, text: `aktiv an ${mail.recipients} Empfänger` },
    disabled: { ok: false, text: 'eingerichtet, aber ausgeschaltet' },
    missing: { ok: false, text: 'nicht eingerichtet' },
    invalid: { ok: false, text: 'Konfiguration fehlerhaft – es werden keine E-Mails versendet' },
  }[mail.state];

  return (
    <Panel
      icon={Mail}
      title="E-Mail-Benachrichtigung"
      description="Bei jeder neuen Anfrage geht eine E-Mail mit allen Angaben und einem Link zur Anfrage an die hinterlegten Empfänger. Mailserver, Absender und Empfänger werden im Server-Manager eingerichtet."
    >
      <div
        role="status"
        className={cx(
          'flex items-start gap-3 rounded-2xl border p-4',
          line.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-stone-200 bg-stone-50 text-stone-900',
        )}
      >
        {line.ok ? <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />}
        <div className="text-[0.95rem]">
          <p>
            <span className="font-bold">Benachrichtigung bei neuen Anfragen: {line.text}</span>
            {' · '}
            {mail.state === 'missing' ? 'bitte im Server-Manager einrichten' : 'eingerichtet im Server-Manager'}
          </p>
          {mail.state === 'invalid' && mail.error && <p className="mt-0.5 break-words">{mail.error}</p>}
        </div>
      </div>

      {status && (
        <div
          className={cx(
            'mt-4 flex items-start gap-3 rounded-2xl border p-4',
            status.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-rose-200 bg-rose-50 text-rose-950',
          )}
        >
          {status.ok ? (
            <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          ) : (
            <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          )}
          <div className="text-[0.95rem]">
            <p className="font-bold">
              Letzter Versand {status.ok ? 'erfolgreich' : 'fehlgeschlagen'} ·{' '}
              <time dateTime={status.at} className="font-normal">
                {formatDateTime(status.at)}
              </time>
            </p>
            {status.message && <p className="mt-0.5 break-words">{status.message}</p>}
          </div>
        </div>
      )}
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
// Ablagepfade (nur Anzeige – eingestellt werden sie im Server-Manager)

const PATH_FIELDS: { key: keyof PathSet; label: string; hint: string }[] = [
  { key: 'dbFile', label: 'Datenbank', hint: 'Druckteile, Anfragen, Konten, Stammdaten und Einstellungen (SQLite).' },
  { key: 'ablageDir', label: 'Dateiablage', hint: 'Bilder, Druckdateien und Videos – je Druckteil ein eigener Ordner.' },
  { key: 'storageDir', label: 'Datenordner', hint: 'Enthält außerdem Mail-Einstellungen und die früheren JSON-Dateien (Sicherung).' },
];

function PathsSection({ settings }: { settings: AdminSettings }) {
  return (
    <Panel
      icon={FolderOpen}
      title="Ablagepfade"
      description="Wo der Server Daten und Dateien speichert. Geändert werden die Pfade im Server-Manager (Einstellungen), nicht hier."
    >
      <dl className="space-y-4">
        {PATH_FIELDS.map((f) => (
          <div key={f.key}>
            <dt className="font-semibold text-stone-900">{f.label}</dt>
            <dd className="mt-1">
              <code className="break-all rounded bg-stone-100 px-1.5 py-0.5 text-[0.95rem] text-stone-800">{settings.paths[f.key]}</code>
              <p className="mt-1 text-stone-600">{f.hint}</p>
            </dd>
          </div>
        ))}
      </dl>
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
