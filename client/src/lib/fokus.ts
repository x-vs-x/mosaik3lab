/** Mindestens das, was der Fokus-Helfer vom DOM braucht (testbar ohne Browser). */
interface Knoten {
  matches(selector: string): boolean;
  querySelector(selector: string): Knoten | null;
  focus(): void;
}

/**
 * Erstes Feld mit Fehler, das den Fokus bekommen kann. Auswahlgruppen (fieldset mit aria-invalid) selbst sind nicht
 * fokussierbar – dann die gewählte bzw. erste Option darin.
 */
export function ersteFehlerstelle<T extends Knoten>(form: { querySelector(selector: string): T | null }): T | null {
  // data-fehler: Knöpfe mit Fehler (z. B. Teil ohne Farbe) – aria-invalid ist an Knöpfen nicht erlaubt.
  const el = form.querySelector('[aria-invalid="true"], [data-fehler="true"]');
  if (!el || !el.matches('fieldset')) return el;
  return (el.querySelector('input:checked') ?? el.querySelector('input, select, textarea, button')) as T | null;
}
