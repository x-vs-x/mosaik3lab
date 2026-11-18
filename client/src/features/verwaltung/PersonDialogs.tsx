import { Check, Copy, Save, Trash2 } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { BEREICHE, ROLE_LABELS, ROLE_SAETZE, ROLES, STANDARD_BEREICHE, TEAM_BEREICHE } from '@mosaik3lab/shared/werte/konten';
import { Dialog } from '../../components/Dialog';
import { Alert, Button, cx, Field, Input } from '../../components/ui';
import { api, ApiError, fehlerText } from '../../lib/api';
import { ersteFehlerstelle } from '../../lib/fokus';
import { BASE_PATH } from '../../lib/basePath';
import type { EmailEingabe, PersonInput } from '@mosaik3lab/shared/konten';
import type { Bereich, PasswortLinkErgebnis, Person, PersonGespeichert, Role } from '../../lib/types';

// Dialoge der Seite „Personen“: Rechte ändern (auch Person hinzufügen), Person entfernen und Link zum Weitergeben.

const LEHRKRAFT_HAEKCHEN = BEREICHE.filter((b) => b.fuer === 'lehrkraft');
const TEAM_HAEKCHEN = BEREICHE.filter((b) => b.fuer === 'druckteam');
const TEAM_STANDARD = STANDARD_BEREICHE.filter((b) => TEAM_BEREICHE.includes(b));

/** Neue Person: Lehrkraft mit beiden Lehrkraft-Häkchen. */
const NEU: Person = { email: '', name: '', role: 'lehrkraft', bereiche: ['anfragen', 'vorschlaege'], passwort: null, isDemo: false, lastLoginAt: null, orderCount: 0, lastOrderAt: '' };

function Haekchen({ id, label, satz, checked, onChange }: { id: string; label: string; satz: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <li>
      {/* Ganze Zeile (Kästchen + Text) ist eine Tippfläche, mind. 44 px hoch; der Fokusrahmen liegt um die ganze Zeile. */}
      <label
        htmlFor={id}
        className="-mx-2 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-stone-100 has-focus-visible:outline-3 has-focus-visible:outline-offset-0 has-focus-visible:outline-stone-900"
      >
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={`${id}-d`} className="mt-0.5 size-6 shrink-0 cursor-pointer accent-brand-700 focus-visible:outline-none" />
        <span className="min-w-0">
          <span className="font-bold text-stone-900">{label}</span>
          <span id={`${id}-d`} className="block text-hinweis text-stone-600">
            {satz}
          </span>
        </span>
      </label>
    </li>
  );
}

/** Rolle und Häkchen einer Person; `person` ohne E-Mail = neue Person. */
export function RechteDialog({
  person,
  isMe,
  onClose,
  onSaved,
}: {
  person?: Person;
  isMe: boolean;
  onClose: () => void;
  onSaved: (result: PersonGespeichert) => void;
}) {
  const baseId = useId();
  const [form, setForm] = useState<Person>(NEU);
  const [openedFor, setOpenedFor] = useState<Person>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  // Beim Öffnen vorbelegen.
  if (person && person !== openedFor) {
    setOpenedFor(person);
    setForm(person.email ? person : NEU);
    setErrors({});
    setFormError(undefined);
  }
  if (!person && openedFor) setOpenedFor(undefined);

  const neu = !person?.email;
  const hat = (b: Bereich) => form.bereiche.includes(b);
  const setze = (b: Bereich, on: boolean) => setForm((f) => ({ ...f, bereiche: on ? [...f.bereiche, b] : f.bereiche.filter((x) => x !== b) }));
  const setRole = (role: Role) =>
    setForm((f) => {
      // Neu im Druck-Team: die üblichen Häkchen vorbelegen.
      const bereiche = role === 'druckteam' && !f.bereiche.some((b) => TEAM_BEREICHE.includes(b)) ? [...f.bereiche, ...TEAM_STANDARD] : f.bereiche;
      return { ...f, role, bereiche };
    });

  // Wer neu mehr als Lehrkraft-Rechte bekommt und noch kein Passwort hat, bekommt eine Mail.
  const bekommtMail = form.role !== 'lehrkraft' && (neu || person?.role === 'lehrkraft');
  const verliertPasswort = form.role === 'lehrkraft' && !!person?.passwort;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const formular = e.currentTarget as HTMLFormElement;
    setSaving(true);
    setErrors({});
    setFormError(undefined);
    try {
      const bereiche = form.bereiche.filter((b) => form.role === 'druckteam' || !TEAM_BEREICHE.includes(b));
      const name = form.name && form.name !== form.email ? form.name : undefined;
      onSaved(await api<PersonGespeichert>('/personen', { method: 'PUT', body: { email: form.email, name, role: form.role, bereiche } satisfies PersonInput }));
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(err.message);
        // Zum ersten markierten Feld (z. B. ungültige E-Mail), sobald die Fehler gezeichnet sind.
        requestAnimationFrame(() => ersteFehlerstelle<HTMLElement>(formular)?.focus());
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!person} onClose={onClose} title={neu ? 'Person hinzufügen' : 'Rechte ändern'} description={neu ? undefined : person?.email}>
      <form onSubmit={submit} noValidate className="space-y-6">
        {neu && (
          <Field label="Schul-E-Mail" required hint="Mit dieser Adresse meldet sich die Person an." error={errors.email}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="email"
                autoCapitalize="none"
                spellCheck={false}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                aria-describedby={describedBy}
                invalid={invalid}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- bewusst: einziges Feld der Seite bzw. des Dialogs, spart Tab-Wege
                autoFocus
              />
            )}
          </Field>
        )}

        <fieldset>
          <legend className="mb-2 font-bold text-stone-900">Was ist die Person?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {ROLES.slice()
              .reverse()
              .map((r) => {
                const id = `${baseId}-rolle-${r}`;
                const gesperrt = isMe && r !== 'admin';
                return (
                  <label
                    key={r}
                    htmlFor={id}
                    className={cx(
                      'flex cursor-pointer flex-col gap-1 rounded-2xl p-4 ring-1',
                      form.role === r ? 'bg-brand-50 ring-2 ring-brand-700' : 'bg-white ring-stone-200 hover:bg-stone-50',
                      gesperrt && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <span className="flex items-center gap-2 font-bold text-stone-900">
                      <input id={id} type="radio" name={`${baseId}-rolle`} checked={form.role === r} disabled={gesperrt} onChange={() => setRole(r)} className="size-5 accent-brand-700" />
                      {ROLE_LABELS[r]}
                    </span>
                    <span className="text-hinweis text-stone-600">{ROLE_SAETZE[r]}</span>
                  </label>
                );
              })}
          </div>
          {isMe && <p className="mt-2 text-hinweis text-stone-600">Die eigene Administratorrolle können Sie sich nicht selbst entziehen.</p>}
        </fieldset>

        {form.role !== 'lehrkraft' && (
          <Field label="Name" hint="So erscheint die Person z. B. im Verlauf einer Anfrage." error={errors.name}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} value={form.name === form.email ? '' : form.name} placeholder={form.email.split('@')[0]} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-describedby={describedBy} invalid={invalid} />
            )}
          </Field>
        )}

        <fieldset className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
          <legend className="sr-only">Als Lehrkraft</legend>
          <p aria-hidden className="mb-3 text-hinweis font-bold uppercase tracking-wide text-stone-500">
            Als Lehrkraft
          </p>
          <ul className="space-y-1">
            {LEHRKRAFT_HAEKCHEN.map((b) => (
              <Haekchen key={b.key} id={`${baseId}-${b.key}`} label={b.label} satz={b.satz} checked={hat(b.key)} onChange={(v) => setze(b.key, v)} />
            ))}
          </ul>
        </fieldset>

        {form.role === 'druckteam' && (
          <fieldset className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
            <legend className="sr-only">Im 3D-Druck-Team</legend>
            <p aria-hidden className="mb-3 text-hinweis font-bold uppercase tracking-wide text-stone-500">
              Im 3D-Druck-Team
            </p>
            <ul className="space-y-1">
              {TEAM_HAEKCHEN.map((b) => (
                <Haekchen key={b.key} id={`${baseId}-${b.key}`} label={b.label} satz={b.satz} checked={hat(b.key)} onChange={(v) => setze(b.key, v)} />
              ))}
            </ul>
          </fieldset>
        )}
        {form.role === 'admin' && <Alert>Administratoren dürfen alles: Druckteile, Anfragen, Vorschläge, Stammdaten, Einstellungen und Personen.</Alert>}

        {bekommtMail && (
          <Alert kind="info" title="Passwort per E-Mail">
            Nach dem Speichern bekommt die Person eine E-Mail mit einem Link, um ihr Passwort festzulegen. Bis dahin meldet sie
            sich weiter ohne Passwort als Lehrkraft an.
          </Alert>
        )}
        {verliertPasswort && <Alert kind="warning">Das Passwort wird nicht mehr gebraucht: Die Person meldet sich wieder nur mit ihrer Schul-E-Mail an.</Alert>}

        {formError && <Alert kind="error">{formError}</Alert>}
        <div className="flex flex-col-reverse gap-3 border-t border-stone-100 pt-5 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" icon={Save} loading={saving} disabled={neu && !form.email.trim()}>
            Speichern
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Person entfernen – mit Bestätigung. Anfragen und Vorschläge bleiben erhalten, die E-Mail wird wieder frei. */
export function EntfernenDialog({ person, onClose, onRemoved }: { person?: Person; onClose: () => void; onRemoved: (p: Person) => void }) {
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const close = () => {
    if (busy) return;
    setFehler(undefined);
    onClose();
  };
  const entfernen = async () => {
    if (!person) return;
    setBusy(true);
    setFehler(undefined);
    try {
      await api('/personen/entfernen', { method: 'POST', body: { email: person.email } satisfies EmailEingabe });
      onRemoved(person);
    } catch (err) {
      setFehler(fehlerText(err, 'Entfernen fehlgeschlagen.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!person} onClose={close} title="Person entfernen?" description={person?.email} size="sm">
      <div className="space-y-5">
        <p className="text-base text-stone-700">
          <strong>{person?.name}</strong> verliert alle Rechte und wird sofort abgemeldet.
          {person?.passwort && ' Das Passwort gilt nicht mehr.'}
        </p>
        <Alert kind="info">
          Anfragen und Vorschläge dieser Person bleiben erhalten und sichtbar. Meldet sie sich später wieder an, beginnt sie
          neu als Lehrkraft.
        </Alert>
        {fehler && <Alert kind="error">{fehler}</Alert>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Abbrechen
          </Button>
          <Button variant="danger" icon={Trash2} loading={busy} onClick={entfernen}>
            Entfernen
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Mail konnte nicht verschickt werden: Link anzeigen, damit der Administrator ihn weitergibt. */
export function LinkDialog({ email, ergebnis, onClose }: { email?: string; ergebnis?: PasswortLinkErgebnis; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [manuell, setManuell] = useState(false);
  const feld = useRef<HTMLInputElement>(null);
  const url = ergebnis?.token ? `${window.location.origin}${BASE_PATH}/passwort#${ergebnis.token}` : '';
  const copy = async () => {
    try {
      // Ohne HTTPS (z. B. http://<IP>) gibt es navigator.clipboard nicht.
      if (!navigator.clipboard) throw new Error('keine Zwischenablage');
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
      setManuell(true);
      feld.current?.focus();
      feld.current?.select();
    }
  };
  const close = () => {
    setCopied(false);
    setManuell(false);
    onClose();
  };
  return (
    <Dialog open={!!url} onClose={close} title="Link zum Passwort-Festlegen" description={email} size="sm">
      <div className="space-y-5">
        <Alert kind="warning">{ergebnis?.grund ?? 'Die E-Mail konnte nicht verschickt werden.'}</Alert>
        <p className="text-base text-stone-700">
          Bitte geben Sie diesen Link selbst an die Person weiter (z. B. per Teams oder auf einem Zettel). Er gilt nur einmal.
        </p>
        <Field label="Link">
          {({ id }) => <Input ref={feld} id={id} readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-hinweis" />}
        </Field>
        {manuell && (
          <p role="status" className="text-hinweis font-bold text-stone-700">
            Bitte mit Strg+C kopieren.
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close}>
            Schließen
          </Button>
          <Button icon={copied ? Check : Copy} onClick={copy}>
            {copied ? 'Kopiert' : 'Link kopieren'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

