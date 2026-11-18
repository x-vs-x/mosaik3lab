import { newId } from '../../kern/ids';
import { lehrkraftBereiche } from './rechte';
import type { Requester } from '@mosaik3lab/shared/anfragen';
import type { User } from '../../domain/types';
import { badRequest, notFound } from '../../kern/errors';
import type { Storage } from '../../storage';
import { istGesperrt, TEAM_BEREICHE, type PasswortStand, type Person, type PersonGespeichert, type PersonInput } from '@mosaik3lab/shared/konten';
import { createRequester, freeUsername } from './konten.service';
import { linkVerschicken } from './passwortlink';

// Personen in der Verwaltung: Eine Person = eine E-Mail. Die Lehrkraft-Häkchen stehen im Lehrkräfte-Verzeichnis,
// Rolle und Druck-Team-Häkchen am Konto. Wer mehr als Lehrkraft-Rechte bekommt, legt per Link ein Passwort fest;
// bis dahin meldet sich die Person weiter ohne Passwort als Lehrkraft an.

/** Konto, das gerade wirkt (aktiv, Rolle Druck-Team oder Admin) – mit oder ohne festgelegtes Passwort. */
const aktivesKonto = (u: User | undefined) => (u && u.active && u.role !== 'lehrkraft' ? u : undefined);

function passwortStand(u: User): PasswortStand {
  if (u.passwordHash === '') return 'ausstehend';
  return istGesperrt(u) ? 'gesperrt' : 'gesetzt';
}

function toPerson(email: string, user: User | undefined, requester: Requester | undefined, orderCount: number): Person {
  const konto = aktivesKonto(user);
  return {
    email,
    name: user?.displayName || email,
    role: konto?.role ?? 'lehrkraft',
    bereiche: [...lehrkraftBereiche(requester), ...(konto?.role === 'druckteam' ? konto.teamBereiche : [])],
    passwort: konto ? passwortStand(konto) : null,
    isDemo: user?.isDemo ?? false,
    lastLoginAt: konto?.lastLoginAt ?? null,
    orderCount,
    lastOrderAt: requester?.lastOrderAt ?? '',
  };
}

/** Alle Personen: Lehrkräfte und Konten, zusammengeführt über die E-Mail; Konten zuerst, dann nach letzter Anfrage. */
export async function listPersonen(storage: Storage): Promise<Person[]> {
  const counts = storage.orders.countByRequester();
  const users = new Map((await storage.users.list()).filter((u) => u.email).map((u) => [u.email, u]));
  const requesters = new Map((await storage.requesters.list()).map((r) => [r.email, r]));
  const emails = new Set([...users.keys(), ...requesters.keys()]);
  const rang = (p: Person) => ({ admin: 0, druckteam: 1, lehrkraft: 2 })[p.role];
  return [...emails]
    .map((e) => toPerson(e, users.get(e), requesters.get(e), counts.get(requesters.get(e)?.id ?? '') ?? 0))
    .sort((a, b) => rang(a) - rang(b) || b.lastOrderAt.localeCompare(a.lastOrderAt) || a.name.localeCompare(b.name, 'de'));
}

async function findPerson(storage: Storage, email: string) {
  const [user, requester] = await Promise.all([storage.users.findByEmail(email), storage.requesters.findByEmail(email)]);
  return toPerson(email, user, requester, requester ? (storage.orders.countByRequester().get(requester.id) ?? 0) : 0);
}

/**
 * Rolle und Häkchen einer Person festlegen (legt sie bei Bedarf an). Schutz: Niemand entzieht sich selbst die
 * Administratorrolle, und es bleibt immer ein Administrator mit Passwort.
 */
export async function savePerson(storage: Storage, actor: User, input: PersonInput): Promise<PersonGespeichert> {
  const { email, role } = input;
  const darf = (b: string) => input.bereiche.includes(b as never);
  const user = await storage.users.findByEmail(email);
  const konto = aktivesKonto(user);

  if (user?.id === actor.id && role !== 'admin') {
    throw badRequest('Sie können sich die Administratorrolle nicht selbst entziehen.');
  }
  if (konto?.role === 'admin' && konto.passwordHash !== '' && role !== 'admin' && storage.users.countActiveAdmins() <= 1) {
    throw badRequest('Es muss mindestens ein Administrator mit Passwort bestehen bleiben.');
  }

  // Lehrkraft-Häkchen gelten für jede Person – deshalb immer einen Eintrag im Lehrkräfte-Verzeichnis führen.
  const flags = { darfAnfragen: darf('anfragen'), darfVorschlagen: darf('vorschlaege') };
  const requester = (await storage.requesters.findByEmail(email)) ?? (await createRequester(storage, email));
  await storage.requesters.update(requester.id, (r) => ({ ...r, ...flags }));

  const now = new Date().toISOString();
  let passwortLink: PersonGespeichert['passwortLink'] = null;
  if (role === 'lehrkraft') {
    // Zurück zur Lehrkraft: Konto ruht (bleibt für einen späteren Wechsel erhalten), offene Links und Sitzungen enden.
    if (konto) {
      await storage.users.update(konto.id, (u) => ({ ...u, active: false, updatedAt: now }));
      storage.users.deleteLinks(konto.id);
      await storage.sessions.destroyForUser(konto.id);
    }
  } else {
    const teamBereiche = role === 'druckteam' ? input.bereiche.filter((b) => TEAM_BEREICHE.includes(b)) : [];
    const name = input.name?.trim();
    const saved = user
      ? (await storage.users.update(user.id, (u) => ({ ...u, role, active: true, teamBereiche, displayName: name || u.displayName, updatedAt: now })))!
      : await storage.users.create({
          id: newId(),
          username: await freeUsername(storage, email),
          email,
          displayName: name || email.split('@')[0],
          role,
          passwordHash: '',
          active: true,
          isDemo: false,
          createdAt: now,
          updatedAt: now,
          lastLoginAt: null,
          teamBereiche,
          fehlversuche: 0,
        });
    // Neu mehr Rechte und noch kein Passwort → Link per Mail (läuft nicht ab). Ein bereits verschickter Link bleibt gültig.
    if (saved.passwordHash === '' && (!konto || !storage.users.hasLink(saved.id))) {
      passwortLink = await linkVerschicken(storage, saved, 'einrichten', false);
    }
  }
  return { person: await findPerson(storage, email), passwortLink };
}

/**
 * Person entfernen: Konto und Lehrkraft-Eintrag werden als entfernt markiert (nicht gelöscht), Sitzungen enden.
 * Anfragen, Vorschläge und Verlauf bleiben vollständig sichtbar (Name und E-Mail stehen dort als Schnappschuss).
 * Die E-Mail wird frei: Meldet sich die Person später wieder an, beginnt sie neu als Lehrkraft.
 * Schutz: nicht sich selbst, und der letzte Administrator mit Passwort bleibt.
 */
export async function deletePerson(storage: Storage, actor: User, email: string) {
  const [user, requester] = await Promise.all([storage.users.findByEmail(email), storage.requesters.findByEmail(email)]);
  if (!user && !requester) throw notFound('Diese Person gibt es nicht (mehr).');
  if (user?.id === actor.id || email === actor.email) throw badRequest('Sie können sich nicht selbst entfernen.');
  const konto = aktivesKonto(user);
  if (konto?.role === 'admin' && konto.passwordHash !== '' && storage.users.countActiveAdmins() <= 1) {
    throw badRequest('Das ist der letzte Administrator. Es muss immer mindestens ein Administrator bleiben.');
  }
  const now = new Date().toISOString();
  if (user) {
    storage.users.markRemoved(user.id, now);
    await storage.sessions.destroyForUser(user.id);
  }
  // Lehrkraft-Sitzungen enden von selbst: Ein entfernter Eintrag gilt beim nächsten Aufruf als abgemeldet.
  if (requester) storage.requesters.markRemoved(requester.id, now);
}

/** „Passwort zurücksetzen“ bzw. „Link erneut senden“ durch den Administrator (Link läuft nicht ab). */
export async function adminPasswortLink(storage: Storage, email: string) {
  const konto = aktivesKonto(await storage.users.findByEmail(email));
  if (!konto) throw notFound('Diese Person hat kein Konto mit Passwort – Lehrkräfte melden sich ohne Passwort an.');
  return linkVerschicken(storage, konto, konto.passwordHash === '' ? 'einrichten' : 'zuruecksetzen', false);
}

/** „Passwort vergessen?“ – Antwort verrät nie, ob es ein Konto gibt. */
export async function passwortVergessen(storage: Storage, email: string) {
  const konto = aktivesKonto(await storage.users.findByEmail(email));
  if (!konto) return;
  const r = await linkVerschicken(storage, konto, konto.passwordHash === '' ? 'einrichten' : 'zuruecksetzen', true);
  if (!r.gesendet) console.warn(`[Anmeldung] „Passwort vergessen“ für ${email}: ${r.grund}`);
}

