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

let unauthorizedHandler: (() => void) | undefined;

/** Wird vom AuthContext gesetzt: abgelaufene Sitzungen führen zurück zum Login. */
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
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
  const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
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
  }

  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    /* keine JSON-Antwort */
  }

  if (!res.ok) {
    if (res.status === 401 && !opts.silent401) unauthorizedHandler?.();
    const payload = (data ?? {}) as { error?: string; fields?: Record<string, string> };
    // 5xx ohne JSON kommt vom Proxy (Backend startet neu oder ist aus), nicht vom Backend selbst.
    const message = payload.error ?? (res.status >= 500 ? RESTARTING : `Fehler ${res.status}`);
    throw new ApiError(res.status, message, payload.fields ?? {});
  }
  return data as T;
}

export const imageUrl = (file: string) => withBase(`/api/files/images/${encodeURIComponent(file)}`);
export const modelUrl = (itemId: string, modelId: string) =>
  withBase(`/api/files/models/${encodeURIComponent(itemId)}/${encodeURIComponent(modelId)}`);
export const videoUrl = (file: string) => withBase(`/api/files/videos/${encodeURIComponent(file)}`);
