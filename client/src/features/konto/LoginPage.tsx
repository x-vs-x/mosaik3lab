import { ArrowRight, Eye, EyeOff, LogIn, Pencil, ShieldCheck, UserPlus } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Logo, LogoMark, SchoolLogo, Wordmark } from '../../components/Logo';
import { Alert, Button, Field, Input, Email } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useConfig } from '../../lib/config';
import { cookiesWork } from '../../lib/cookies';
import { zielNachAnmeldung } from '../../lib/anmeldeZiel';
import { CookieHinweis } from './CookieHinweis';
import { useDocumentTitle } from '../../lib/useApi';

export function LoginPage() {
  useDocumentTitle('Anmelden');
  const { user, identify, login, register, sessionExpired, cookiesBlocked, checkError, can } = useAuth();
  // Schon vor dem Anmelden prüfen, ob der Browser Cookies für diese Adresse speichert (sonst sofort wieder abgemeldet).
  const [cookiesOk] = useState(cookiesWork);
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  // Schritt „password“ nur für Konten von Admin und Druck-Team; „unknown“ bietet Anlegen oder Korrigieren an.
  const [step, setStep] = useState<'email' | 'password' | 'unknown'>('email');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  // „Passwort vergessen?“ – danach nur ein Hinweis (die Antwort verrät nie, ob es ein Konto gibt).
  const [linkSent, setLinkSent] = useState(false);
  const demoMode = useConfig().config?.demoAccountsEnabled ?? false;

  // Nach der Anmeldung: Team/Admin in die Verwaltung, Lehrkräfte in den Katalog zum Bestellen
  // (bzw. jeweils zurück zur vorher aufgerufenen Seite, sofern sie dafür freigegeben ist).
  if (user) {
    // Druck-Team mit Einzelrechten ohne Übersicht: erste freigegebene Verwaltungsseite.
    return <Navigate to={zielNachAnmeldung(from, can)} replace />;
  }

  const run = async (action: () => Promise<void>) => {
    setError(undefined);
    setSubmitting(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Anmeldung fehlgeschlagen.');
    } finally {
      setSubmitting(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step === 'password') return run(() => login(email, password));
    return run(async () => {
      const result = await identify(email);
      // „signed-in“: Lehrkraft ist angemeldet – die Weiterleitung oben übernimmt.
      if (result !== 'signed-in') setStep(result);
    });
  };

  const changeEmail = () => {
    setStep('email');
    setPassword('');
    setError(undefined);
    setLinkSent(false);
  };

  const forgot = () =>
    run(async () => {
      await api('/auth/passwort-vergessen', { method: 'POST', body: { email }, silent401: true });
      setLinkSent(true);
    });

  // Tippfehler: zurück zum E-Mail-Feld, die Eingabe bleibt zum Bearbeiten stehen.
  const correctEmail = () => {
    changeEmail();
    requestAnimationFrame(() => emailRef.current?.select());
  };

  return (
    // Bildschirmhoch erst ab lg (zweispaltig). Darunter nur so hoch wie der Inhalt und oben ausgerichtet: Auf dem iPad legt
    // Safari die Tastatur über die Seite, statt sie zu verkleinern – eine bildschirmhohe, mittig ausgerichtete Seite ließe
    // sich dann ins Leere hinter der Tastatur scrollen.
    <div className="grid lg:min-h-svh lg:grid-cols-[1.05fr_1fr]">
      {/* Linke Seite: freundlicher Einstieg */}
      <section className="relative hidden overflow-hidden bg-brand-banner p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 grid grid-cols-3 gap-4 opacity-[0.12]">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="size-32 bg-white" />
          ))}
        </div>
        <div className="relative flex items-center gap-4">
          <span className="rounded-xl bg-white px-3 py-2.5">
            <LogoMark className="h-9 w-11" />
          </span>
          <Wordmark light className="text-[1.7rem] leading-none" />
        </div>
        <div className="relative max-w-lg">
          <p className="text-[2.6rem] font-bold leading-[1.1] tracking-tight">
            Hilfs- und Lehrmittel aus dem 3D-Drucker – passend für jede Schülerin und jeden Schüler.
          </p>
          <p className="mt-5 text-lg text-white/90">
            Der schulinterne Katalog für den 3D-Druck. Lehrkräfte stöbern und fragen Hilfs- und Lehrmittel ohne Anmeldung an –
            das 3D-Druck-Team kümmert sich um den Rest.
          </p>
          <div className="mt-10 inline-block bg-white px-6 py-5 shadow-xl">
            <SchoolLogo className="h-32 w-auto" />
          </div>
        </div>
        <p className="relative flex items-center gap-2 text-white/90">
          <ShieldCheck className="size-5" aria-hidden />
          Keine Schülerdaten · lokal gespeichert
        </p>
      </section>

      {/* Rechte Seite: Anmeldung */}
      <main className="flex items-start justify-center px-4 py-6 sm:px-10 sm:py-12 lg:items-center">
        <div className="w-full max-w-md">
          <div className="mb-6 sm:mb-10 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-titel font-bold tracking-tight text-stone-900 sm:text-[2rem]">Anmelden</h1>
          <p className="mt-2 text-stone-600">
            Mit Ihrer Schul-E-Mail. Lehrkräfte kommen danach direkt in den Katalog, das 3D-Druck-Team und die Verwaltung geben
            zusätzlich ihr Passwort ein.
          </p>
          {checkError && (
            <Alert kind="warning" className="mt-6">
              {checkError}
            </Alert>
          )}
          {(cookiesBlocked || !cookiesOk) && <CookieHinweis afterLogin={cookiesBlocked} />}
          {sessionExpired && !cookiesBlocked && (
            <Alert kind="warning" className="mt-6">
              Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.
            </Alert>
          )}

          {step === 'unknown' ? (
            <section className="mt-8 space-y-5" aria-labelledby="unknown-title" data-testid="login-unknown">
              <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 sm:p-5">
                <h2 id="unknown-title" className="text-abschnitt font-bold text-stone-900">
                  Diese E-Mail ist noch nicht im System.
                </h2>
                <p className="mt-3 text-hinweis text-stone-500">Eingegeben:</p>
                <p className="text-abschnitt font-bold text-stone-900 sm:text-xl" data-testid="login-unknown-email">
                  <Email adresse={email.trim()} />
                </p>
                <p className="mt-3 text-base text-stone-700">
                  Stimmt die Adresse? Dann legen Sie jetzt Ihren Zugang als Lehrkraft an – ohne Passwort. Gespeichert
                  wird nur Ihre Schul-E-Mail, keine Schülerdaten.
                </p>
              </div>

              {error && (
                <div data-testid="login-error">
                  <Alert kind="error">{error}</Alert>
                </div>
              )}

              <Button
                type="button"
                size="lg"
                icon={UserPlus}
                loading={submitting}
                onClick={() => run(() => register(email))}
                className="w-full"
                data-testid="login-register"
              >
                Jetzt Konto anlegen
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                icon={Pencil}
                onClick={correctEmail}
                className="w-full"
                data-testid="login-correct-email"
              >
                E-Mail korrigieren
              </Button>
            </section>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
              <Field label="E-Mail" required>
                {({ id }) => (
                  <div className="relative">
                    <Input
                      ref={emailRef}
                      id={id}
                      name="email"
                      type="email"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={email}
                      readOnly={step === 'password'}
                      onChange={(e) => setEmail(e.target.value)}
                      className={step === 'password' ? 'bg-stone-50 pr-28' : undefined}
                      required
                      autoFocus
                      data-testid="login-email"
                    />
                    {step === 'password' && (
                      <button
                        type="button"
                        onClick={changeEmail}
                        // volle Feldhöhe als Tippfläche (≥ 41 px), bündig am rechten Rand; der durchsichtige Rand lässt den Feldrahmen auch beim Überfahren sichtbar
                        className="absolute inset-y-0 right-0 rounded-r-xl border border-transparent bg-clip-padding px-4 text-hinweis font-bold text-brand-800 hover:bg-stone-100"
                        data-testid="login-change-email"
                      >
                        Ändern
                      </button>
                    )}
                  </div>
                )}
              </Field>

              {step === 'password' && (
                <Field label="Passwort" required>
                  {({ id }) => (
                    <div className="relative">
                      <Input
                        id={id}
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pr-14"
                        required
                        autoFocus
                        data-testid="login-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl border border-transparent bg-clip-padding text-stone-600 hover:bg-stone-100"
                        aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
                      </button>
                    </div>
                  )}
                </Field>
              )}

              {error && (
                <div data-testid="login-error">
                  <Alert kind="error">{error}</Alert>
                </div>
              )}
              {linkSent && (
                <Alert kind="info" title="E-Mail ist unterwegs">
                  Falls zu dieser Adresse ein Konto mit Passwort besteht, kommt gleich eine E-Mail mit einem Link zum
                  Zurücksetzen (24 Stunden gültig). Keine Mail bekommen? Bitte an die Administration wenden.
                </Alert>
              )}

              <Button
                type="submit"
                size="lg"
                icon={step === 'password' ? LogIn : ArrowRight}
                loading={submitting}
                disabled={!email.trim() || (step === 'password' && !password)}
                className="w-full"
                data-testid={step === 'password' ? 'login-submit' : 'login-next'}
              >
                {step === 'password' ? 'Anmelden' : 'Weiter'}
              </Button>
              {step === 'password' && !linkSent && (
                <button type="button" onClick={forgot} disabled={submitting} className="min-h-11 w-full rounded-xl font-bold text-brand-800 hover:bg-stone-100" data-testid="login-forgot">
                  Passwort vergessen?
                </button>
              )}
            </form>
          )}

          {demoMode && (
            <Alert kind="info" title="Lokaler Entwicklungsmodus" className="mt-8">
              Demo-Zugänge für Administration und 3D-Druck-Team sind aktiv. Die Zugangsdaten und Beispiel-Adressen
              von Lehrkräften stehen in der README.md des Projekts.
            </Alert>
          )}
        </div>
      </main>
    </div>
  );
}
