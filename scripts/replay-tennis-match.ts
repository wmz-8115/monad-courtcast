import { doubleFaultScenario } from "../engine/fixtures.js";
import { formatReplayStep, replayMatch } from "../engine/replay.js";

const matchId = doubleFaultScenario[0].matchId;
const steps = replayMatch(matchId, doubleFaultScenario);
const proposalCount = steps.reduce(
  (total, step) => total + step.proposals.length,
  0,
);

console.log("PointPulse 模拟网球事件回放");
console.log(`比赛：${matchId}`);
console.log("");

for (const step of steps) {
  console.log(formatReplayStep(step));
}

console.log("");
console.log(
  `回放完成：${steps.length} 条事件，生成 ${proposalCount} 个市场草案。未发送任何链上交易。`,
);
