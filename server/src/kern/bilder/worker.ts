// Rechen-Thread der Bildverarbeitung (node:worker_threads). Ein Auftrag zur Zeit; Fehler gehen als Antwort zurück
// (Dateifehler wie ENOENT/EBUSY gelten als vorübergehend – sie liegen nicht am Bild).
// Im Installer-Paket gebündelt als server/dist/bild-worker.mjs (server/scripts/bundle.ts).
import { parentPort } from 'node:worker_threads';
import { NichtUnterstuetzt, verarbeite, type Auftrag } from './verarbeitung';

parentPort?.on('message', (m: { id: number; auftrag: Auftrag }) => {
  try {
    const ergebnis = verarbeite(m.auftrag);
    const transfer = [...ergebnis.vorschau.map((v) => v.daten.buffer), ...(ergebnis.original ? [ergebnis.original.daten.buffer] : [])];
    parentPort!.postMessage({ id: m.id, ok: true, ergebnis }, transfer as ArrayBuffer[]);
  } catch (err) {
    parentPort!.postMessage({ id: m.id, ok: false, fehler: (err as Error)?.message ?? String(err), nichtUnterstuetzt: err instanceof NichtUnterstuetzt, voruebergehend: typeof (err as NodeJS.ErrnoException)?.code === 'string' });
  }
});
