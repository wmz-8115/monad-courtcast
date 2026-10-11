import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateSafeWindow } from "../engine/safeWindow.js";
import type { MarketProposal, SafeWindowPolicy } from "../engine/types.js";

const policy: SafeWindowPolicy = {
  estimatedDataDelaySeconds: 1,
  estimatedChainConfirmationSeconds: 2,
  safetyBufferSeconds: 2,
  minimumTradableWindowSeconds: 5,
};

const proposal: MarketProposal = {
  proposalId: "match-001:3:DOUBLE_FAULT",
  template: "DOUBLE_FAULT",
  matchId: "match-001",
  subject: "SINNER",
  question: "Will SINNER double fault?",
  options: ["YES", "NO"],
  triggerEventId: "evt-3",
  triggerSequence: 3,
  triggerTimestamp: 100,
  recommendedBetWindowSeconds: 30,
  status: "DRAFT",
};

describe("Safe Window", () => {
  it("approves a usable window and caps it at the market recommendation", () => {
    assert.deepEqual(evaluateSafeWindow(proposal, 140, policy), {
      proposalId: proposal.proposalId,
      status: "APPROVED",
      chainReadyAt: 103,
      latestFreezeAt: 138,
      effectiveBetWindowSeconds: 30,
    });
  });

  it("rejects a market when latency and safety buffer leave too little time", () => {
    assert.deepEqual(evaluateSafeWindow(proposal, 109, policy), {
      proposalId: proposal.proposalId,
      status: "REJECTED",
      reason: "WINDOW_TOO_SHORT",
      chainReadyAt: 103,
      latestFreezeAt: 107,
      effectiveBetWindowSeconds: 4,
    });
  });

  it("rejects an event whose expected outcome is already due", () => {
    assert.deepEqual(evaluateSafeWindow(proposal, 100, policy), {
      proposalId: proposal.proposalId,
      status: "REJECTED",
      reason: "OUTCOME_ALREADY_DUE",
      chainReadyAt: 103,
      latestFreezeAt: 98,
      effectiveBetWindowSeconds: 0,
    });
  });
});
