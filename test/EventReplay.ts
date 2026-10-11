import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { doubleFaultScenario } from "../engine/fixtures.js";
import { replayMatch } from "../engine/replay.js";

describe("tennis event replay", () => {
  it("replays the fixture deterministically and drafts one double-fault market", () => {
    const matchId = doubleFaultScenario[0].matchId;
    const firstReplay = replayMatch(matchId, doubleFaultScenario);
    const secondReplay = replayMatch(matchId, doubleFaultScenario);

    assert.deepEqual(firstReplay, secondReplay);
    assert.equal(firstReplay.length, 4);
    assert.equal(firstReplay.every((step) => step.accepted), true);
    assert.equal(firstReplay.at(-1)?.state.state, "BETWEEN_POINTS");

    const proposals = firstReplay.flatMap((step) => step.proposals);
    assert.deepEqual(proposals, [
      {
        proposalId: "sim-sinner-vs-alcaraz:3:DOUBLE_FAULT",
        template: "DOUBLE_FAULT",
        matchId: "sim-sinner-vs-alcaraz",
        subject: "SINNER",
        question: "Will SINNER double fault?",
        options: ["YES", "NO"],
        triggerEventId: "sim-sinner-alcaraz-003",
        triggerSequence: 3,
        triggerTimestamp: 1_791_051_207,
        recommendedBetWindowSeconds: 30,
        status: "DRAFT",
      },
    ]);
  });
});
