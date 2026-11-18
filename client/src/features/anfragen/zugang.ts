import type { Permission, PublicConfig } from '../../lib/types';

/**
 * „Meine Anfragen“ gibt es für angemeldete Lehrkräfte (Recht „orders:own“) oder – ohne Anmeldung, per Anfrage-Code –
 * bei eingeschalteter Statusanzeige. Eine Regel für Menü und Route, damit beide gleich entscheiden.
 */
export function darfMeineAnfragen(can: (p: Permission) => boolean, config: PublicConfig | undefined): boolean {
  return can('orders:own') || !!config?.features.requesterTracking;
}
