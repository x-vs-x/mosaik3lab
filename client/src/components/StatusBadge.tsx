import { useMasterData } from '../lib/config';
import { statusMeta } from '../lib/constants';
import { Badge, cx } from './ui';

/** Status-Badge mit Symbol und Name (aus den Stammdaten). */
export function StatusBadge({ status }: { status: string }) {
  const md = useMasterData();
  const meta = statusMeta(md, status);
  return (
    // Kurze Namen bleiben ganz („Off|en“ bei großer Schrift neben der Zeitangabe)
    <Badge className={cx(meta.chip, 'shrink-0 whitespace-nowrap')} icon={meta.icon}>
      {meta.label}
    </Badge>
  );
}
