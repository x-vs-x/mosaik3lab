import { CircleCheck, CircleX, Search, Inbox, type LucideIcon } from 'lucide-react';
import { Badge, cx } from '../../components/ui';
import { withBase } from '../../lib/basePath';
import { PROPOSAL_STATUS_LABELS, type ProposalStatus } from '@mosaik3lab/shared/vorschlaege';

// Darstellung der Vorschläge; Typen, Listen und Grenzen kommen aus shared/src/vorschlaege.ts.
export type { OwnProposal, Proposal, ProposalStatus, ProposalUrgency } from '@mosaik3lab/shared/vorschlaege';
export {
  MAX_PROPOSAL_LINKS as MAX_LINKS,
  MAX_PROPOSAL_PHOTOS as MAX_PHOTOS,
  PROPOSAL_STATUS_LABELS as STATUS_LABELS,
  PROPOSAL_URGENCY_LABELS as URGENCY_LABELS,
} from '@mosaik3lab/shared/vorschlaege';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const STATUS_STYLE: Record<ProposalStatus, { icon: LucideIcon; className: string }> = {
  neu: { icon: Inbox, className: 'bg-sky-50 text-sky-900 ring-sky-300' },
  in_pruefung: { icon: Search, className: 'bg-amber-50 text-amber-900 ring-amber-300' },
  umgesetzt: { icon: CircleCheck, className: 'bg-emerald-50 text-emerald-900 ring-emerald-300' },
  abgelehnt: { icon: CircleX, className: 'bg-stone-100 text-stone-800 ring-stone-300' },
};

export const photoUrl = (proposalId: string, file: string) =>
  withBase(`/api/proposals/${encodeURIComponent(proposalId)}/photos/${encodeURIComponent(file)}`);

export function ProposalStatusBadge({ status, className }: { status: ProposalStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <Badge icon={s.icon} className={cx(s.className, className)}>
      {PROPOSAL_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Links der Lehrkraft: nur http/https anklickbar, in neuem Tab, ohne Referrer. */
export function SafeLinks({ links }: { links: string[] }) {
  if (links.length === 0) return null;
  return (
    <ul>
      {links.map((l) => (
        <li key={l} className="break-all">
          {/^https?:\/\//i.test(l) ? (
            // eigene Zeile je Link: als Block mit Polster gut antippbar (≥ 41 px), lange Adressen brechen um
            <a href={l} target="_blank" rel="noopener noreferrer nofollow" className="inline-block py-2.5 font-bold text-brand-800 underline underline-offset-2">
              {l}
              <span className="sr-only"> (öffnet in neuem Tab)</span>
            </a>
          ) : (
            l
          )}
        </li>
      ))}
    </ul>
  );
}

export function PhotoGrid({ proposalId, photos }: { proposalId: string; photos: string[] }) {
  if (photos.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-3">
      {photos.map((f, i) => (
        <li key={f}>
          <a href={photoUrl(proposalId, f)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl ring-1 ring-stone-300 hover:ring-brand-600">
            <img src={photoUrl(proposalId, f)} alt={`Foto ${i + 1} von ${photos.length}`} className="size-28 object-cover" loading="lazy" />
            <span className="sr-only">Foto in voller Größe öffnen</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
