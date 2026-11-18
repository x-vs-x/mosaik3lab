import { ColorSwatch } from './ColorSwatch';
import { cx } from './ui';

/**
 * Höchstens `max` Farbtupfer nebeneinander (ohne Überlappung), danach „+4“. Die Reihe darf umbrechen und überdeckt nie
 * den Text daneben. Dekorativ – die Farbnamen stehen an anderer Stelle (bzw. als `sr-only` beim Aufrufer).
 */
export function TupferReihe({ farben, max = 8, className, tupfer = 'size-6' }: { farben: string[]; max?: number; className?: string; tupfer?: string }) {
  const zeigen = farben.slice(0, max);
  return (
    <span className={cx('inline-flex flex-wrap items-center gap-1', className)} aria-hidden>
      {zeigen.map((hex, i) => (
        <ColorSwatch key={i} hex={hex} className={tupfer} />
      ))}
      {farben.length > max && <span className="whitespace-nowrap text-hinweis font-bold text-stone-600">+{farben.length - max}</span>}
    </span>
  );
}
