import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MarketOrchestrator } from "../engine/marketOrchestrator.js";
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

describe("Market Orchestrator", () => {
  it("turns an approved decision into contract-compatible timestamps", () => {
    const orchestrator = new MarketOrchestrator();
    const result = orchestrator.queue(
      proposal,
      evaluateSafeWindow(proposal, 140, policy),
      140,
    );

    assert.deepEqual(result, {
      accepted: true,
      intent: {
        intentId: "create:match-001:3:DOUBLE_FAULT",
        proposalId: proposal.proposalId,
        question: proposal.question,
        closeAt: 133,
        resolveAt: 140,
        status: "QUEUED",
      },
    });
  });

  it("does not queue a rejected safe-window decision", () => {
    const orchestrator = new MarketOrchestrator();
    const result = orchestrator.queue(
      proposal,
      evaluateSafeWindow(proposal, 109, policy),
      109,
    );

    assert.deepEqual(result, { accepted: false, reason: "SAFE_WINDOW_REJECTED" });
    assert.equal(orchestrator.queuedIntentCount, 0);
  });

  it("is idempotent when the same proposal is delivered twice", () => {
    const orchestrator = new MarketOrchestrator();
    const decision = evaluateSafeWindow(proposal, 140, policy);
    const first = orchestrator.queue(proposal, decision, 140);
    const second = orchestrator.queue(proposal, decision, 140);

    assert.deepEqual(second, first);
    assert.equal(orchestrator.queuedIntentCount, 1);
  });
});
