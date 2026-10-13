import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DemoOperator, type OperatorChainAdapter } from "../engine/demoOperator.js";
import { prerecordedTennisMarkets } from "../engine/prerecordedScenario.js";

function createFakeAdapter(placeBets = true) {
  const calls: string[] = [];
  let nextMarketId = 0n;
  const adapter: OperatorChainAdapter = {
    async createMarket(question) {
      calls.push(`create:${question}`);
      const marketId = nextMarketId;
      nextMarketId += 1n;
      return marketId;
    },
    async placeBet(marketId, side, amount) {
      calls.push(`bet:${marketId}:${side}:${amount}`);
      return placeBets;
    },
    async freezeMarket(marketId) {
      calls.push(`freeze:${marketId}`);
    },
    async resolveMarket(marketId, outcome) {
      calls.push(`resolve:${marketId}:${outcome}`);
    },
    async claim(marketId) {
      calls.push(`claim:${marketId}`);
      return placeBets;
    },
  };
  return { adapter, calls };
}

describe("DemoOperator", () => {
  it("executes a market lifecycle once and records the resulting chain ID", async () => {
    const market = prerecordedTennisMarkets[0];
    const operator = new DemoOperator([market]);
    const { adapter, calls } = createFakeAdapter();
    operator.start(1_000);

    const first = await operator.tick(1_018, adapter);
    const bets = await operator.tick(1_037, adapter);
    const completed = [...bets, ...await operator.tick(1_050, adapter)];
    const repeated = await operator.tick(1_050, adapter);

    assert.deepEqual(first, [{ action: "CREATE", marketId: market.id, onchainMarketId: 0n }]);
    assert.ok(completed.some((action) => action.action === "AUTO_BET"));
    assert.ok(completed.some((action) => action.action === "FREEZE"));
    assert.ok(completed.some((action) => action.action === "RESOLVE"));
    assert.ok(completed.some((action) => action.action === "CLAIM"));
    assert.deepEqual(repeated, []);
    assert.equal(operator.onchainMarketIds.get(market.id), 0n);
    assert.equal(calls.filter((call) => call.startsWith("create:")).length, 1);
    assert.equal(calls.at(-1), "claim:0");
  });

  it("finishes a market even when demo liquidity is unavailable", async () => {
    const market = prerecordedTennisMarkets[0];
    const operator = new DemoOperator([market]);
    const { adapter } = createFakeAdapter(false);
    operator.start(1_000);

    await operator.tick(1_018, adapter);
    const bets = await operator.tick(1_037, adapter);
    const completed = [...bets, ...await operator.tick(1_050, adapter)];

    assert.ok(completed.some((action) => action.action === "AUTO_BET_SKIPPED"));
    assert.ok(completed.some((action) => action.action === "CLAIM_SKIPPED"));
    assert.equal(operator.isComplete, true);
  });
});
