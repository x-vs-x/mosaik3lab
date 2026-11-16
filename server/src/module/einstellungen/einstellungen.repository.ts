import { newId } from '../../domain/ids';
import { defaultSettings, withDefaults, type AppSettings } from '../../domain/settings';
import { json, one, run, transaction, type Db } from '../../kern/db';
import type { MasterDataRepository } from '../stammdaten/stammdaten.repository';

// Fachliche Einstellungen (Tabelle einstellung: Schlüssel → JSON) zusammen mit den Stammdaten als ein Dokument
// `AppSettings`. Betriebseinstellungen (Mail, Ports …) liegen getrennt in betrieb_einstellung (kern/betrieb.ts).

const SETTING_KEYS = ['orderForm', 'features', 'mailStatus', 'statusAliases'] as const;

export class SettingsRepository {
  constructor(
    private readonly db: Db,
    private readonly masterData: MasterDataRepository,
  ) {}

  /** Neue Datenbank: Standard-Stammdaten einmalig anlegen; feste Status immer vollständig eintragen. */
  init() {
    transaction(this.db, () => {
      this.masterData.initStatuses();
      if (!this.getSetting('angelegt')) {
        this.write(defaultSettings());
        this.setSetting('angelegt', new Date().toISOString());
      }
    });
  }

  getSetting(key: string): unknown {
    const r = one(this.db, 'SELECT wert FROM einstellung WHERE schluessel = ?', key);
    return r ? json<unknown>(r.wert, undefined) : undefined;
  }

  setSetting(key: string, value: unknown) {
    run(
      this.db,
      `INSERT INTO einstellung (id, schluessel, wert, geaendert_am) VALUES (?, ?, ?, ?)
       ON CONFLICT (schluessel) DO UPDATE SET wert = excluded.wert, geaendert_am = excluded.geaendert_am`,
      newId(),
      key,
      JSON.stringify(value ?? null),
      new Date().toISOString(),
    );
  }

  read(): AppSettings {
    const partial: Partial<AppSettings> = { masterData: this.masterData.read() };
    for (const k of SETTING_KEYS) {
      const v = this.getSetting(k);
      if (v !== undefined) (partial as Record<string, unknown>)[k] = v;
    }
    return withDefaults(partial);
  }

  /** Schreibt Stammdaten und Einstellungen (innerhalb einer Transaktion aufrufen). */
  write(s: AppSettings) {
    this.masterData.write(s.masterData);
    for (const k of SETTING_KEYS) this.setSetting(k, s[k]);
  }

  async get() {
    return this.read();
  }

  /** Ändert die Einstellungen atomar; die Funktion darf Fehler werfen. */
  async update(change: (current: AppSettings) => AppSettings) {
    return transaction(this.db, () => {
      this.write(withDefaults(change(this.read())));
      return this.read();
    });
  }
}
