export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new HttpError(400, message, fields);
export const unauthorized = (message = 'Bitte melden Sie sich an.') => new HttpError(401, message);
export const forbidden = (message = 'Für diese Aktion fehlt die Berechtigung.') =>
  new HttpError(403, message);
export const notFound = (message = 'Nicht gefunden.') => new HttpError(404, message);
export const conflict = (message: string, fields?: Record<string, string>) =>
  new HttpError(409, message, fields);
