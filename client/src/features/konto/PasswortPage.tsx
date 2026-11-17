import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { MIN_PASSWORT } from '@mosaik3lab/shared/konten';
import { useAuth } from '../../auth/AuthContext';
import { Logo } from '../../components/Logo';
import { Alert, Button, Field, Input, Spinner, Email } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useApi';

// Seite hinter dem Link aus der Mail (…/passwort#<token>): Passwort festlegen bzw. zurücksetzen, danach angemeldet.
// Das Token steht hinter „#“ und wird so nie an den Server übertragen oder protokolliert – nur im Rumpf der Anfragen.

interface LinkInfo {
  email: string;
  name: string;
  zweck: 'einrichten' | 'zuruecksetzen';
}

export function PasswortPage() {
  useDocumentTitle('Passwort festlegen');
  const { setPasswordWithLink } = useAuth();
  const [token] = useState(() => window.location.hash.replace(/^#/, ''));
  const [info, setInfo] = useState<LinkInfo>();
  const [linkError, setLinkError] = useState<string>();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; repeat?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setLinkError('Der Link ist unvollständig. Bitte öffnen Sie ihn direkt aus der E-Mail.');
      return;
    }
    api<LinkInfo>('/auth/passwort-link', { method: 'POST', body: { token }, silent401: true })
      .then(setInfo)
      .catch((err) => setLinkError(err instanceof ApiError ? err.message : 'Der Link konnte nicht geprüft werden.'));
  }, [token]);

  if (done) return <Navigate to="/login" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (password.length < MIN_PASSWORT) next.password = `Bitte mindestens ${MIN_PASSWORT} Zeichen.`;
    else if (password !== repeat) next.repeat = 'Die beiden Eingaben sind nicht gleich.';
    setErrors(next);
    setFormError(undefined);
    if (next.password || next.repeat) return;
    setSaving(true);
    try {
      await setPasswordWithLink(token, password);
      setDone(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Das Passwort konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  const einrichten = info?.zweck === 'einrichten';
  return (
    <main className="flex items-start justify-center px-4 py-6 sm:px-5 sm:py-12 lg:min-h-svh lg:items-center">
      <div className="w-full max-w-md">
        <div className="mb-6 sm:mb-10">
          <Logo />
        </div>
        <h1 className="text-titel font-bold tracking-tight text-stone-900 sm:text-[2rem]">{info && !einrichten ? 'Neues Passwort' : 'Passwort festlegen'}</h1>

        {!info && !linkError && <Spinner label="Link wird geprüft …" />}
        {linkError && (
          <div className="mt-6 space-y-5">
            <Alert kind="error">{linkError}</Alert>
            <p className="text-stone-700">
              Auf der Anmeldeseite können Sie unter „Passwort vergessen?“ einen neuen Link anfordern – oder Sie wenden sich an die
              Administration.
            </p>
            <Link to="/login" className="inline-flex min-h-11 items-center font-bold text-brand-800 underline">
              Zur Anmeldung
            </Link>
          </div>
        )}

        {info && (
          <form onSubmit={submit} noValidate className="mt-6 space-y-5">
            <p className="text-stone-700">
              {einrichten ? 'Sie haben zusätzliche Rechte bekommen. ' : ''}
              Für <strong><Email adresse={info.email} /></strong>. Das Passwort ist frei wählbar, mindestens {MIN_PASSWORT} Zeichen.
            </p>
            <input type="email" autoComplete="username" value={info.email} readOnly hidden />
            <Field label="Neues Passwort" required error={errors.password}>
              {({ id, describedBy, invalid }) => (
                <div className="relative">
                  <Input id={id} type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby={describedBy} invalid={invalid} className="pr-14" autoFocus />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    // volle Feldhöhe als Tippfläche (≥ 41 px); der durchsichtige Rand lässt den Feldrahmen auch beim Überfahren sichtbar
                    className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl border border-transparent bg-clip-padding text-stone-600 hover:bg-stone-100"
                    aria-label={show ? 'Passwort verbergen' : 'Passwort anzeigen'}
                    aria-pressed={show}
                  >
                    {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
                  </button>
                </div>
              )}
            </Field>
            <Field label="Passwort wiederholen" required error={errors.repeat}>
              {({ id, describedBy, invalid }) => (
                <Input id={id} type={show ? 'text' : 'password'} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-describedby={describedBy} invalid={invalid} />
              )}
            </Field>
            {formError && <Alert kind="error">{formError}</Alert>}
            <Button type="submit" size="lg" icon={KeyRound} loading={saving} className="w-full">
              Passwort speichern und anmelden
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
