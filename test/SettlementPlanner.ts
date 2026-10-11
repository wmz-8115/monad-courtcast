import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SettlementPlanner } from "../engine/settlementPlanner.js";
import type { MarketProposal, PointPulseEvent } from "../engine/types.js";

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

function event(eventId: string, eventType: PointPulseEvent["eventType"]): PointPulseEvent {
  return {
    eventId,
    matchId: "match-001",
    eventType,
    server: "SINNER",
    score: "30-30",
    timestamp: 110,
    sequence: 4,
    schemaVersion: "1.0",
  };
}

describe("Settlement Planner", () => {
  it("turns a second-serve fault into a pending YES settlement", () => {
    const result = new SettlementPlanner().observe(
      proposal,
      event("evt-4-fault", "SECOND_SERVE_FAULT"),
    );

    assert.deepEqual(result, {
      planned: true,
      draft: {
        settlementId: "resolve:match-001:3:DOUBLE_FAULT:evt-4-fault",
        proposalId: proposal.proposalId,
        matchId: proposal.matchId,
        outcome: "YES",
        sourceEventId: "evt-4-fault",
        sourceSequence: 4,
        status: "PENDING_ORACLE",
      },
    });
  });

  it("turns a second serve in into a pending NO settlement", () => {
    const result = new SettlementPlanner().observe(
      proposal,
      event("evt-4-in", "SECOND_SERVE_IN"),
    );

    assert.equal(result.planned, true);
    assert.equal(result.draft?.outcome, "NO");
  });

  it("ignores unrelated evidence and does not create two settlements", () => {
    const planner = new SettlementPlanner();
    const irrelevant = planner.observe(proposal, event("evt-4-point", "POINT_WON"));
    const first = planner.observe(proposal, event("evt-4-fault", "SECOND_SERVE_FAULT"));
    const duplicate = planner.observe(proposal, event("evt-5-in", "SECOND_SERVE_IN"));

    assert.deepEqual(irrelevant, { planned: false, reason: "IRRELEVANT_EVENT" });
    assert.equal(first.planned, true);
    assert.equal(duplicate.planned, false);
    assert.equal(duplicate.reason, "ALREADY_PLANNED");
    assert.equal(duplicate.draft?.outcome, "YES");
  });
});
