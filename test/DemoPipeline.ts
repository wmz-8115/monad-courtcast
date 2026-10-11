import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runDemoPipeline } from "../engine/demoPipeline.js";

describe("demo event-to-market pipeline", () => {
  it("connects replay, safe-window, orchestration, and settlement without chain access", () => {
    const result = runDemoPipeline(1_000);

    assert.deepEqual(result.decision, {
      proposalId: "sim-sinner-vs-alcaraz:3:DOUBLE_FAULT",
      status: "APPROVED",
      chainReadyAt: 1_013,
      latestFreezeAt: 1_048,
      effectiveBetWindowSeconds: 30,
    });
    assert.equal(result.orchestration.intent?.closeAt, 1_043);
    assert.equal(result.orchestration.intent?.resolveAt, 1_050);
    assert.equal(result.settlement.draft?.outcome, "YES");
    assert.equal(result.settlement.draft?.status, "PENDING_ORACLE");
  });
});
