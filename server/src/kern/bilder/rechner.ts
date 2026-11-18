// Ein Rechen-Thread für Bilder: Aufträge nacheinander, „sofort“ (Hochladen, Abruf) vor „hintergrund“ (Bildpflege).
// Zeitgrenze je Bild → Thread beenden, Auftrag scheitert, der nächste bekommt einen frischen Thread. Stürzt der Thread ab
// (Speicher, Fehler), scheitert nur der laufende Auftrag – die App läuft weiter. Nach einer Ruhepause wird der Thread
// beendet (gibt Speicher frei, wichtig auf dem Pi).
import { Worker } from 'node:worker_threads';
import type { Auftrag, Ergebnis } from './verarbeitung';
import { MAX_SPEICHER_MB, ZEITGRENZE_MS } from './groessen';

const beendetFehler = () => new BildFehler('Bildverarbeitung ist beendet.', false, true);

export type Prioritaet = 'sofort' | 'hintergrund';

export class BildFehler extends Error {
  constructor(
    message: string,
    /** Format/Inhalt wird nicht unterstützt (CMYK, 16 Bit, beschädigt …) – erneut versuchen lohnt nicht. */
    readonly nichtUnterstuetzt = false,
    /** Liegt nicht am Bild (Server wird beendet, Datei fehlt/gesperrt, inzwischen geändert) – nicht dauerhaft merken. */
    readonly voruebergehend = false,
  ) {
    super(message);
  }
}

interface Job {
  id: number;
  auftrag: Auftrag;
  prio: Prioritaet;
  ok: (e: Ergebnis) => void;
  fehler: (e: Error) => void;
}

/** Dev/Tests (tsx): worker.ts daneben; gebündelt (server/dist): bild-worker.mjs im selben Ordner. */
function workerDatei(): URL {
  const hier = import.meta.url;
  return /\.ts$/.test(hier) ? new URL('./worker.ts', hier) : new URL('./bild-worker.mjs', hier);
}

export class BildRechner {
  private worker?: Worker;
  private laufend?: { job: Job; timer: NodeJS.Timeout };
  private schlange: Job[] = [];
  private naechsteId = 1;
  private ruheTimer?: NodeJS.Timeout;
  private beendet = false;

  constructor(
    private readonly opts: { zeitgrenzeMs?: number; ruheMs?: number; datei?: URL } = {},
  ) {}

  /** Anzahl wartender und laufender Aufträge (für Entscheidungen „lohnt Warten?“). */
  get last() {
    return this.schlange.length + (this.laufend ? 1 : 0);
  }

  rechne(auftrag: Auftrag, prio: Prioritaet = 'sofort'): Promise<Ergebnis> {
    if (this.beendet) return Promise.reject(beendetFehler());
    return new Promise((ok, fehler) => {
      const job: Job = { id: this.naechsteId++, auftrag, prio, ok, fehler };
      // „sofort“ hinter die anderen „sofort“-Aufträge, aber vor alle Hintergrund-Aufträge
      const i = prio === 'sofort' ? this.schlange.findIndex((j) => j.prio === 'hintergrund') : -1;
      if (i < 0) this.schlange.push(job);
      else this.schlange.splice(i, 0, job);
      this.weiter();
    });
  }

  async beenden() {
    this.beendet = true;
    clearTimeout(this.ruheTimer);
    for (const j of this.schlange.splice(0)) j.fehler(beendetFehler());
    if (this.laufend) {
      clearTimeout(this.laufend.timer);
      this.laufend.job.fehler(beendetFehler());
      this.laufend = undefined;
    }
    const w = this.worker;
    this.worker = undefined;
    await w?.terminate().catch(() => undefined);
  }

  private holeWorker(): Worker {
    if (this.worker) return this.worker;
    // execArgv wird geerbt (in der Entwicklung lädt tsx so auch worker.ts). Grenze für den JS-Speicher des Threads:
    // läuft er voll, endet nur der Thread (ERR_WORKER_OUT_OF_MEMORY), nicht die App.
    const w = new Worker(this.opts.datei ?? workerDatei(), { resourceLimits: { maxOldGenerationSizeMb: MAX_SPEICHER_MB } });
    w.unref();
    w.on('message', (m: { id: number; ok: boolean; ergebnis?: Ergebnis; fehler?: string; nichtUnterstuetzt?: boolean; voruebergehend?: boolean }) => {
      const l = this.laufend;
      if (!l || l.job.id !== m.id) return;
      clearTimeout(l.timer);
      this.laufend = undefined;
      if (m.ok && m.ergebnis) l.job.ok(m.ergebnis);
      else l.job.fehler(new BildFehler(m.fehler ?? 'Unbekannter Fehler', !!m.nichtUnterstuetzt, !!m.voruebergehend));
      this.weiter();
    });
    w.on('error', (err) => this.absturz(w, `Rechen-Thread abgestürzt: ${err.message}`));
    w.on('exit', (code) => this.absturz(w, `Rechen-Thread beendet (Code ${code}).`));
    this.worker = w;
    return w;
  }

  private absturz(w: Worker, text: string) {
    if (this.worker !== w) return; // schon ersetzt (Zeitgrenze, Ruhepause, beenden)
    this.worker = undefined;
    const l = this.laufend;
    this.laufend = undefined;
    if (l) {
      clearTimeout(l.timer);
      l.job.fehler(new BildFehler(text));
    }
    this.weiter();
  }

  private weiter() {
    if (this.laufend || this.beendet) return;
    clearTimeout(this.ruheTimer);
    const job = this.schlange.shift();
    if (!job) {
      this.ruheTimer = setTimeout(() => {
        const w = this.worker;
        this.worker = undefined;
        void w?.terminate().catch(() => undefined);
      }, this.opts.ruheMs ?? 30_000);
      this.ruheTimer.unref();
      return;
    }
    let w: Worker;
    try {
      w = this.holeWorker();
    } catch (err) {
      job.fehler(new BildFehler(`Rechen-Thread startet nicht: ${(err as Error).message}`));
      setImmediate(() => this.weiter());
      return;
    }
    const zeit = this.opts.zeitgrenzeMs ?? ZEITGRENZE_MS;
    const timer = setTimeout(() => {
      if (this.laufend?.job !== job) return;
      this.laufend = undefined;
      this.worker = undefined;
      job.fehler(new BildFehler(`Zeitgrenze überschritten (${Math.round(zeit / 1000)} s).`));
      void w.terminate().catch(() => undefined);
      this.weiter();
    }, zeit);
    timer.unref();
    this.laufend = { job, timer };
    // Kopie übergeben: der Aufrufer behält seinen Puffer (Original wird evtl. weiter gebraucht).
    w.postMessage({ id: job.id, auftrag: job.auftrag });
  }
}
