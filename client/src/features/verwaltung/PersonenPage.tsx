import { KeyRound, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BEREICHE, ROLE_LABELS } from '@mosaik3lab/shared/werte/konten';
import { useAuth } from '../../auth/AuthContext';
import { FilterKnopf, LadeFehler, Suchfeld } from '../../components/Listenwerkzeug';
import { useToast } from '../../components/Toast';
import { Badge, Button, Card, EmptyState, KurzLang, PageHeader, Spinner, Email } from '../../components/ui';
import { api, fehlerText } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import type { PasswortLinkErgebnis, Person, Role } from '../../lib/types';
import { useApi, useDocumentTitle } from '../../lib/useApi';
import { EntfernenDialog, LinkDialog, RechteDialog } from './PersonDialogs';
import { passtZurSuche } from '@mosaik3lab/shared/suche';

// Personen und Rechte – eine Seite für den Administrator. Eine Zeile je Schul-E-Mail, ein Knopf „Rechte ändern“.

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-brand-700 text-white ring-brand-700',
  druckteam: 'bg-brand-50 text-brand-800 ring-brand-200',
  lehrkraft: 'bg-stone-50 text-stone-700 ring-stone-200',
};

const FILTER = [
  { id: 'alle', label: 'Alle' },
  { id: 'team', label: 'Druck-Team & Admin', kurz: 'Team' },
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
  const { data, setData, error, loading, reload } = useApi<Person[]>('/personen');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<(typeof FILTER)[number]['id']>('alle');
  const [edit, setEdit] = useState<Person>();
  const [link, setLink] = useState<{ email: string; ergebnis: PasswortLinkErgebnis }>();
  const [sending, setSending] = useState<string>();
  const [remove, setRemove] = useState<Person>();

  const list = useMemo(() => {
    return (data ?? [])
      .filter((p) => filter === 'alle' || (filter === 'lehrkraft' ? p.role === 'lehrkraft' : p.role !== 'lehrkraft'))
      .filter((p) => passtZurSuche([p.name, p.email], q));
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
      toast('error', fehlerText(err, 'Link konnte nicht erzeugt werden.'));
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

      <LadeFehler error={error} onRetry={() => void reload()} loading={loading} />
      {loading && !data && <Spinner />}

      {data && (
        <>
          <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center">
            <Suchfeld id="personen-suche" label="Personen nach Name oder E-Mail filtern" value={q} onChange={setQ} placeholder="Name oder E-Mail" className="w-full max-w-md" />
            <div role="group" aria-label="Anzeigen" className="flex flex-wrap gap-2">
              {FILTER.map((f) => (
                <FilterKnopf key={f.id} label={'kurz' in f ? <KurzLang kurz={f.kurz} lang={f.label} /> : f.label} active={filter === f.id} onClick={() => setFilter(f.id)} />
              ))}
            </div>
          </div>

          {list.length === 0 ? (
            <EmptyState icon={Users} title={q.trim() ? `Keine Treffer für „${q.trim()}“` : filter !== 'alle' ? 'Keine Personen in dieser Ansicht' : 'Noch niemand eingetragen'}>
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
                          <span className="text-base font-bold text-stone-900">
                            <Email adresse={p.name} />
                          </span>
                          <Badge className={ROLE_BADGE[p.role]}>{ROLE_LABELS[p.role]}</Badge>
                          {isMe && <Badge className="bg-brand-50 text-brand-800 ring-brand-200">Sie</Badge>}
                          {p.isDemo && <Badge className="bg-amber-50 text-amber-900 ring-amber-300">Demo</Badge>}
                          {p.passwort === 'ausstehend' && <Badge className="bg-amber-50 text-amber-900 ring-amber-300">Passwort noch nicht festgelegt</Badge>}
                          {p.passwort === 'gesperrt' && <Badge className="bg-rose-50 text-rose-800 ring-rose-300">Gesperrt nach falschen Passwörtern</Badge>}
                        </div>
                        {p.name !== p.email && (
                          <p className="text-hinweis text-stone-600">
                            <Email adresse={p.email} />
                          </p>
                        )}
                        <p className="mt-1 text-hinweis text-stone-700">
                          <span className="font-bold">Darf:</span> {darfText(p)}
                        </p>
                        <p className="text-hinweis text-stone-500">
                          {p.orderCount === 1 ? '1 Anfrage' : `${p.orderCount} Anfragen`}
                          {p.lastOrderAt && ` · zuletzt ${formatRelative(p.lastOrderAt)}`}
                          {p.passwort && (p.lastLoginAt ? ` · angemeldet ${formatRelative(p.lastLoginAt)}` : ' · noch nie mit Passwort angemeldet')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" icon={ShieldCheck} onClick={() => setEdit(p)} aria-label={`Rechte ändern: ${p.name}`}>
                          <KurzLang kurz="Rechte" lang="Rechte ändern" />
                        </Button>
                        {!isMe && (
                          <Button variant="secondary" size="sm" icon={Trash2} onClick={() => setRemove(p)} aria-label={`Entfernen: ${p.name}`}>
                            Entfernen
                          </Button>
                        )}
                        {p.passwort && (
                          <Button variant="secondary" size="sm" icon={KeyRound} loading={sending === p.email} onClick={() => sendLink(p)} aria-label={`${p.passwort === 'ausstehend' ? 'Link erneut senden' : 'Passwort zurücksetzen'}: ${p.name}`}>
                            {p.passwort === 'ausstehend' ? <KurzLang kurz="Link senden" lang="Link erneut senden" /> : <KurzLang kurz="Passwort" lang="Passwort zurücksetzen" />}
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
      <EntfernenDialog
        person={remove}
        onClose={() => setRemove(undefined)}
        onRemoved={(p) => {
          setData((all) => all?.filter((x) => x.email !== p.email));
          setRemove(undefined);
          toast('success', `${p.name} wurde entfernt.`);
        }}
      />
      <LinkDialog email={link?.email} ergebnis={link?.ergebnis} onClose={() => setLink(undefined)} />
    </>
  );
}
