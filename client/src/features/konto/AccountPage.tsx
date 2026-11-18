import { ClipboardList, KeyRound, LogOut } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Alert, Badge, Button, Card, Field, Input, LinkButton, PageHeader, Email } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { ROLE_LABELS } from '../../lib/constants';
import { formatDateTime } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useApi';
import { MIN_PASSWORT } from '@mosaik3lab/shared/werte/konten';

export function AccountPage() {
  useDocumentTitle('Mein Konto');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (!user) return null;
  // Lehrkräfte haben kein Konto und kein Passwort – nur ihre Anfragen.
  const isTeacher = user.role === 'lehrkraft';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== repeat) {
      setErrors({ repeat: 'Die Passwörter stimmen nicht überein' });
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      await api('/auth/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      toast('success', 'Ihr Passwort wurde geändert.');
      setCurrent('');
      setNext('');
      setRepeat('');
    } catch (err) {
      if (err instanceof ApiError) setErrors({ ...err.fields, _: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Mein Konto" />
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-4 sm:p-7">
          <h2 className="text-abschnitt font-bold text-stone-900 sm:text-xl">{user.displayName}</h2>
          <dl className="mt-5 space-y-3">
            <div>
              <dt className="text-hinweis text-stone-500">E-Mail</dt>
              <dd className="font-bold">
                <Email adresse={user.email} />
              </dd>
            </div>
            {user.username && (
              <div>
                <dt className="text-hinweis text-stone-500">Benutzername</dt>
                <dd className="font-bold">{user.username}</dd>
              </div>
            )}
            <div>
              <dt className="text-hinweis text-stone-500">Rolle</dt>
              <dd className="mt-1">
                <Badge className="bg-brand-50 text-brand-800 ring-brand-200">{ROLE_LABELS[user.role]}</Badge>
                {user.isDemo && <Badge className="ml-2 bg-amber-50 text-amber-900 ring-amber-300">Demo-Zugang</Badge>}
              </dd>
            </div>
            {user.lastLoginAt && (
              <div>
                <dt className="text-hinweis text-stone-500">Letzte Anmeldung</dt>
                <dd className="font-bold">{formatDateTime(user.lastLoginAt)}</dd>
              </div>
            )}
          </dl>
          <Button
            variant="secondary"
            icon={LogOut}
            className="mt-8"
            onClick={async () => {
              try {
                await logout();
                navigate('/login', { replace: true });
              } catch {
                toast('error', 'Abmelden hat nicht geklappt – bitte erneut versuchen.');
              }
            }}
          >
            Abmelden
          </Button>
        </Card>

        {isTeacher ? (
          <Card as="section" className="p-4 sm:p-7">
            <h2 className="flex items-center gap-2 text-abschnitt font-bold text-stone-900 sm:text-xl">
              <ClipboardList className="size-5 text-brand-700" aria-hidden />
              Ihre Anfragen
            </h2>
            <p className="mt-3 text-stone-700">
              Sie sind mit Ihrer Schul-E-Mail angemeldet – ohne Passwort. Unter „Meine Anfragen“ sehen Sie alle
              Druckteile, die Sie mit dieser Adresse angefragt haben.
            </p>
            <LinkButton to="/anfragen" icon={ClipboardList} className="mt-6">
              Meine Anfragen
            </LinkButton>
          </Card>
        ) : (
          <Card as="section" className="p-4 sm:p-7">
            <h2 className="flex items-center gap-2 text-abschnitt font-bold text-stone-900 sm:text-xl">
              <KeyRound className="size-5 text-brand-700" aria-hidden />
              Passwort ändern
            </h2>
            <form onSubmit={submit} className="mt-5 space-y-5" noValidate>
              <Field label="Aktuelles Passwort" required error={errors.currentPassword}>
                {({ id, describedBy, invalid }) => (
                  <Input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} aria-describedby={describedBy} invalid={invalid} />
                )}
              </Field>
              <Field label="Neues Passwort" required hint={`Frei wählbar, mindestens ${MIN_PASSWORT} Zeichen.`} error={errors.newPassword}>
                {({ id, describedBy, invalid }) => (
                  <Input id={id} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-describedby={describedBy} invalid={invalid} />
                )}
              </Field>
              <Field label="Neues Passwort wiederholen" required error={errors.repeat}>
                {({ id, describedBy, invalid }) => (
                  <Input id={id} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-describedby={describedBy} invalid={invalid} />
                )}
              </Field>
              {errors._ && <Alert kind="error">{errors._}</Alert>}
              <Button type="submit" loading={saving} disabled={!current || !next || !repeat} className="w-full sm:w-auto">
                Passwort speichern
              </Button>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
