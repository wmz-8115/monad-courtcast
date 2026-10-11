import { doubleFaultScenario } from "../engine/fixtures.js";
import { MarketOrchestrator } from "../engine/marketOrchestrator.js";
import { replayMatch } from "../engine/replay.js";
import { evaluateSafeWindow } from "../engine/safeWindow.js";
import type { SafeWindowPolicy } from "../engine/types.js";

const policy: SafeWindowPolicy = {
  estimatedDataDelaySeconds: 1,
  estimatedChainConfirmationSeconds: 2,
  safetyBufferSeconds: 2,
  minimumTradableWindowSeconds: 5,
};

const matchId = doubleFaultScenario[0].matchId;
const proposal = replayMatch(matchId, doubleFaultScenario)
  .flatMap((step) => step.proposals)
  .at(0);

if (proposal === undefined) {
  throw new Error("演示事件没有生成市场草案。");
}

const expectedOutcomeAt = proposal.triggerTimestamp + 40;
const decision = evaluateSafeWindow(proposal, expectedOutcomeAt, policy);
const result = new MarketOrchestrator().queue(proposal, decision, expectedOutcomeAt);

console.log("PointPulse Market Orchestrator 演示");
console.log(`草案：${proposal.question}`);
console.log(`Safe Window：${decision.status}`);

if (!result.accepted || result.intent === undefined) {
  console.log(`未进入创建队列：${result.reason}`);
  process.exitCode = 1;
} else {
  console.log(`创建指令：${result.intent.intentId}`);
  console.log(`createMarket 问题：${result.intent.question}`);
  console.log(`closeAt：${result.intent.closeAt}`);
  console.log(`resolveAt：${result.intent.resolveAt}`);
  console.log("仅生成本地指令；未打开 MetaMask，未发送链上交易。");
}
