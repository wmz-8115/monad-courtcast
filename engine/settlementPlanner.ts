import type {
  MarketProposal,
  PointPulseEvent,
  SettlementDraft,
  SettlementPlanningResult,
} from "./types.js";

function deriveOutcome(
  proposal: MarketProposal,
  event: PointPulseEvent,
): "YES" | "NO" | undefined {
  if (
    event.matchId !== proposal.matchId ||
    event.sequence <= proposal.triggerSequence ||
    event.server !== proposal.subject
  ) {
    return undefined;
  }

  if (event.eventType === "SECOND_SERVE_FAULT") return "YES";
  if (event.eventType === "SECOND_SERVE_IN") return "NO";
  return undefined;
}

/**
 * Turns decisive feed evidence into a single local resolution draft.
 * A future Oracle adapter must map proposalId to an on-chain marketId and ask
 * the authorized wallet to call resolveMarket; this module never does so.
 */
export class SettlementPlanner {
  #draftsByProposalId = new Map<string, SettlementDraft>();

  observe(
    proposal: MarketProposal,
    event: PointPulseEvent,
  ): SettlementPlanningResult {
    const existing = this.#draftsByProposalId.get(proposal.proposalId);
    if (existing !== undefined) {
      return { planned: false, reason: "ALREADY_PLANNED", draft: existing };
    }

    const outcome = deriveOutcome(proposal, event);
    if (outcome === undefined) {
      return { planned: false, reason: "IRRELEVANT_EVENT" };
    }

    const draft: SettlementDraft = {
      settlementId: `resolve:${proposal.proposalId}:${event.eventId}`,
      proposalId: proposal.proposalId,
      matchId: proposal.matchId,
      outcome,
      sourceEventId: event.eventId,
      sourceSequence: event.sequence,
      status: "PENDING_ORACLE",
    };
    this.#draftsByProposalId.set(proposal.proposalId, draft);
    return { planned: true, draft };
  }
}
