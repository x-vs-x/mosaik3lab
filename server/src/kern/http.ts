/** Liest einen Routenparameter als einfachen String (Express 5 typisiert auch Arrays). */
export function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/** Query-Parameter als Text (fehlt oder mehrfach angegeben → leer). */
export const queryText = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * Fehlt die Datei auf der Platte, obwohl der Datensatz existiert (z. B. nach dem Einspielen eines Backups ohne Dateien),
 * bekommt der Browser ein schlichtes Platzhalterbild statt eines kaputten Bildes. Der Header X-Datei-Fehlt kennzeichnet es.
 */
export function sendMissingImage(res: import('express').Response) {
  res.status(200);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Datei-Fehlt', '1');
  res.type('image/svg+xml');
  res.send(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img" aria-label="Datei nicht vorhanden">' +
      '<rect width="400" height="300" fill="#eceff3"/><path d="M120 200l50-60 40 45 30-35 40 50z" fill="#c4cad3"/><circle cx="150" cy="110" r="18" fill="#c4cad3"/>' +
      '<text x="200" y="250" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#5b6472">Datei nicht vorhanden</text></svg>',
  );
}
