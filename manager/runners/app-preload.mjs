// Wird vom Web-App-Runner per --import in die App geladen.
// Windows kennt kein SIGTERM für Kindprozesse – der Runner schickt deshalb über den IPC-Kanal „shutdown“,
// und hier wird daraus das Signal, auf das der Server sauber herunterfährt (Daten schreiben, Sperre freigeben).
if (typeof process.send === 'function') {
  process.on('message', (msg) => {
    if (msg === 'shutdown') process.emit('SIGTERM', 'SIGTERM');
  });
  process.channel?.unref();
}
