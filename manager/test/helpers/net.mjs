// Netz-Hilfen für die Tests – robust auch auf einem Rechner, auf dem viele Testläufe gleichzeitig Verbindungen öffnen.
// Hintergrund: Windows vergibt ausgehende Verbindungen aus dem dynamischen Bereich 49152–65535 (Linux: 32768–60999).
// Ist er durch TIME_WAIT-Verbindungen anderer Läufe erschöpft, scheitert connect() zufällig mit EADDRINUSE, und ein per
// listen(0) „freier“ Port kann zwischen Prüfen und Belegen von einer fremden Verbindung genommen werden.
import net from 'node:net';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Freier Port UNTERHALB beider dynamischen Bereiche (20000–32767): den nimmt keine ausgehende Verbindung weg. */
export async function freePort() {
  for (;;) {
    const port = 20000 + Math.floor(Math.random() * 12768);
    const ok = await new Promise((resolve) => {
      const s = net.createServer().once('error', () => resolve(false)).listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
    });
    if (ok) return port;
  }
}

// Fehler beim Aufbau der Verbindung (kein lokaler Port frei) – die Anfrage ist dann nie angekommen, Wiederholen ist sicher.
const TRANSIENT = new Set(['EADDRINUSE', 'EADDRNOTAVAIL', 'ENOBUFS']);

/** fn() wiederholen, solange sie nur am fehlenden lokalen Port scheitert (bis ca. 10 s). */
export async function retryConnect(fn) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= 100 || !TRANSIENT.has(err?.code ?? err?.cause?.code)) throw err;
      await sleep(100);
    }
  }
}
