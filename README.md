# PointPulse

PointPulse 是运行在 Monad Testnet 的 YES / NO 预测市场演示。它与旧的 TimedGift 项目独立：这里仅保留预测市场所需的合约、测试、部署模块和 React 前端。

## 内容

- `contracts/MockUSDC.sol`：六位小数的演示积分与一次性水龙头。
- `contracts/PredictionMarket.sol`：市场创建、下注、冻结、Oracle 结算、运营者撤回退款与领奖。
- `test/`：合约自动测试。
- `frontend/`：通过 MetaMask 在 Monad Testnet 部署及使用合约的网页。
- `engine/prerecordedScenario.ts`：不依赖视频文件的五市场录播演示时间线。
- `docs/OPERATOR_DEMO.zh-CN.md`：本地运营服务与自动下注说明。
- `docs/VIDEO_REPLAY.zh-CN.md`：录播素材的本地接入方式。
- `docs/ENVIO.zh-CN.md`：实时链上审计索引器的运行说明。

## 启动

```powershell
pnpm install
pnpm test
pnpm dev:frontend
```

网页部署使用 MetaMask 签名；网页不读取或保存私钥、助记词或钱包密码。

## 页面职责

- `/`：交易者页面。显示录播、链上总奖池、自己的仓位、倒计时和可领取历史；不能创建、冻结或结算市场。
- `/operator`：运营页面。由 Oracle / 市场创建者部署 V2、准备演示资金、冻结或结算、撤回未结算市场并退款。

运营服务会把预写的五个短期市场和演示流动性真实提交到 Monad Testnet。详情见 `docs/OPERATOR_DEMO.zh-CN.md`。
