import { z } from 'zod';
import type { MasterData } from './stammdaten';

// Fachliche Einstellungen (Verwaltung → Einstellungen) und die Konfiguration, die der Client lädt.
// Betrieb, Mail und Pfade stellt der Server-Manager ein – die App zeigt sie nur lesend an.

export const featuresSchema = z.object({
  /** Lehrkräfte sehen Bearbeitungsstand und Anfrage-Code (derzeit nicht gewünscht). */
  requesterTracking: z.boolean(),
});
export type Features = z.infer<typeof featuresSchema>;

/** Eine E-Mail-Domain (nur der Teil nach dem @; ein führendes @ wird entfernt). Gleiche Regel im Server-Manager (manager/lib/admin.mjs). */
export const emailDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((d) => d.replace(/^@/, ''))
  .pipe(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'Ungültige Domain, z. B. schule.example'));

export const orderFormSchema = z.object({
  /** Erlaubte E-Mail-Domains für Anfragen, z. B. „schule.example“. Leer = jede Adresse. */
  allowedEmailDomains: z
    .array(emailDomainSchema)
    .max(20)
    .transform((l) => [...new Set(l)]),
});
export type OrderFormSettings = z.infer<typeof orderFormSchema>;

/** Letztes Ergebnis des Mailversands – zur Fehlersuche in der Verwaltung. */
export type MailStatus = { at: string; ok: boolean; message: string } | null;

/** GET /api/config – ohne Anmeldung abrufbar. */
export interface PublicConfig {
  masterData: MasterData;
  features: Features;
  orderForm: OrderFormSettings;
  demoAccountsEnabled: boolean;
}

/** Zustand des Mailversands – eingerichtet wird er im Server-Manager, hier nur lesend. */
export interface MailInfoView {
  state: 'active' | 'disabled' | 'missing' | 'invalid';
  recipients: number;
  /** Bei „invalid“: was an der Einstellung nicht stimmt. */
  error: string;
}

/** GET /api/admin/settings – nur Administration. */
export interface AdminSettings {
  masterData: MasterData;
  mail: MailInfoView;
  mailStatus: MailStatus;
  features: Features;
  orderForm: OrderFormSettings;
}
