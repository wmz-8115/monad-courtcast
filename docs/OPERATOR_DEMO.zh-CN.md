# 预编排录播演示：本地运营服务

这个服务只用于 Monad Testnet 演示。它会按 `engine/prerecordedScenario.ts` 的预编排时间线，依次：

```text
提前发布市场 → 每约 3 秒自动下注 → 冻结 → 写入预设结果
```

每一项都是由本机运营钱包发出的真实测试网交易。不要在主网或含真实资产的钱包上使用。

## 启动前条件

1. 先部署包含 `cancelMarket()` 的 V2 合约；旧版合约不支持运营撤回。
2. 运营账号必须同时是：V2 市场合约的创建者，以及 Oracle。
3. 该账号需要少量 MON 付 Gas，并需要足够 mUSDC 自动下注。五个市场合计建议至少准备 `10,000 mUSDC`。
4. mUSDC 合约的 owner 需要先给运营账号铸造演示余额；这一步不会由服务自动执行。

## 本机配置

在**仅当前 PowerShell 窗口**设置值；不要把私钥粘贴到聊天、代码或 `.env` 文件中：

```powershell
$env:POINTPULSE_OPERATOR_PRIVATE_KEY = "0x你的运营账号私钥"
$env:POINTPULSE_MUSDC_ADDRESS = "0xV2_mUSDC合约地址"
$env:POINTPULSE_MARKET_ADDRESS = "0xV2_市场合约地址"
```

然后启动：

```powershell
cd D:\GPT-Workspace\GPT-区块链\point-pulse
$env:Path = "C:\Users\临时用户\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;$env:Path"
.\node_modules\.bin\tsx.cmd scripts\run-operator-demo.ts
```

服务启动约 7 秒后会发布第一个市场。按 `Ctrl+C` 停止后，不会撤销已经上链的交易；已创建但未结算的市场可由同一运营账号在运营页面调用“撤回并退款”。
