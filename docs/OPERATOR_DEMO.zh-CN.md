# 预编排录播演示：本地运营服务

这个服务只用于 Monad Testnet 演示。它会按 `engine/prerecordedScenario.ts` 的预编排时间线，依次：

```text
按视频秒数创建市场 → 少量随机测试下注 → 冻结 → 写入预设结果
```

每一项都是由本机运营钱包发出的真实测试网交易。不要在主网或含真实资产的钱包上使用。

## 启动前条件

1. 先部署包含 `cancelMarket()` 的 V2 合约；旧版合约不支持运营撤回。
2. 运营账号必须同时是：V2 市场合约的创建者，以及 Oracle。
3. 该账号需要少量 MON 付 Gas。服务启动时会将运营账号的余额补足到 `100,000 mUSDC`；可用 `COURTCAST_OPERATOR_TARGET_MUSDC` 调整目标。
4. 运营账号必须也是 mUSDC 合约的 owner；补足操作是幂等的，余额达到目标后，服务重启不会重复增发。

## 本机配置

在**仅当前 PowerShell 窗口**设置值；不要把私钥粘贴到聊天、代码或 `.env` 文件中：

```powershell
$env:POINTPULSE_OPERATOR_PRIVATE_KEY = "0x你的运营账号私钥"
$env:POINTPULSE_MUSDC_ADDRESS = "0xV2_mUSDC合约地址"
$env:POINTPULSE_MARKET_ADDRESS = "0xV2_市场合约地址"
```

然后启动：

```powershell
cd D:\GPT-Workspace\GPT-区块链\monad-courtcast
$env:Path = "C:\Users\临时用户\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;$env:Path"
.\node_modules\.bin\tsx.cmd scripts\run-operator-demo.ts
```

服务启动后，首个市场会在第 18 秒创建。按 `Ctrl+C` 停止后，不会撤销已经上链的交易；已创建但未结算的市场可由同一运营账号在运营页面调用“撤回并退款”。

## 由网页「开始观看」启动真实演示

`pnpm operator:serve` 是给公开网页使用的私有运营服务。真正创建、下注、冻结与结算交易仍只由服务器环境变量中的运营钱包发出，私钥绝不会下发到网页。

### 模式 A：管理钱包启动（默认）

默认模式下，网页只会请求一次 MetaMask **签名**来证明管理身份：

额外设置以下变量后启动：

```powershell
$env:COURTCAST_OPERATOR_ADMIN_ADDRESS = "0x你的管理MetaMask地址"
$env:COURTCAST_OPERATOR_ALLOWED_ORIGIN = "https://你的公开网页域名"
$env:COURTCAST_OPERATOR_PORT = "8787"
pnpm operator:serve
```

### 模式 B：受限公开演示启动（交付演示用）

为了让评委只点“开始观看”就能体验，服务可以开启**受限公开启动**。它并不把创建市场的管理界面或私钥开放给访客；访客只能触发仓库中固定的五个测试市场。

```powershell
$env:COURTCAST_OPERATOR_ALLOWED_ORIGIN = "https://你的公开网页域名"
$env:COURTCAST_DEMO_PUBLIC_START = "true"
$env:COURTCAST_DEMO_COOLDOWN_SECONDS = "300"
$env:COURTCAST_DEMO_MAX_SESSIONS = "8"
pnpm operator:serve
```

限制含义：同一时刻只允许一轮，完成后冷却 5 分钟，一个服务进程最多运行 8 轮。若服务重启，计数会重置；因此它只适合今晚的 Testnet 交付演示，不是生产级防滥用方案。不要把 `COURTCAST_DEMO_PUBLIC_START` 用于主网或真实资产。

### 部署到持续在线环境

前端构建时设置 `VITE_OPERATOR_API_URL` 为该私有服务的 **HTTPS** 地址。服务需要部署在持续运行的 Node 容器（例如 Render、Railway、Fly.io 或 VPS），不能部署到纯静态网页托管里。

仓库已提供 `Dockerfile` 和 `/health` 健康检查。云平台中填写以下环境变量；私钥只填在平台的 Secret/Variable 面板，绝不提交到 GitHub、前端构建变量或聊天：

```text
POINTPULSE_OPERATOR_PRIVATE_KEY=0x…                 # Secret
POINTPULSE_MUSDC_ADDRESS=0x…
POINTPULSE_MARKET_ADDRESS=0x…
POINTPULSE_RPC_URL=https://testnet-rpc.monad.xyz    # 可选
COURTCAST_OPERATOR_ALLOWED_ORIGIN=https://你的静态站点域名
COURTCAST_DEMO_PUBLIC_START=true
COURTCAST_DEMO_COOLDOWN_SECONDS=300
COURTCAST_DEMO_MAX_SESSIONS=8
```

平台会注入 `PORT`，无需填写 `COURTCAST_OPERATOR_PORT`。拿到服务 URL 后，重新以 `VITE_OPERATOR_API_URL=https://该服务域名` 构建并发布静态前端，网页才会连接到它。
