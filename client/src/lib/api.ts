import { withBase } from './basePath';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** Meldung für Toasts und Hinweise: die verständliche Meldung des Servers, sonst der Ersatztext (z. B. „Speichern fehlgeschlagen.“). */
export const fehlerText = (err: unknown, ersatz: string) => (err instanceof ApiError ? err.message : ersatz);

let unauthorizedHandler: (() => void) | undefined;

/** Wird vom AuthContext gesetzt: abgelaufene Sitzungen führen zurück zum Login. */
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

let abgelehntHandler: (() => void) | undefined;

/**
 * Wird vom Versions-Hinweis gesetzt: Der Server hat eine Eingabe abgelehnt (400) oder kennt die Adresse nicht (404) –
 * bei einem alten Tab nach einem Update der Moment, „Seite neu laden“ anzubieten (components/VersionsHinweis.tsx).
 */
export function onAbgelehnt(handler: (() => void) | undefined) {
  abgelehntHandler = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  /** 401 nicht global behandeln (z. B. beim Login selbst). */
  silent401?: boolean;
  /**
   * Abbruch nach dieser Zeit (ms). Standard 30 s, damit eine hängende Verbindung keine endlose Ladeanzeige erzeugt;
   * 0 = ohne Grenze (Uploads per `form` und lange Vorgänge wie der Import).
   */
  timeoutMs?: number;
  /** Abbrechen von außen (z. B. neue Suche ersetzt die alte). */
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Status 0: keine Antwort (Netz, Zeitüberschreitung). */
const NO_RESPONSE = 'Der Server ist nicht erreichbar. Bitte prüfen Sie die Verbindung und versuchen Sie es erneut.';
const RESTARTING = 'Der Server ist gerade nicht erreichbar (z. B. Neustart). Bitte gleich noch einmal versuchen.';

/** Verbindungsproblem statt fachlicher Antwort: kein Grund, jemanden abzumelden. */
export function isConnectionProblem(err: unknown) {
  return err instanceof ApiError && (err.status === 0 || err.status === 502 || err.status === 503 || err.status === 504 || err.message === RESTARTING);
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    // Schutzheader gegen Cross-Site-Anfragen (wird im Backend geprüft).
    'X-Requested-With': 'mosaik3lab',
  };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const timeoutMs = opts.timeoutMs ?? (opts.form ? 0 : DEFAULT_TIMEOUT_MS);
  // Zeitgrenze und Abbruch von außen zusammen – ohne AbortSignal.any (fehlt in älterem Safari auf Schul-iPads).
  // Ohne beides bleibt die Anfrage ohne Signal (Uploads per `form`, lange Vorgänge mit timeoutMs: 0).
  const ctrl = timeoutMs || opts.signal ? new AbortController() : undefined;
  const timer = ctrl && timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : undefined;
  const abbrechen = () => ctrl?.abort();
  if (opts.signal?.aborted) ctrl?.abort();
  opts.signal?.addEventListener('abort', abbrechen);
  const signal = ctrl?.signal;
  let res: Response;
  let text: string;
  try {
    res = await fetch(withBase(`/api${path}`), {
      method: opts.method ?? 'GET',
      headers,
      body,
      credentials: 'same-origin',
      signal,
    });
    text = await res.text();
  } catch {
    throw new ApiError(0, NO_RESPONSE);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', abbrechen);
  }

  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    /* keine JSON-Antwort */
  }

  if (!res.ok) {
    if (res.status === 401 && !opts.silent401) unauthorizedHandler?.();
    if (res.status === 400 || res.status === 404) abgelehntHandler?.();
    const payload = (data ?? {}) as { error?: string; fields?: Record<string, string> };
    // 5xx ohne JSON kommt vom Proxy (Backend startet neu oder ist aus), nicht vom Backend selbst.
    const message = payload.error ?? (res.status >= 500 ? RESTARTING : `Fehler ${res.status}`);
    throw new ApiError(res.status, message, payload.fields ?? {});
  }
  return data as T;
}

/** Meldung, wenn jemand das Hochladen selbst abbricht („Abbrechen“). */
export const UPLOAD_ABGEBROCHEN = 'Das Hochladen wurde abgebrochen.';
const UPLOAD_HAENGT = 'Das Hochladen ist stehen geblieben – vermutlich ist die Verbindung abgerissen. Bitte erneut versuchen.';
/** Kommt so lange kein Fortschritt beim Hochladen, wird abgebrochen (schwaches WLAN, Verbindung weg). */
export const UPLOAD_STILLSTAND_MS = 60_000;

export interface UploadOptionen {
  /** „Abbrechen“-Knopf: signal.abort() bricht das Hochladen ab (Fehler mit UPLOAD_ABGEBROCHEN). */
  signal?: AbortSignal;
  /** Abbruch nach so langer Zeit ohne Fortschritt (Standard UPLOAD_STILLSTAND_MS). */
  stillstandMs?: number;
}

/**
 * Hochladen mit Fortschritt (XMLHttpRequest – fetch meldet keinen Upload-Fortschritt). `onFortschritt(anteil)` mit 0…1;
 * bei 1 sind alle Bytes beim Server, die Antwort kann danach noch dauern (z. B. Vorschaubilder werden erzeugt, große
 * Import-Datei wird geprüft) – dann gilt der Stillstands-Wächter nicht mehr, abbrechen geht weiter per `signal`.
 * Fehler wie bei api(): ApiError mit Meldung des Servers; 401 meldet die Sitzung als abgelaufen.
 */
export function apiUpload<T>(path: string, form: FormData, onFortschritt?: (anteil: number) => void, optionen: UploadOptionen = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const stillstandMs = optionen.stillstandMs ?? UPLOAD_STILLSTAND_MS;
    let grund = UPLOAD_ABGEBROCHEN;
    let waechter: ReturnType<typeof setTimeout> | undefined;
    const wache = () => {
      clearTimeout(waechter);
      waechter = setTimeout(() => {
        grund = UPLOAD_HAENGT;
        xhr.abort();
      }, stillstandMs);
    };
    const abbrechen = () => xhr.abort();
    const fertig = () => {
      clearTimeout(waechter);
      optionen.signal?.removeEventListener('abort', abbrechen);
    };
    xhr.open('POST', withBase(`/api${path}`));
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('X-Requested-With', 'mosaik3lab');
    xhr.upload.onprogress = (e) => {
      wache();
      if (e.lengthComputable && e.total > 0) onFortschritt?.(Math.min(1, e.loaded / e.total));
    };
    xhr.upload.onload = () => {
      clearTimeout(waechter);
      onFortschritt?.(1);
    };
    xhr.onerror = () => {
      fertig();
      reject(new ApiError(0, NO_RESPONSE));
    };
    xhr.onabort = () => {
      fertig();
      reject(new ApiError(0, grund));
    };
    xhr.onload = () => {
      fertig();
      let data: unknown = undefined;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        /* keine JSON-Antwort */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data as T);
      if (xhr.status === 401) unauthorizedHandler?.();
      const payload = (data ?? {}) as { error?: string; fields?: Record<string, string> };
      reject(new ApiError(xhr.status, payload.error ?? (xhr.status >= 500 ? RESTARTING : `Fehler ${xhr.status}`), payload.fields ?? {}));
    };
    if (optionen.signal?.aborted) {
      fertig();
      reject(new ApiError(0, UPLOAD_ABGEBROCHEN));
      return;
    }
    optionen.signal?.addEventListener('abort', abbrechen);
    wache();
    xhr.send(form);
  });
}

export const imageUrl = (file: string) => withBase(`/api/files/images/${encodeURIComponent(file)}`);
export const modelUrl = (itemId: string, modelId: string) =>
  withBase(`/api/files/models/${encodeURIComponent(itemId)}/${encodeURIComponent(modelId)}`);
export const videoUrl = (file: string) => withBase(`/api/files/videos/${encodeURIComponent(file)}`);
