import type {
  MarketProposal,
  SafeWindowDecision,
  SafeWindowPolicy,
} from "./types.js";

/**
 * Answers whether a draft has enough remaining time to be useful and safe.
 * This remains a local, deterministic risk check; it sends no transaction.
 */
export function evaluateSafeWindow(
  proposal: MarketProposal,
  expectedOutcomeAt: number,
  policy: SafeWindowPolicy,
): SafeWindowDecision {
  const chainReadyAt =
    proposal.triggerTimestamp +
    policy.estimatedDataDelaySeconds +
    policy.estimatedChainConfirmationSeconds;
  const latestFreezeAt = expectedOutcomeAt - policy.safetyBufferSeconds;

  if (expectedOutcomeAt <= proposal.triggerTimestamp) {
    return {
      proposalId: proposal.proposalId,
      status: "REJECTED",
      reason: "OUTCOME_ALREADY_DUE",
      chainReadyAt,
      latestFreezeAt,
      effectiveBetWindowSeconds: 0,
    };
  }

  const usableWindowSeconds = Math.max(0, latestFreezeAt - chainReadyAt);
  if (usableWindowSeconds < policy.minimumTradableWindowSeconds) {
    return {
      proposalId: proposal.proposalId,
      status: "REJECTED",
      reason: "WINDOW_TOO_SHORT",
      chainReadyAt,
      latestFreezeAt,
      effectiveBetWindowSeconds: usableWindowSeconds,
    };
  }

  return {
    proposalId: proposal.proposalId,
    status: "APPROVED",
    chainReadyAt,
    latestFreezeAt,
    effectiveBetWindowSeconds: Math.min(
      proposal.recommendedBetWindowSeconds,
      usableWindowSeconds,
    ),
  };
}
