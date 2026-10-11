import {
  buildAutoBetPlan,
  type AutoBetInstruction,
  type PrewrittenMarket,
} from "./prerecordedScenario.js";

export type DemoRunAction =
  | { type: "CREATE"; market: PrewrittenMarket }
  | { type: "AUTO_BET"; market: PrewrittenMarket; bet: AutoBetInstruction }
  | { type: "FREEZE"; market: PrewrittenMarket }
  | { type: "RESOLVE"; market: PrewrittenMarket };

export type ScheduledDemoAction = DemoRunAction & {
  atOffsetSeconds: number;
};

const actionPriority: Record<DemoRunAction["type"], number> = {
  CREATE: 0,
  AUTO_BET: 1,
  FREEZE: 2,
  RESOLVE: 3,
};

/** Builds the entire deterministic action schedule before any chain call occurs. */
export function buildDemoRunPlan(
  markets: readonly PrewrittenMarket[],
): ScheduledDemoAction[] {
  const actions: ScheduledDemoAction[] = [];

  for (const market of markets) {
    actions.push({
      type: "CREATE",
      market,
      atOffsetSeconds: Math.max(0, market.videoStartSeconds - market.publicationLeadSeconds),
    });
    for (const bet of buildAutoBetPlan(market)) {
      actions.push({
        type: "AUTO_BET",
        market,
        bet,
        atOffsetSeconds: market.videoStartSeconds + bet.offsetSeconds,
      });
    }
    actions.push({
      type: "FREEZE",
      market,
      atOffsetSeconds: market.videoStartSeconds + market.bettingWindowSeconds,
    });
    actions.push({
      type: "RESOLVE",
      market,
      atOffsetSeconds: market.videoStartSeconds + market.bettingWindowSeconds + market.resolveDelaySeconds,
    });
  }

  return actions.sort((left, right) =>
    left.atOffsetSeconds - right.atOffsetSeconds
    || actionPriority[left.type] - actionPriority[right.type]
    || left.market.id.localeCompare(right.market.id),
  );
}
