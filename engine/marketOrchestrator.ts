import type {
  CreateMarketIntent,
  MarketProposal,
  OrchestrationResult,
  SafeWindowDecision,
} from "./types.js";

/**
 * Converts a safe local draft into a single, idempotent create-market intent.
 * The caller that consumes the intent is responsible for asking a wallet to
 * sign; this class never imports a chain client or sends a transaction.
 */
export class MarketOrchestrator {
  #intentsByProposalId = new Map<string, CreateMarketIntent>();

  queue(
    proposal: MarketProposal,
    decision: SafeWindowDecision,
    expectedOutcomeAt: number,
  ): OrchestrationResult {
    if (proposal.proposalId !== decision.proposalId) {
      throw new Error("市场草案与安全窗口决定不匹配。");
    }

    if (decision.status === "REJECTED") {
      return { accepted: false, reason: "SAFE_WINDOW_REJECTED" };
    }

    const existing = this.#intentsByProposalId.get(proposal.proposalId);
    if (existing !== undefined) {
      return { accepted: true, intent: existing };
    }

    const closeAt = decision.chainReadyAt + decision.effectiveBetWindowSeconds;
    if (closeAt > decision.latestFreezeAt || expectedOutcomeAt < closeAt) {
      throw new Error("安全窗口产生了无效的市场时间表。");
    }

    const intent: CreateMarketIntent = {
      intentId: `create:${proposal.proposalId}`,
      proposalId: proposal.proposalId,
      question: proposal.question,
      closeAt,
      resolveAt: expectedOutcomeAt,
      status: "QUEUED",
    };
    this.#intentsByProposalId.set(proposal.proposalId, intent);
    return { accepted: true, intent };
  }

  get queuedIntentCount(): number {
    return this.#intentsByProposalId.size;
  }
}
