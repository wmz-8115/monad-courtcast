import { MonadOperatorChainAdapter, readOperatorRuntimeConfig } from "../backend/operatorChainAdapter.js";
import { DemoOperator } from "../engine/demoOperator.js";
import { prerecordedTennisMarkets } from "../engine/prerecordedScenario.js";

const runtime = readOperatorRuntimeConfig();
const adapter = new MonadOperatorChainAdapter(runtime);
const operator = new DemoOperator(prerecordedTennisMarkets);
operator.start(Math.floor(Date.now() / 1_000));

console.log(`运营演示已启动：${adapter.account.address}`);
console.log("将在约 7 秒后发布首个市场；按 Ctrl+C 停止。每一笔操作都会是真实 Monad Testnet 交易。");

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const completed = await operator.tick(Math.floor(Date.now() / 1_000), adapter);
    for (const action of completed) {
      console.log(`${new Date().toLocaleTimeString("zh-CN", { hour12: false })} ${action.action} ${action.marketId} ${action.onchainMarketId === undefined ? "" : `#${action.onchainMarketId}`}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  } finally {
    ticking = false;
  }
}

void tick();
setInterval(() => void tick(), 1_000);
