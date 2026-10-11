import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MatchEventProcessor } from "../engine/eventProcessor.js";
import type { PointPulseEvent } from "../engine/types.js";

function event(sequence: number, eventType: PointPulseEvent["eventType"]): PointPulseEvent {
  return {
    eventId: `evt-${sequence}`,
    matchId: "match-001",
    eventType,
    server: "SINNER",
    score: "30-15",
    timestamp: 1_791_051_234 + sequence,
    sequence,
    schemaVersion: "1.0",
  };
}

describe("Tennis Event → State → Market Draft", () => {
  it("turns a first-serve fault into one deterministic double-fault market draft", () => {
    const processor = new MatchEventProcessor("match-001");
    processor.process(event(1, "MATCH_STARTED"));
    processor.process(event(2, "FIRST_SERVE_READY"));
    const result = processor.process(event(3, "FIRST_SERVE_FAULT"));

    assert.equal(result.accepted, true);
    assert.equal(result.state.state, "SECOND_SERVE_READY");
    assert.deepEqual(result.proposals, [{
      proposalId: "match-001:3:DOUBLE_FAULT",
      template: "DOUBLE_FAULT",
      matchId: "match-001",
      subject: "SINNER",
      question: "Will SINNER double fault?",
      options: ["YES", "NO"],
      triggerEventId: "evt-3",
      triggerSequence: 3,
      triggerTimestamp: 1_791_051_237,
      recommendedBetWindowSeconds: 30,
      status: "DRAFT",
    }]);
  });

  it("ignores duplicate and stale feed messages so they cannot open a second market", () => {
    const processor = new MatchEventProcessor("match-001");
    processor.process(event(1, "MATCH_STARTED"));
    processor.process(event(2, "FIRST_SERVE_READY"));
    processor.process(event(3, "FIRST_SERVE_FAULT"));

    const duplicate = processor.process(event(3, "FIRST_SERVE_FAULT"));
    assert.equal(duplicate.accepted, false);
    assert.equal(duplicate.reason, "DUPLICATE_EVENT");
    assert.deepEqual(duplicate.proposals, []);

    const stale = processor.process({ ...event(2, "FIRST_SERVE_READY"), eventId: "evt-stale-2" });
    assert.equal(stale.accepted, false);
    assert.equal(stale.reason, "STALE_SEQUENCE");
    assert.equal(processor.state.state, "SECOND_SERVE_READY");
  });

  it("returns to BETWEEN_POINTS when the second serve is a fault", () => {
    const processor = new MatchEventProcessor("match-001");
    processor.process(event(1, "MATCH_STARTED"));
    processor.process(event(2, "FIRST_SERVE_READY"));
    processor.process(event(3, "FIRST_SERVE_FAULT"));
    const result = processor.process(event(4, "SECOND_SERVE_FAULT"));

    assert.equal(result.state.state, "BETWEEN_POINTS");
    assert.deepEqual(result.proposals, []);
  });
});
