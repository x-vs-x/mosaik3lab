/**
 * Basis-Pfad der App („“ oder z. B. „/mosaik3lab“), aus dem <base href> der Seite – der Server setzt ihn beim Ausliefern
 * (BASE_PATH). Alle Adressen zur API und zu Dateien beginnen damit.
 */
export const BASE_PATH: string = (() => {
  try {
    return new URL(document.baseURI).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
})();

/** „/api/…“ → „<Basis-Pfad>/api/…“ */
export const withBase = (path: string) => BASE_PATH + path;
