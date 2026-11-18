import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();

// Letztes Netz: eine vergessene Promise-Ablehnung beendet sonst die ganze App (Node-Standard). Nur ins Log schreiben –
// der eigentliche Fehler wird an seiner Stelle behandelt.
process.on('unhandledRejection', (grund) => {
  console.error('[Fehler] Unbehandelte Promise-Ablehnung:', grund instanceof Error ? (grund.stack ?? grund.message) : grund);
});

if (!['127.0.0.1', 'localhost', '::1'].includes(config.host)) {
  console.warn(
    `\n⚠  Hinweis: Die App lauscht direkt im Netzwerk (${config.host}), nicht nur auf diesem Rechner.\n` +
      '   Empfohlen ist der Zugang über das Portal des Server-Managers (Port 80/443, optional HTTPS).\n',
  );
}

const { app, close } = await createApp(config);

const server = app.listen(config.port, config.host, () => {
  console.log(`\nMosaik³LAB API läuft auf http://${config.host}:${config.port}`);
  console.log(`Datenordner: ${config.storageDir}`);
  console.log(`Ablage (Bilder, Druckdateien, Videos): ${config.ablageDir}`);
  console.log(`Demo-Zugänge: ${config.allowDemoAccounts ? 'aktiv (Passwörter stehen im README – nicht im Schulbetrieb!)' : 'deaktiviert'}\n`);
});
// Port belegt o. Ä.: klare Meldung statt Stacktrace (der Server-Manager zeigt die letzte Zeile als Fehler an).
server.on('error', (err: NodeJS.ErrnoException) => {
  const text =
    err.code === 'EADDRINUSE'
      ? `Port ${config.port} ist schon belegt (läuft die App bereits?). Anderen Port wählen (API_PORT) oder das andere Programm beenden.`
      : err.code === 'EACCES'
        ? `Port ${config.port} darf nicht benutzt werden (fehlende Rechte).`
        : `Server konnte nicht starten: ${err.message}`;
  console.error(`\n✘ ${text}\n`);
  void close().finally(() => process.exit(1));
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} empfangen – Server wird beendet …`);
  server.close();
  await close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
