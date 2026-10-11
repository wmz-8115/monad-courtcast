import { doubleFaultScenario } from "./fixtures.js";
import { MarketOrchestrator } from "./marketOrchestrator.js";
import { replayMatch } from "./replay.js";
import { evaluateSafeWindow } from "./safeWindow.js";
import { SettlementPlanner } from "./settlementPlanner.js";
import type {
  OrchestrationResult,
  PointPulseEvent,
  SafeWindowDecision,
  SafeWindowPolicy,
  SettlementPlanningResult,
} from "./types.js";

export const demoSafeWindowPolicy: SafeWindowPolicy = {
  estimatedDataDelaySeconds: 1,
  estimatedChainConfirmationSeconds: 2,
  safetyBufferSeconds: 2,
  minimumTradableWindowSeconds: 5,
};

export type DemoPipelineResult = {
  decision: SafeWindowDecision;
  orchestration: OrchestrationResult;
  settlement: SettlementPlanningResult;
};

/**
 * Runs the deterministic demo as if its events arrived around `startedAt`.
 * This is intended for previews and tests, not as a source of real results.
 */
export function runDemoPipeline(startedAt: number): DemoPipelineResult {
  const offsets = [0, 5, 10, 50];
  const events: PointPulseEvent[] = doubleFaultScenario.map((event, index) => ({
    ...event,
    timestamp: startedAt + offsets[index],
  }));
  const matchId = events[0].matchId;
  const steps = replayMatch(matchId, events);
  const proposal = steps.flatMap((step) => step.proposals).at(0);
  const outcomeEvent = events.at(-1);

  if (proposal === undefined || outcomeEvent === undefined) {
    throw new Error("演示事件不完整，无法生成市场计划。");
  }

  const decision = evaluateSafeWindow(
    proposal,
    outcomeEvent.timestamp,
    demoSafeWindowPolicy,
  );
  const orchestration = new MarketOrchestrator().queue(
    proposal,
    decision,
    outcomeEvent.timestamp,
  );
  const settlement = new SettlementPlanner().observe(proposal, outcomeEvent);

  return { decision, orchestration, settlement };
}
