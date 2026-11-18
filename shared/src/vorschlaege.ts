import { z } from 'zod';
import { httpLink } from './basis';
import {
  MAX_PROPOSAL_LINKS,
  MAX_PROPOSAL_QUANTITY,
  PROPOSAL_DESC_MAX,
  PROPOSAL_DESC_MIN,
  PROPOSAL_STATUSES,
  PROPOSAL_TITLE_MAX,
  PROPOSAL_TITLE_MIN,
  PROPOSAL_URGENCIES,
  PROPOSAL_USAGE_MAX,
  type ProposalStatus,
} from './werte/vorschlaege';

// Vorschläge der Lehrkräfte für Druckteile, die es im Katalog noch nicht gibt.
// Status, Dringlichkeit und Grenzen ohne zod: werte/vorschlaege.ts (auch für den Client) – hier wieder exportiert.
export * from './werte/vorschlaege';

export const proposalInputSchema = z.object({
  title: z.string().trim().min(PROPOSAL_TITLE_MIN).max(PROPOSAL_TITLE_MAX),
  description: z.string().trim().min(PROPOSAL_DESC_MIN).max(PROPOSAL_DESC_MAX),
  /** Wofür / in welcher Situation das Druckteil gebraucht wird. */
  usage: z.string().trim().max(PROPOSAL_USAGE_MAX).default(''),
  links: z
    .array(httpLink)
    .max(MAX_PROPOSAL_LINKS)
    .transform((l) => [...new Set(l)])
    .default([]),
  quantity: z.number().int().min(1).max(MAX_PROPOSAL_QUANTITY).default(1),
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

/** GET /api/proposals/anzahl-neu – Zähler in der Seitenleiste. */
export interface ProposalAnzahlNeu {
  neu: number;
}

/** POST /api/proposals/:id/convert – Vorschlag umgesetzt, Entwurf des Druckteils angelegt. */
export interface ProposalUmgewandelt {
  proposal: Proposal;
  itemId: string;
}

/** Sicht der Lehrkraft auf ihren Vorschlag (GET /api/proposals/mine) – ohne interne Felder. */
export type OwnProposal = Omit<Proposal, 'requesterId' | 'requesterEmail' | 'itemId' | 'updatedByUserId'>;
