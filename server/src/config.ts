import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPathConfig } from './bootstrapConfig';
import { normalizeBasePath } from './basePath';
import { APP_VERSION } from './kern/version';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Projektwurzel (Ordner mit client/, server/, storage/). */
export const ROOT_DIR = path.resolve(here, '..', '..');

export interface AppConfig {
  host: string;
  port: number;
  /** Projektwurzel. */
  rootDir: string;
  /** Datenordner (STORAGE_DIR, vom Server-Manager gesetzt; Standard <Projekt>/storage). */
  storageDir: string;
  /** SQLite-Datenbank: <storageDir>/mosaik3lab.db */
  dbFile: string;
  /** Dateiablage (ABLAGE_DIR, vom Server-Manager gesetzt; Standard <storageDir>/ablage). */
  ablageDir: string;
  /** Bisheriger JSON-Datenordner (<storageDir>/data): Sperrdatei, Session-Geheimnis, Quelle der einmaligen Übernahme. */
  dataDir: string;
  /** Bisherige Upload-Ordner – nur noch Quelle der einmaligen Übernahme in die Ablage. */
  imagesDir: string;
  modelsDir: string;
  videosDir: string;
  /** Größtes erlaubtes Importpaket für Druckteile (Datenaustausch) in Bytes (IMPORT_MAX_MB, Standard 1024). */
  importMaxBytes: number;
  /** Basis-Pfad der App („“ = unter /, sonst z. B. /mosaik3lab) – BASE_PATH, vom Server-Manager gesetzt. */
  basePath: string;
  /** Wird die App über HTTPS erreicht (Portal mit Zertifikat)? PUBLIC_HTTPS=true – dann HSTS, upgrade-insecure-requests, sichere Cookies. */
  https: boolean;
  isProduction: boolean;
  /** Demo-Zugänge erlaubt? Im Produktivbetrieb nur mit dem Schalter im Server-Manager. */
  allowDemoAccounts: boolean;
  /** Demo-Daten beim ersten Start anlegen? */
  seedDemoData: boolean;
  /** Nur für Tests: sonst liegt das Session-Geheimnis in der Datenbank (betrieb_einstellung). */
  sessionSecret?: string;
  sessionMaxAgeMs: number;
  clientDistDir: string;
  logRequests: boolean;
  /**
   * Start der Bildpflege (Vorschaubilder, zu große Originale) so lange nach dem Start der App; negativ = nie.
   * Standard 5 Minuten (BILDPFLEGE_NACH_MIN), in Tests aus.
   */
  bildpflegeNachMs: number;
  /** Versionsnummer der App (oberste package.json); in Tests austauschbar. CHANGELOG.md liegt in rootDir. */
  appVersion: string;
}

/**
 * Feste Datenwurzel außerhalb des Programm-/Entwicklungsordners (Vorgabe Nutzer):
 * Windows C:\Mosaik3LAB, Linux /var/lib/mosaik3lab – überschreibbar mit MOSAIK3LAB_ROOT.
 */
export function dataRoot(): string {
  if (process.env.MOSAIK3LAB_ROOT) return path.resolve(process.env.MOSAIK3LAB_ROOT);
  return process.platform === 'win32' ? path.join(`${process.env.SystemDrive ?? 'C:'}\\`, 'Mosaik3LAB') : '/var/lib/mosaik3lab';
}

/** Standardordner, wenn nichts anderes eingestellt ist: <Wurzel>\daten und <Wurzel>\ablage. Mit STORAGE_DIR liegt die Ablage darin. */
export function defaultPaths(storageDir?: string) {
  const root = dataRoot();
  const ablageDir = storageDir ? path.join(storageDir, 'ablage') : path.join(root, 'ablage');
  storageDir ??= path.join(root, 'daten');
  return {
    storageDir,
    dbFile: path.join(storageDir, 'mosaik3lab.db'),
    ablageDir,
    dataDir: path.join(storageDir, 'data'),
    imagesDir: path.join(storageDir, 'uploads', 'images'),
    modelsDir: path.join(storageDir, 'uploads', 'models'),
    videosDir: path.join(storageDir, 'uploads', 'videos'),
  };
}

export function loadConfig(overrides: Partial<AppConfig> & { storageDir?: string } = {}): AppConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const demoDisabled = process.env.DISABLE_DEMO_ACCOUNTS === 'true';
  const { storageDir, ...rest } = overrides;
  const rootDir = rest.rootDir ?? ROOT_DIR;

  // Pfade stellt der Server-Manager ein (STORAGE_DIR, ABLAGE_DIR). Test-Overrides gehen vor.
  const envStorage = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : undefined;
  const defaults = defaultPaths(storageDir ?? envStorage);
  const envAblage = !storageDir && process.env.ABLAGE_DIR ? path.resolve(process.env.ABLAGE_DIR) : undefined;
  // Früher in der Verwaltung eingestellte Ordner (mosaik3lab.config.json) – nur noch Quelle der Übernahme.
  const legacy = storageDir ? {} : readPathConfig(rootDir);

  return {
    // Standard: nur localhost – keine Bereitstellung im Netz ohne Sicherheitsprüfung.
    host: process.env.HOST ?? '127.0.0.1',
    // Bewusst nicht PORT: viele Werkzeuge setzen PORT für den Frontend-Server.
    port: Number(process.env.API_PORT ?? 3001),
    rootDir,
    storageDir: defaults.storageDir,
    dbFile: defaults.dbFile,
    ablageDir: envAblage ?? defaults.ablageDir,
    dataDir: legacy.dataDir ?? defaults.dataDir,
    imagesDir: legacy.imagesDir ?? defaults.imagesDir,
    modelsDir: legacy.modelsDir ?? defaults.modelsDir,
    videosDir: legacy.videosDir ?? defaults.videosDir,
    importMaxBytes: Math.max(1, Number(process.env.IMPORT_MAX_MB) || 1024) * 1024 * 1024,
    basePath: storageDir ? '' : normalizeBasePath(process.env.BASE_PATH),
    https: !storageDir && process.env.PUBLIC_HTTPS === 'true',
    isProduction,
    // Gleiche Regel wie der Server-Manager (manager/lib/auth.mjs): in der Entwicklung erlaubt (abschaltbar), installiert
    // (NODE_ENV=production) nur mit dem Schalter „Demo-Konten“ – der Manager setzt dann DISABLE_DEMO_ACCOUNTS=false.
    allowDemoAccounts: isProduction ? process.env.DISABLE_DEMO_ACCOUNTS === 'false' : !demoDisabled,
    seedDemoData: process.env.SEED_DEMO_DATA !== 'false',
    sessionSecret: storageDir ? undefined : process.env.SESSION_SECRET,
    // Dauerhaftes Cookie: angemeldet bleiben für 30 Tage, bei jeder Nutzung verlängert (rolling).
    sessionMaxAgeMs: 30 * 24 * 60 * 60 * 1000,
    clientDistDir: path.join(ROOT_DIR, 'client', 'dist'),
    logRequests: !isProduction,
    bildpflegeNachMs: storageDir ? -1 : Math.max(0, Number(process.env.BILDPFLEGE_NACH_MIN ?? 5) || 0) * 60_000,
    appVersion: APP_VERSION,
    ...rest,
  };
}
