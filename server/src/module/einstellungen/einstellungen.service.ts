import { isDeepStrictEqual } from 'node:util';
import { defaultSettings, ORDERFORM_VORGABE_BIS_1_6 } from '../../domain/settings';
import type { Storage } from '../../storage';

// Regeln rund um die Einstellungen, die nicht nur Speichern sind.

/** Einstellungs-Schlüssel (Tabelle einstellung): Zeitpunkt, zu dem die erlaubten Domains zuletzt bewusst gesetzt wurden. */
export const ORDERFORM_GESETZT = 'orderFormGesetzt';

/** Merkt sich, dass die erlaubten Domains bewusst gesetzt wurden (Verwaltung → Einstellungen oder Ersteinrichtung). */
export function merkeDomainGesetzt(storage: Storage) {
  storage.settings.setSetting(ORDERFORM_GESETZT, new Date().toISOString());
}

/**
 * Ersteinrichtung: setzt die erlaubte E-Mail-Domain auf die Domain der Schule – aber nur, wenn die Anfrage-Einstellungen
 * noch nie gespeichert wurden (keine Markierung, Wert noch wie im Code voreingestellt). Bestehende Installationen und
 * eingespielte Sicherungen behalten ihre Einstellung. → true, wenn gesetzt.
 */
export async function schulDomainUebernehmen(storage: Storage, domain: string): Promise<boolean> {
  if (storage.settings.getSetting(ORDERFORM_GESETZT) !== undefined) return false;
  const s = await storage.settings.get();
  // „Unverändert“ = heutige Vorgabe oder die bis 1.6.3 gültige (ältere, noch nicht eingerichtete Installationen).
  const vorgaben = [defaultSettings().orderForm, { ...ORDERFORM_VORGABE_BIS_1_6 }];
  if (!vorgaben.some((v) => isDeepStrictEqual(s.orderForm, v))) return false;
  await storage.settings.update((cur) => ({ ...cur, orderForm: { allowedEmailDomains: [domain] } }));
  merkeDomainGesetzt(storage);
  return true;
}
