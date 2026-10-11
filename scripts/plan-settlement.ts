import { doubleFaultScenario } from "../engine/fixtures.js";
import { replayMatch } from "../engine/replay.js";
import { SettlementPlanner } from "../engine/settlementPlanner.js";

const matchId = doubleFaultScenario[0].matchId;
const steps = replayMatch(matchId, doubleFaultScenario);
const proposal = steps.flatMap((step) => step.proposals).at(0);
const outcomeEvent = doubleFaultScenario.at(-1);

if (proposal === undefined || outcomeEvent === undefined) {
  throw new Error("演示事件不完整，无法生成结算草案。");
}

const result = new SettlementPlanner().observe(proposal, outcomeEvent);

console.log("PointPulse Settlement Planner 演示");
console.log(`市场草案：${proposal.question}`);
console.log(`结果事件：${outcomeEvent.eventType}`);

if (!result.planned || result.draft === undefined) {
  console.log(`未生成结算草案：${result.reason}`);
  process.exitCode = 1;
} else {
  console.log(`结算草案：${result.draft.settlementId}`);
  console.log(`建议结果：${result.draft.outcome}`);
  console.log(`证据事件：${result.draft.sourceEventId}`);
  console.log("仅生成本地 Oracle 待确认草案；未打开 MetaMask，未调用 resolveMarket。");
}
