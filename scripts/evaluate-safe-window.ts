import { doubleFaultScenario } from "../engine/fixtures.js";
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

// In a real adapter this estimate comes from the market template / sports model.
const expectedOutcomeAt = proposal.triggerTimestamp + 40;
const decision = evaluateSafeWindow(proposal, expectedOutcomeAt, policy);

console.log("PointPulse Safe Window 演示");
console.log(`市场草案：${proposal.question}`);
console.log(`事件触发时间：${proposal.triggerTimestamp}`);
console.log(`预计结果发生时间：${expectedOutcomeAt}`);
console.log(`链上可就绪时间：${decision.chainReadyAt}`);
console.log(`最晚冻结时间：${decision.latestFreezeAt}`);
console.log(`决定：${decision.status}`);
console.log(`有效下注窗口：${decision.effectiveBetWindowSeconds} 秒`);
console.log("未读取钱包、未调用 RPC、未发送链上交易。");
