// Vorschläge der Lehrkräfte für Druckteile, die es im Katalog noch nicht gibt (Tabelle `vorschlag`).
// Typen, Listen und Schemas: shared/src/vorschlaege.ts.
import type { OwnProposal, Proposal } from '@mosaik3lab/shared/vorschlaege';

export {
  MAX_PROPOSAL_LINKS,
  MAX_PROPOSAL_PHOTOS,
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_URGENCIES,
  PROPOSAL_URGENCY_LABELS,
  type Proposal,
  type ProposalStatus,
  type ProposalUrgency,
} from '@mosaik3lab/shared/vorschlaege';

/** Sicht der Lehrkraft auf ihren Vorschlag – ohne interne Felder. */
export function toOwnProposal(p: Proposal): OwnProposal {
  return {
    id: p.id,
    number: p.number,
    title: p.title,
    description: p.description,
    usage: p.usage,
    links: p.links,
    quantity: p.quantity,
    urgency: p.urgency,
    status: p.status,
    reply: p.reply,
    photos: p.photos,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
