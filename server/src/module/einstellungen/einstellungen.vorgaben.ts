import type { Features, MailStatus, OrderFormSettings } from '@mosaik3lab/shared/einstellungen';
import type { Filament, MasterData } from '@mosaik3lab/shared/stammdaten';
import { DEFAULT_FILAMENT_IDS, filamentAusKatalog, katalogEintrag } from '../../domain/bambuKatalog';
import { defaultOrderStatuses, normalizeOrderStatuses } from '../stammdaten/orderStatuses';

// Einstellungen und Stammdaten, die die Administration in der Oberfläche pflegt (Tabellen siehe docs/DATENMODELL.md).
// Die gemeinsamen Typen und Schemas stehen in shared/src/stammdaten.ts, einstellungen.ts und anfragen.ts.

export const filamentLabel = (f: Pick<Filament, 'colorName' | 'brand' | 'line'>) => `${f.colorName} · ${f.brand} ${f.line}`.trim();

export interface AppSettings {
  masterData: MasterData;
  orderForm: OrderFormSettings;
  features: Features;
  /** Letztes Ergebnis des Mailversands – zur Fehlersuche in der Verwaltung. SMTP-Daten liegen in der Datenbank (betrieb_einstellung, gepflegt vom Server-Manager). */
  mailStatus: MailStatus;
  /** Frühere, frei angelegte Status-IDs → feste Status (für die Migration der Anfragen). */
  statusAliases: Record<string, string>;
}

/**
 * Voreinstellung der erlaubten Domains bis Version 1.6.3 – nur für die Update-Sicherheit, nie für neue Installationen:
 * Datenstände aus dieser Zeit, die die Domain nie ausdrücklich gespeichert haben, behalten genau diesen Wert
 * (einstellungen.repository.ts, legacyJson.ts) und gelten bei der Ersteinrichtung weiter als „unverändert“
 * (einstellungen.service.ts).
 */
export const ORDERFORM_VORGABE_BIS_1_6: Readonly<OrderFormSettings> = Object.freeze({ allowedEmailDomains: ['mosaikschule-lu.de'] });

import { newId } from '../../kern/ids';

const entries = (names: string[]) => names.map((name) => ({ id: newId(), name }));

export function defaultSettings(): AppSettings {
  return {
    masterData: {
      categories: [
        { id: newId(), name: 'Kommunikation', color: 'blau', icon: 'kommunikation' },
        { id: newId(), name: 'Feinmotorik', color: 'lila', icon: 'hand' },
        { id: newId(), name: 'Alltagshilfen', color: 'orange', icon: 'besteck' },
        { id: newId(), name: 'Lernen und Unterricht', color: 'gelb', icon: 'buch' },
        { id: newId(), name: 'Sensorik und Wahrnehmung', color: 'gruen', icon: 'sterne' },
        { id: newId(), name: 'Individuelle Anpassungen', color: 'rot', icon: 'werkzeug' },
        { id: newId(), name: 'Sonstiges', color: 'grau', icon: 'formen' },
      ],
      useAreas: entries(['Unterricht', 'Therapie', 'Mahlzeiten', 'Pflege und Alltag', 'Pause und Freizeit', 'Mobilität']),
      materials: entries(['PLA', 'PETG', 'TPU', 'ASA', 'Sonstiges']),
      filaments: DEFAULT_FILAMENT_IDS.map((id) => filamentAusKatalog(katalogEintrag(id)!)),
      orderStatuses: defaultOrderStatuses(),
    },
    // Neue Installation: jede Adresse erlaubt, bis die Ersteinrichtung die Domain der Schule setzt (schulDomainUebernehmen).
    orderForm: { allowedEmailDomains: [] },
    features: { requesterTracking: false },
    mailStatus: null,
    statusAliases: {},
  };
}

/** Prüft eine E-Mail-Adresse gegen die erlaubten Domains (inkl. Subdomains). */
export function isAllowedEmail(email: string, domains: string[]): boolean {
  if (domains.length === 0) return true;
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Ergänzt fehlende Felder (z. B. nach einem Update) mit Standardwerten. */
export function withDefaults(data: Partial<AppSettings>): AppSettings {
  const d = defaultSettings();
  const masterData = { ...d.masterData, ...(data.masterData ?? {}) };
  const { statuses, aliases } = normalizeOrderStatuses(data.masterData?.orderStatuses);
  return {
    masterData: {
      ...masterData,
      filaments: masterData.filaments.map((f) => ({
        ...f,
        available: f.available !== false,
        // Ältere Daten ohne Herkunft: „bambu-…“-IDs stammen aus dem Katalog (wie Migration 012).
        katalogId: f.katalogId === undefined ? (f.id.startsWith('bambu-') ? f.id : null) : f.katalogId,
        herstellerNummer: f.herstellerNummer ?? '',
        herstellerName: f.herstellerName ?? '',
        weggefallen: !!f.weggefallen,
      })),
      orderStatuses: statuses,
    },
    orderForm: { ...d.orderForm, ...(data.orderForm ?? {}) },
    features: { ...d.features, ...(data.features ?? {}) },
    mailStatus: data.mailStatus ?? null,
    statusAliases: { ...(data.statusAliases ?? {}), ...aliases },
  };
}

/** Statusvorgabe für neue Anfragen: immer „Offen“ (kann nicht ausgeschaltet werden). */
export const ANFANGSSTATUS = 'offen';
