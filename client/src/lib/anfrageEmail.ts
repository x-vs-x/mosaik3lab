/**
 * E-Mail einer Anfrage: Angemeldet (Lehrkraft oder Konto) gilt immer die Adresse der Sitzung – ein Entwurf oder
 * eine früher auf diesem Gerät benutzte Adresse ändert daran nichts (der Server ersetzt sie ohnehin).
 * Ohne Anmeldung zählt die Eingabe.
 */
export function anfrageEmail(sitzungsEmail: string | undefined, eingabe: string): string {
  return (sitzungsEmail || eingabe).trim();
}
