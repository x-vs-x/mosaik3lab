import { useState } from 'react';
import { bildQuellen, type BildGroesse } from '../lib/bildQuellen';
import { useMasterData } from '../lib/config';
import { categoryMeta } from '../lib/constants';
import { cx } from './ui';

/**
 * Produktbild oder – falls (noch) kein Foto vorhanden – eine ruhige
 * Illustration in der Farbe der Kategorie.
 *
 * `groesse` je Ort: „karte“ (Katalogkarte, Standard), „mini“ (kleine Vorschauen: Ähnliche Druckteile, Listen),
 * „original“ (Galerie). Mit srcset/sizes wählt der Browser die passende Fassung; `sizes` überschreibt die übliche
 * Anzeigebreite des Orts. `vorrang`: wichtigstes Bild der Seite (erstes Galeriebild) – sofort und zuerst laden statt
 * „lazy“ (sonst wartet der Browser auf das Layout). Bis das Bild da ist (der Server rechnet ein fehlendes Vorschaubild sofort), pulsiert ein Platzhalter.
 */
export function ItemImage({
  item,
  index = 0,
  className,
  iconSize = 'size-12 sm:size-16',
  groesse = 'karte',
  sizes,
  vorrang = false,
}: {
  /** Symbolbild nach der Kategorie (category) bzw. der Hauptkategorie (erste von categories). */
  item: { name: string; images: string[]; category?: string; categories?: string[] };
  index?: number;
  className?: string;
  iconSize?: string;
  groesse?: BildGroesse;
  sizes?: string;
  vorrang?: boolean;
}) {
  const md = useMasterData();
  const file = item.images[index];
  if (file) return <Foto key={`${file}-${groesse}`} file={file} groesse={groesse} sizes={sizes} vorrang={vorrang} alt={`Foto: ${item.name}`} className={className} />;
  const kategorie = item.category ?? item.categories?.[0] ?? '';
  const meta = categoryMeta(md, kategorie);
  const Icon = meta.icon;
  return (
    <div
      className={cx('mosaic-pattern relative grid size-full place-items-center bg-gradient-to-br', meta.tile, className)}
      role="img"
      aria-label={`Kein Foto vorhanden – Symbolbild für ${kategorie}`}
    >
      <div className="grid place-items-center rounded-3xl bg-white/80 p-3.5 sm:rounded-[1.75rem] sm:p-5 shadow-sm ring-1 ring-black/5 backdrop-blur-sm">
        <Icon className={cx(iconSize, meta.iconColor)} strokeWidth={1.6} aria-hidden />
      </div>
    </div>
  );
}

function Foto({ file, groesse, sizes, alt, className, vorrang }: { file: string; groesse: BildGroesse; sizes?: string; alt: string; className?: string; vorrang: boolean }) {
  const [geladen, setGeladen] = useState(false);
  const q = bildQuellen(file, groesse, sizes);
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onLoad/onError sind keine Bedienung
    <img
      src={q.src}
      srcSet={q.srcSet}
      sizes={q.sizes}
      alt={alt}
      loading={vorrang ? 'eager' : 'lazy'}
      fetchPriority={vorrang ? 'high' : undefined}
      decoding="async"
      // schon im Zwischenspeicher: sofort als geladen markieren
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0 && !geladen) setGeladen(true);
      }}
      onLoad={() => setGeladen(true)}
      onError={() => setGeladen(true)}
      className={cx('size-full object-cover', !geladen && 'animate-pulse bg-stone-200 motion-reduce:animate-none', className)}
    />
  );
}
