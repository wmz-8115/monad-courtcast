# 模拟网球事件引擎

此模块是 PointPulse 的链下决策层，不会直接发送交易或接触钱包。

## 一键回放示例

在项目目录运行：

```powershell
pnpm replay:tennis
```

如果终端尚未安装 `pnpm`，也可以直接运行项目已安装的本地命令：

```powershell
.\node_modules\.bin\tsx.cmd scripts\replay-tennis-match.ts
```

它会回放一段确定的本地网球事件流：比赛开始、首发准备、首发失误、二发失误。
在首发失误后，状态机生成一个 `DOUBLE_FAULT` 市场草案；二发失误只是让这一分结束。
这条命令不读取钱包、不调用 RPC，也不发送链上交易。

```text
PointPulseEvent → MatchEventProcessor → CurrentMatchState → MarketProposal(DRAFT)
```

当前只支持最小网球状态：比赛开始、一发准备、一发失误、二发成功、二发失误、该分结束。

当发生 `FIRST_SERVE_FAULT` 且状态从 `FIRST_SERVE_READY` 转为 `SECOND_SERVE_READY` 时，引擎生成一个 `DOUBLE_FAULT` 市场草案。草案不是链上市场；后续 Safe Window 与 Orchestrator 通过后，才可调用现有合约创建市场。

事件以 `eventId` 去重，以严格递增的 `sequence` 防止旧消息、乱序消息或重复消息重复创建市场。

## Safe Window（安全窗口）

`Safe Window` 是市场草案进入未来链上创建队列前的本地风控判断。它不会自行创建市场。

计算方式是：

```text
预计结果发生时间
- 数据到达延迟
- 链上确认时间
- 安全缓冲
= 最多还能开放给用户下注的时间
```

再把这个时间与模板建议的下注时长比较，取较小值。若剩余时间小于最低可交易窗口，则草案被拒绝；避免市场刚上链、比赛结果就已发生的情况。

当前演示规则：数据延迟 1 秒、链上确认 2 秒、安全缓冲 2 秒、最低可交易窗口 5 秒。它们只是本地保守估计，未来接入真实数据后应依据实测延迟配置。

运行演示：

```powershell
.\node_modules\.bin\tsx.cmd scripts\evaluate-safe-window.ts
```

## Market Orchestrator（市场编排器）

通过 Safe Window 的草案会被编排器转换为一条本地 `CreateMarketIntent`：

```text
MarketProposal(DRAFT)
→ SafeWindowDecision(APPROVED)
→ CreateMarketIntent(QUEUED)
→ 未来的链上写入器 / MetaMask 确认
```

`CreateMarketIntent` 中的 `question`、`closeAt`、`resolveAt` 与现有合约的
`createMarket(question, closeAt, resolveAt)` 参数一一对应。它会确保：

- Safe Window 拒绝的草案不会进入队列；
- `closeAt` 不晚于 Safe Window 规定的最晚冻结时间；
- 同一 `proposalId` 在同一运行进程内只生成一条创建指令。

当前去重只在内存中，重启进程后会丢失；真正接链前必须把 `proposalId`、创建交易哈希和链上市场 ID 写入持久化数据库，才能跨重启防重。

运行演示：

```powershell
.\node_modules\.bin\tsx.cmd scripts\orchestrate-market.ts
```

演示只打印未来可交给钱包的创建指令；不读取钱包、不弹出 MetaMask、也不发送交易。

## Settlement Planner（结算规划器）

针对 `DOUBLE_FAULT` 市场，结算规划器只接受同一场比赛、同一球员、并且发生在触发事件之后的二发结果：

```text
SECOND_SERVE_FAULT → YES
SECOND_SERVE_IN    → NO
```

它输出带有来源事件 ID 的 `SettlementDraft(PENDING_ORACLE)`。这只是“数据证据建议的结果”，不是结算交易；未来的 Oracle 适配器还需要：

```text
proposalId → 已创建的链上 marketId
SettlementDraft → Oracle 钱包确认 → resolveMarket(marketId, outcome)
```

同一个草案在同一进程内只能生成一条结算草案。和市场创建指令一样，跨重启去重及数据修正处理需要等接入数据库和真实数据源后实现。

运行演示：

```powershell
.\node_modules\.bin\tsx.cmd scripts\plan-settlement.ts
```

本地样本以二发失误结束，因此预期会输出 `建议结果：YES`；不会调用 Oracle 钱包或合约。

## 网页中的安全预览

网页现在有“模拟自动化市场预览”卡片。点击“生成模拟计划”会以点击时刻为起点，在浏览器本地运行完整演示流水线，并展示：

- Safe Window 是否批准及实际下注窗口；
- 待创建问题和计划截止时间；
- 模拟数据建议的结算方向（仍待 Oracle）。

它不自动读取钱包、不发送交易。短窗口计划不会写入创建表单；真正测试合约时，用户应在上方手工表单中填写未来的截止和结算时间，再点击“创建市场”并在 MetaMask 中确认。

该预览是短窗口模拟（约 40 秒后停止下注），仅用于演示流程；不应该把它当作真实赛事或自动交易功能。
