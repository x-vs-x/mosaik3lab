// Vorschläge: Status, Dringlichkeit und Grenzen ohne zod – auch für den Client. Schemas und Typen in ../vorschlaege.ts.

export const PROPOSAL_STATUSES = ['neu', 'in_pruefung', 'umgesetzt', 'abgelehnt'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  neu: 'Neu',
  in_pruefung: 'In Prüfung',
  umgesetzt: 'Umgesetzt',
  abgelehnt: 'Abgelehnt',
};

export const PROPOSAL_URGENCIES = ['normal', 'bald', 'dringend'] as const;
export type ProposalUrgency = (typeof PROPOSAL_URGENCIES)[number];

export const PROPOSAL_URGENCY_LABELS: Record<ProposalUrgency, string> = {
  normal: 'Keine Eile',
  bald: 'Bald',
  dringend: 'Dringend',
};

export const MAX_PROPOSAL_PHOTOS = 5;
export const MAX_PROPOSAL_LINKS = 5;
