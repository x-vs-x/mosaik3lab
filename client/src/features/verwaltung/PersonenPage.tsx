import { KeyRound, Search, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BEREICHE, ROLE_LABELS } from '@mosaik3lab/shared/konten';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Alert, Badge, Button, Card, cx, EmptyState, inputClass, PageHeader, Spinner } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import type { PasswortLinkErgebnis, Person, Role } from '../../lib/types';
import { useApi, useDocumentTitle } from '../../lib/useApi';
import { LinkDialog, RechteDialog } from './PersonDialogs';

// Personen und Rechte – eine Seite für den Administrator. Eine Zeile je Schul-E-Mail, ein Knopf „Rechte ändern“.

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-brand-700 text-white ring-brand-700',
  druckteam: 'bg-brand-50 text-brand-800 ring-brand-200',
  lehrkraft: 'bg-stone-50 text-stone-700 ring-stone-200',
};

const FILTER = [
  { id: 'alle', label: 'Alle' },
  { id: 'team', label: 'Druck-Team & Admin' },
  { id: 'lehrkraft', label: 'Lehrkräfte' },
] as const;

/** „Darf …“ in Kurzform aus den Häkchen (beim Druck-Team nur die Team-Bereiche). */
function darfText(p: Person) {
  if (p.role === 'admin') return 'alles';
  const labels = BEREICHE.filter((b) => b.fuer === p.role && p.bereiche.includes(b.key)).map((b) => b.label);
  return labels.length ? labels.join(' · ') : 'nichts (alle Häkchen aus)';
}

export function PersonenPage() {
  useDocumentTitle('Personen');
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, setData, error, loading } = useApi<Person[]>('/personen');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<(typeof FILTER)[number]['id']>('alle');
  const [edit, setEdit] = useState<Person>();
  const [link, setLink] = useState<{ email: string; ergebnis: PasswortLinkErgebnis }>();
  const [sending, setSending] = useState<string>();

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? [])
      .filter((p) => filter === 'alle' || (filter === 'lehrkraft' ? p.role === 'lehrkraft' : p.role !== 'lehrkraft'))
      .filter((p) => !needle || `${p.name} ${p.email}`.toLowerCase().includes(needle));
  }, [data, q, filter]);

  const linkErgebnis = (email: string, ergebnis: PasswortLinkErgebnis) => {
    if (ergebnis.gesendet) toast('success', `E-Mail mit Link an ${email} geschickt.`);
    else setLink({ email, ergebnis });
  };

  const sendLink = async (p: Person) => {
    setSending(p.email);
    try {
      linkErgebnis(p.email, await api<PasswortLinkErgebnis>('/personen/passwort-link', { method: 'POST', body: { email: p.email } }));
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Link konnte nicht erzeugt werden.');
    } finally {
      setSending(undefined);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Personen"
        description="Wer was in Mosaik³LAB darf. Lehrkräfte melden sich nur mit ihrer Schul-E-Mail an. Wer mehr darf, bekommt automatisch eine E-Mail, um ein Passwort festzulegen."
        actions={
          <Button icon={UserPlus} onClick={() => setEdit({ ...({} as Person), email: '' })}>
            Person hinzufügen
          </Button>
        }
      />

      {error && <Alert kind="error">{error.message}</Alert>}
      {loading && !data && <Spinner />}

      {data && (
        <>
          <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative w-full max-w-md">
              <label htmlFor="personen-suche" className="sr-only">
                Personen nach Name oder E-Mail filtern
              </label>
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-500" aria-hidden />
              <input id="personen-suche" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name oder E-Mail" className={`${inputClass()} pl-12`} />
            </div>
            <div role="group" aria-label="Anzeigen" className="flex flex-wrap gap-2">
              {FILTER.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cx('min-h-11 rounded-xl px-4 font-bold ring-1', filter === f.id ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-stone-700 ring-stone-300 hover:bg-stone-50')}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {list.length === 0 ? (
            <EmptyState icon={Users} title={q ? `Keine Treffer für „${q}“` : 'Noch niemand eingetragen'}>
              Lehrkräfte erscheinen hier automatisch, sobald sie zum ersten Mal anfragen oder sich anmelden.
            </EmptyState>
          ) : (
            <Card as="section" className="overflow-hidden">
              <h2 className="sr-only">Liste der Personen</h2>
              <ul className="divide-y divide-stone-100">
                {list.map((p) => {
                  const isMe = p.email === me?.email;
                  return (
                    <li key={p.email} className="flex flex-col gap-2.5 px-4 py-3 sm:px-5 sm:py-4 md:flex-row md:items-center md:gap-6">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="break-all text-[1.05rem] font-bold text-stone-900">{p.name}</span>
                          <Badge className={ROLE_BADGE[p.role]}>{ROLE_LABELS[p.role]}</Badge>
                          {isMe && <Badge className="bg-brand-50 text-brand-800 ring-brand-200">Sie</Badge>}
                          {p.isDemo && <Badge className="bg-amber-50 text-amber-900 ring-amber-300">Demo</Badge>}
                          {p.passwort === 'ausstehend' && <Badge className="bg-amber-50 text-amber-900 ring-amber-300">Passwort noch nicht festgelegt</Badge>}
                          {p.passwort === 'gesperrt' && <Badge className="bg-rose-50 text-rose-800 ring-rose-300">Gesperrt nach falschen Passwörtern</Badge>}
                        </div>
                        {p.name !== p.email && <p className="break-all text-[0.9rem] text-stone-600">{p.email}</p>}
                        <p className="mt-1 text-[0.9rem] text-stone-700">
                          <span className="font-bold">Darf:</span> {darfText(p)}
                        </p>
                        <p className="text-[0.85rem] text-stone-500">
                          {p.orderCount === 1 ? '1 Anfrage' : `${p.orderCount} Anfragen`}
                          {p.lastOrderAt && ` · zuletzt ${formatRelative(p.lastOrderAt)}`}
                          {p.passwort && (p.lastLoginAt ? ` · angemeldet ${formatRelative(p.lastLoginAt)}` : ' · noch nie mit Passwort angemeldet')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" icon={ShieldCheck} onClick={() => setEdit(p)} aria-label={`Rechte ändern: ${p.name}`}>
                          Rechte ändern
                        </Button>
                        {p.passwort && (
                          <Button variant="secondary" size="sm" icon={KeyRound} loading={sending === p.email} onClick={() => sendLink(p)} aria-label={`${p.passwort === 'ausstehend' ? 'Link erneut senden' : 'Passwort zurücksetzen'}: ${p.name}`}>
                            {p.passwort === 'ausstehend' ? 'Link erneut senden' : 'Passwort zurücksetzen'}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}

      <RechteDialog
        person={edit}
        isMe={!!edit?.email && edit.email === me?.email}
        onClose={() => setEdit(undefined)}
        onSaved={({ person, passwortLink }) => {
          setData((all) => (all?.some((x) => x.email === person.email) ? all.map((x) => (x.email === person.email ? person : x)) : [person, ...(all ?? [])]));
          setEdit(undefined);
          if (passwortLink) linkErgebnis(person.email, passwortLink);
          else toast('success', `${person.name}: gespeichert.`);
        }}
      />
      <LinkDialog email={link?.email} ergebnis={link?.ergebnis} onClose={() => setLink(undefined)} />
    </>
  );
}
