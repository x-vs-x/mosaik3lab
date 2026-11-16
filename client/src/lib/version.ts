// Versionsnummer der App – beim Bauen aus der obersten package.json eingesetzt (vite.config.ts, define).
// Eine Nummer für alles (App, Server, Manager, Installer-Pakete); neue Version: npm run release.
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'Entwicklung';
