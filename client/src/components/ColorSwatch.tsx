import { isLightHex } from '../lib/colors';
import { cx } from './ui';

/** Runder Farbtupfer für Filament-Farben. Dekorativ – der Name steht immer daneben. */
export function ColorSwatch({ hex, className }: { hex: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-block size-5 shrink-0 rounded-full', isLightHex(hex) && 'ring-1 ring-inset ring-stone-300', className)}
      style={{ backgroundColor: hex }}
    />
  );
}
