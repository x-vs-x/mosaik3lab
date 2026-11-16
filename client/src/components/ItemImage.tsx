import { imageUrl } from '../lib/api';
import { useMasterData } from '../lib/config';
import { categoryMeta } from '../lib/constants';
import { cx } from './ui';

/**
 * Produktbild oder – falls (noch) kein Foto vorhanden – eine ruhige
 * Illustration in der Farbe der Kategorie.
 */
export function ItemImage({
  item,
  index = 0,
  className,
  iconSize = 'size-12 sm:size-16',
}: {
  item: { name: string; category: string; images: string[] };
  index?: number;
  className?: string;
  iconSize?: string;
}) {
  const md = useMasterData();
  const file = item.images[index];
  if (file) {
    return (
      <img
        src={imageUrl(file)}
        alt={`Foto: ${item.name}`}
        loading="lazy"
        className={cx('size-full object-cover', className)}
      />
    );
  }
  const meta = categoryMeta(md, item.category);
  const Icon = meta.icon;
  return (
    <div
      className={cx('mosaic-pattern relative grid size-full place-items-center bg-gradient-to-br', meta.tile, className)}
      role="img"
      aria-label={`Kein Foto vorhanden – Symbolbild für ${item.category}`}
    >
      <div className="grid place-items-center rounded-3xl bg-white/80 p-3.5 sm:rounded-[1.75rem] sm:p-5 shadow-sm ring-1 ring-black/5 backdrop-blur-sm">
        <Icon className={cx(iconSize, meta.iconColor)} strokeWidth={1.6} aria-hidden />
      </div>
    </div>
  );
}
