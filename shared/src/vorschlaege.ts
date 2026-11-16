import { z } from 'zod';
import { httpLink } from './basis';

// Vorschläge der Lehrkräfte für Druckteile, die es im Katalog noch nicht gibt.

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

export const proposalInputSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(3000),
  /** Wofür / in welcher Situation das Druckteil gebraucht wird. */
  usage: z.string().trim().max(1000).default(''),
  links: z
    .array(httpLink)
    .max(MAX_PROPOSAL_LINKS)
    .transform((l) => [...new Set(l)])
    .default([]),
  quantity: z.number().int().min(1).max(100).default(1),
  urgency: z.enum(PROPOSAL_URGENCIES).default('normal'),
});
export type ProposalInput = z.infer<typeof proposalInputSchema>;

export const proposalUpdateSchema = z.object({
  status: z.enum(PROPOSAL_STATUSES),
  /** Antwort des Teams an die Lehrkraft. */
  reply: z.string().trim().max(2000).default(''),
});

export type Proposal = ProposalInput & {
  id: string;
  /** Lesbare Nummer VOR-JJJJ-NNNN – vergibt der Speicher beim Anlegen. */
  number: string;
  requesterId: string | null;
  requesterEmail: string;
  status: ProposalStatus;
  reply: string;
  /** Artikel (Entwurf), in den der Vorschlag umgewandelt wurde. */
  itemId: string | null;
  /** Dateinamen der Fotos (<datei-id>.<endung>), Reihenfolge wie hochgeladen. */
  photos: string[];
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

/** Sicht der Lehrkraft auf ihren Vorschlag (GET /api/proposals/mine) – ohne interne Felder. */
export type OwnProposal = Omit<Proposal, 'requesterId' | 'requesterEmail' | 'itemId' | 'updatedByUserId'>;
