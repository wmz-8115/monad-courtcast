import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDemoRunPlan } from "../engine/demoRunPlan.js";
import { prerecordedTennisMarkets } from "../engine/prerecordedScenario.js";

describe("demo run plan", () => {
  it("schedules create, operator bets, freeze, resolve, and claim for every market", () => {
    const plan = buildDemoRunPlan(prerecordedTennisMarkets);
    const creates = plan.filter((action) => action.type === "CREATE");
    const freezes = plan.filter((action) => action.type === "FREEZE");
    const resolves = plan.filter((action) => action.type === "RESOLVE");
    const claims = plan.filter((action) => action.type === "CLAIM");
    const autoBets = plan.filter((action) => action.type === "AUTO_BET");

    assert.equal(creates.length, 5);
    assert.equal(freezes.length, 5);
    assert.equal(resolves.length, 5);
    assert.equal(claims.length, 5);
    assert.equal(autoBets.length, 14);
    assert.equal(plan[0].type, "CREATE");
    assert.equal(plan[0].atOffsetSeconds, Math.min(...prerecordedTennisMarkets.map((market) => market.videoStartSeconds - market.publicationLeadSeconds)));
    assert.ok(plan.every((action, index) => index === 0 || action.atOffsetSeconds >= plan[index - 1].atOffsetSeconds));
  });

  it("keeps action times consistent with each market's lifecycle", () => {
    const plan = buildDemoRunPlan([prerecordedTennisMarkets[0]]);
    const market = prerecordedTennisMarkets[0];
    const freeze = plan.find((action) => action.type === "FREEZE");
    const resolve = plan.find((action) => action.type === "RESOLVE");
    const claim = plan.find((action) => action.type === "CLAIM");

    assert.equal(freeze?.atOffsetSeconds, market.videoStartSeconds + market.bettingWindowSeconds);
    assert.equal(resolve?.atOffsetSeconds, market.videoStartSeconds + market.bettingWindowSeconds + market.resolveDelaySeconds);
    assert.equal(claim?.atOffsetSeconds, resolve?.atOffsetSeconds);
  });
});
