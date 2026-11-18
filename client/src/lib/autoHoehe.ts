import { useLayoutEffect, type RefObject } from 'react';

/**
 * Textfeld wächst mit dem Inhalt (statt ihn abzuschneiden) – auch, wenn es schmaler wird (Drehen, große Schrift).
 * Ersatz für CSS `field-sizing: content`, das Safari und Firefox noch nicht können.
 */
export function useAutoHoehe(ref: RefObject<HTMLTextAreaElement | null>, wert: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const anpassen = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    };
    anpassen();
    let breite = el.clientWidth;
    const beobachter = new ResizeObserver(() => {
      if (el.clientWidth === breite) return;
      breite = el.clientWidth;
      anpassen();
    });
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, [ref, wert]);
}
