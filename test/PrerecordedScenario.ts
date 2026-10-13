import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAutoBetPlan,
  prerecordedTennisMarkets,
} from "../engine/prerecordedScenario.js";

describe("CourtCast prerecorded tennis scenario", () => {
  it("contains five intentionally overlapping short markets", () => {
    assert.equal(prerecordedTennisMarkets.length, 5);
    assert.equal(prerecordedTennisMarkets[0].videoStartSeconds, 18);
    assert.equal(prerecordedTennisMarkets[0].publicationLeadSeconds, 0);
    assert.ok(
      prerecordedTennisMarkets[2].videoStartSeconds
        < prerecordedTennisMarkets[1].videoStartSeconds
          + prerecordedTennisMarkets[1].bettingWindowSeconds,
    );
  });

  it("builds a deterministic, faucet-budgeted operator plan", () => {
    const market = prerecordedTennisMarkets[1];
    const firstPlan = buildAutoBetPlan(market);
    const secondPlan = buildAutoBetPlan(market);

    assert.deepEqual(firstPlan, secondPlan);
    assert.ok(firstPlan.length > 0);
    assert.ok(firstPlan.every((order) => order.amountMusdc >= 3 && order.amountMusdc <= 7));
    assert.ok(firstPlan.every((order) => order.offsetSeconds < market.bettingWindowSeconds - 3));
    const totalBudget = prerecordedTennisMarkets.flatMap(buildAutoBetPlan).reduce((sum, order) => sum + order.amountMusdc, 0);
    assert.ok(totalBudget <= 100);
  });
});
