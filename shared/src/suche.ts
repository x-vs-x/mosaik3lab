/** Normalisiert Text für die Suche: Kleinschreibung, ß→ss, ae/oe/ue→a/o/u, ohne Akzente. */
export function suchText(s: string): string {
  return s
    .toLocaleLowerCase('de-DE')
    .replace(/ß/g, 'ss')
    .replace(/([aou])e/g, '$1')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** true, wenn jedes Wort der Suchanfrage in einem der Textteile vorkommt (leere Anfrage passt immer). */
export function passtZurSuche(haystackParts: (string | undefined | null)[], query: string): boolean {
  const woerter = suchText(query.trim()).split(/\s+/).filter(Boolean);
  if (woerter.length === 0) return true;
  const heu = suchText(haystackParts.filter(Boolean).join(' '));
  return woerter.every((w) => heu.includes(w));
}
