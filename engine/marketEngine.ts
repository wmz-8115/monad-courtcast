import type { CurrentMatchState, MarketProposal, PointPulseEvent } from "./types.js";

/**
 * Converts an allowed state transition into a market draft. DRAFT means that
 * nothing has been sent to Monad yet; a future orchestrator will decide if the
 * safe trading window is large enough before calling createMarket.
 */
export function proposeMarkets(
  previous: CurrentMatchState,
  next: CurrentMatchState,
  event: PointPulseEvent,
): MarketProposal[] {
  if (
    previous.state === "FIRST_SERVE_READY"
    && event.eventType === "FIRST_SERVE_FAULT"
    && next.state === "SECOND_SERVE_READY"
    && next.server !== undefined
  ) {
    return [{
      proposalId: `${event.matchId}:${event.sequence}:DOUBLE_FAULT`,
      template: "DOUBLE_FAULT",
      matchId: event.matchId,
      subject: next.server,
      question: `Will ${next.server} double fault?`,
      options: ["YES", "NO"],
      triggerEventId: event.eventId,
      triggerSequence: event.sequence,
      triggerTimestamp: event.timestamp,
      recommendedBetWindowSeconds: 30,
      status: "DRAFT",
    }];
  }

  return [];
}
