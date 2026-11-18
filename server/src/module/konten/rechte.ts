import { LEHRKRAFT_BEREICHE, rechteFuer, type Bereich, type Permission } from '@mosaik3lab/shared/konten';
import type { Requester } from '@mosaik3lab/shared/anfragen';
import type { User } from '../../domain/types';

// Prüf-Logik der Rechte für angemeldete Personen. Das Backend prüft ausschließlich gegen diese Funktionen;
// das Frontend erhält die wirksamen Prüfpunkte (/api/auth/me), um Seiten und Knöpfe ein- oder auszublenden.
// Ohne Anmeldung erlaubt (siehe module/katalog, module/anfragen): veröffentlichte Druckteile ansehen,
// Anfragen stellen (außer die Adresse ist gesperrt) und eigene Anfragen per Code abrufen.
//
// Eine Person = eine E-Mail: die Lehrkraft-Häkchen stehen an der Lehrkraft (Tabelle lehrkraft), die
// Druck-Team-Häkchen am Konto (Tabelle benutzer). Neuer Bereich: Eintrag in BEREICHE (shared/src/konten.ts).


/** Angehakte Lehrkraft-Bereiche; ohne Eintrag im Lehrkräfte-Verzeichnis gelten die Standards (alles an). */
export function lehrkraftBereiche(requester: Pick<Requester, 'darfAnfragen' | 'darfVorschlagen'> | undefined): Bereich[] {
  if (!requester) return [...LEHRKRAFT_BEREICHE];
  return [...(requester.darfAnfragen ? (['anfragen'] as const) : []), ...(requester.darfVorschlagen ? (['vorschlaege'] as const) : [])];
}

/** Wirksame Rechte eines Kontos (Rolle + Druck-Team-Häkchen) zusammen mit seinen Lehrkraft-Häkchen. */
export function permissionsForUser(user: Pick<User, 'role' | 'teamBereiche'>, requester?: Requester): Permission[] {
  return rechteFuer(user.role, [...user.teamBereiche, ...lehrkraftBereiche(requester)]);
}

/** Wirksame Rechte einer Lehrkraft ohne (aktives) Konto. */
export function permissionsForRequester(requester: Requester | undefined): Permission[] {
  return rechteFuer('lehrkraft', lehrkraftBereiche(requester));
}

export function userCan(user: Pick<User, 'role' | 'teamBereiche'> | undefined, permission: Permission): boolean {
  return !!user && permissionsForUser(user).includes(permission);
}
