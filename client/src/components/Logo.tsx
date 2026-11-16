import type { CSSProperties } from 'react';
import { cx } from './ui';

// Farben der Mosaiksteine aus dem Logo der Mosaikschule.
export const MOSAIC = {
  blue: '#3ccbfc',
  red: '#f23838',
  yellow: '#f5f55a',
  orange: '#fa9b4d',
  purple: '#b85e99',
  green: '#56bc52',
  text: '#595959',
} as const;

/** Schlichte, humanistische Sans-Serif wie im Schullogo. */
export const LOGO_FONT = "'Source Sans 3', 'Segoe UI', sans-serif";

/** Kompakte Bildmarke: die sechs Mosaiksteine aus dem Schullogo. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 36" className={className} aria-hidden="true">
      <rect x="10" y="0" width="11" height="11" fill={MOSAIC.red} />
      <rect x="1" y="12" width="7" height="7" fill={MOSAIC.blue} />
      <rect x="23" y="6" width="12" height="12" fill={MOSAIC.yellow} />
      <rect x="23" y="20" width="12" height="12" fill={MOSAIC.orange} />
      <rect x="36.5" y="20" width="7" height="7" fill={MOSAIC.purple} />
      <rect x="8" y="20" width="13" height="13" fill={MOSAIC.green} />
    </svg>
  );
}

/**
 * Nachbau des Logos der Mosaikschule als Vektorgrafik
 * (Vorlage: Kopfbereich von mosaikschule-lu.de).
 */
export function SchoolLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 142" className={className} role="img" aria-label="Logo der Mosaikschule – Schule mit dem Förderschwerpunkt motorische Entwicklung">
      <rect x="26" y="0" width="34" height="34" fill={MOSAIC.red} />
      <rect x="0" y="41" width="21" height="21" fill={MOSAIC.blue} />
      <text x="24" y="62" fill={MOSAIC.text} fontSize="29" fontWeight="400" fontFamily={LOGO_FONT} textLength="117" lengthAdjust="spacingAndGlyphs">
        MOSAIK
      </text>
      <rect x="147" y="23" width="39" height="39" fill={MOSAIC.yellow} />
      <text x="90" y="85" fill={MOSAIC.text} fontSize="19" fontWeight="400" fontFamily={LOGO_FONT} textLength="52" lengthAdjust="spacingAndGlyphs">
        Schule
      </text>
      <rect x="147" y="68" width="39" height="38" fill={MOSAIC.orange} />
      <rect x="190" y="68" width="22" height="21" fill={MOSAIC.purple} />
      <rect x="90" y="90" width="51" height="51" fill={MOSAIC.green} />
      <text x="147" y="119" fill={MOSAIC.text} fontSize="9.5" fontFamily={LOGO_FONT}>
        Schule mit dem Förderschwerpunkt
      </text>
      <text x="147" y="131" fill={MOSAIC.text} fontSize="9.5" fontFamily={LOGO_FONT}>
        motorische Entwicklung
      </text>
    </svg>
  );
}

/**
 * Wortmarke „MOSAIK³LAB“ in der Logo-Schrift.
 * `light`: für dunkle/rote Hintergründe (alles in Weiß).
 */
export function Wordmark({ className, light }: { className?: string; light?: boolean }) {
  const style: CSSProperties = { fontFamily: LOGO_FONT, color: light ? '#fff' : MOSAIC.text };
  return (
    <span className={cx('font-normal uppercase tracking-[0.06em]', className)} style={style}>
      <span aria-hidden>
        MOSAIK
        {/* Echtes Hochzahl-Zeichen: Größe und Höhe kommen aus der Schrift, kein <sup> (würde doppelt verkleinern). */}
        <span className={cx('ml-[0.02em] mr-[0.04em] font-semibold', light ? 'text-white' : 'text-brand-700')}>³</span>
        <span className={light ? 'text-white' : 'text-brand-700'}>LAB</span>
      </span>
      <span className="sr-only">Mosaik³LAB</span>
    </span>
  );
}

export function Logo({ className, subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <span className={cx('flex items-center gap-3', className)}>
      <LogoMark className="h-9 w-11 shrink-0" />
      <span className="leading-tight">
        <Wordmark className="block text-[1.4rem] leading-none" />
        {subtitle && <span className="mt-1 block text-[0.85rem] text-stone-600">3D-gedruckte Hilfs- und Lehrmittel · Mosaikschule</span>}
      </span>
    </span>
  );
}
