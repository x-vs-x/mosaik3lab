import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ME_TIMEOUT_MS, pruefeSitzung } from '../auth/sitzungPruefen';
import { api } from './api';
import type { MasterData, PublicConfig } from './types';

interface ConfigState {
  /** undefined, solange die Konfiguration lädt */
  config: PublicConfig | undefined;
  error: string | undefined;
  /** Nach Änderungen in Stammdaten/Einstellungen aufrufen – oder nach einem Fehler („Erneut versuchen“). */
  reload: () => Promise<void>;
}

const ConfigContext = createContext<ConfigState | null>(null);

/**
 * Lädt Stammdaten und Schalter (GET /api/config) einmal für die ganze App. Startet der Server gerade neu, wird wie bei der
 * Sitzungsprüfung kurz wiederholt; scheitert es endgültig, zeigt das Layout einen Hinweis mit „Erneut versuchen“.
 */
export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig>();
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    setError(undefined);
    try {
      setConfig(await pruefeSitzung(() => api<PublicConfig>('/config', { silent401: true, timeoutMs: ME_TIMEOUT_MS })));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <ConfigContext.Provider value={{ config, error, reload }}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigState {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig muss innerhalb von ConfigProvider verwendet werden.');
  return ctx;
}

/** Stammdaten, solange die Konfiguration lädt: immer dasselbe Objekt, damit Effekte und Memos nicht bei jedem Zeichnen neu laufen. */
const LEERE_STAMMDATEN: MasterData = { categories: [], useAreas: [], materials: [], filaments: [], orderStatuses: [] };

/** Bequemer Zugriff auf die Stammdaten (leere Listen, solange geladen wird). */
export function useMasterData(): MasterData {
  const { config } = useConfig();
  return config?.masterData ?? LEERE_STAMMDATEN;
}
