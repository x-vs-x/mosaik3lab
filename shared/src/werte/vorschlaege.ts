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
/** Längen und Menge eines Vorschlags (Schema in ../vorschlaege.ts, Hinweise im Formular). */
export const PROPOSAL_TITLE_MIN = 3;
export const PROPOSAL_TITLE_MAX = 100;
export const PROPOSAL_DESC_MIN = 10;
export const PROPOSAL_DESC_MAX = 3000;
export const PROPOSAL_USAGE_MAX = 1000;
export const MAX_PROPOSAL_QUANTITY = 100;
export const MAX_PROPOSAL_LINKS = 5;
