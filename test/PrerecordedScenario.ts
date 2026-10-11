import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAutoBetPlan,
  prerecordedTennisMarkets,
} from "../engine/prerecordedScenario.js";

describe("prerecorded tennis scenario", () => {
  it("contains five intentionally overlapping short markets", () => {
    assert.equal(prerecordedTennisMarkets.length, 5);
    assert.equal(prerecordedTennisMarkets[0].videoStartSeconds, 15);
    assert.equal(prerecordedTennisMarkets[0].publicationLeadSeconds, 8);
    assert.ok(
      prerecordedTennisMarkets[1].videoStartSeconds
        < prerecordedTennisMarkets[0].videoStartSeconds
          + prerecordedTennisMarkets[0].bettingWindowSeconds,
    );
  });

  it("builds a deterministic operator plan every roughly three seconds", () => {
    const market = prerecordedTennisMarkets[1];
    const firstPlan = buildAutoBetPlan(market);
    const secondPlan = buildAutoBetPlan(market);

    assert.deepEqual(firstPlan, secondPlan);
    assert.ok(firstPlan.length > 0);
    assert.ok(firstPlan.every((order) => order.amountMusdc >= 20 && order.amountMusdc <= 50));
    assert.ok(firstPlan.every((order) => order.offsetSeconds < market.bettingWindowSeconds));
    assert.ok(firstPlan.every((order, index) => index === 0 || order.offsetSeconds - firstPlan[index - 1].offsetSeconds >= 2));
    assert.ok(firstPlan.every((order, index) => index === 0 || order.offsetSeconds - firstPlan[index - 1].offsetSeconds <= 4));
  });
});
