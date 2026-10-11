# PointPulse 工程概要与开发路线

> 项目定位：基于 Monad 的事件驱动 Micro Prediction Market。  
> 第一版以网球为演示场景，把“下一分、下一次发球、是否双误”等短事件转化成生命周期只有几秒到几十秒的链上预测市场。

---

## 0. 当前项目状态

### 已确认完成

目前已经完成一个最简单的网页版本，可以：

- 创建一个预测市场；
- 切换不同钱包/账号；
- 使用不同账号进行 YES / NO 投注；
- 验证“多个用户参与同一个市场”的基本交互流程。

### 现在最重要的目标

先不接真实网球数据，也不做复杂赔率。

优先完成 Monad 上的最小闭环：

```text
创建市场
→ 用户下注
→ Freeze 停止下注
→ Oracle 提交结果
→ Resolve 确认赢家
→ 赢家 Claim
```

只要这条链路稳定跑通，Phase 1 就完成。

---

# 1. 整个 PointPulse 的系统结构

完整项目拆成 6 个模块：

```text
① Sports Data
真实比赛数据
        ↓
② State Engine
判断当前比赛状态
        ↓
③ Micro Market Engine
决定现在开什么市场
        ↓
④ Monad Trading
创建链上市场、下注、资金托管、Freeze
        ↓
⑤ Oracle + Resolve
把真实结果写进链上并确认赢家
        ↓
⑥ Claim / Payout
赢家领取收益
```

当前开发重点是：

```text
④ → ⑤ → ⑥
```

前面 ①②③ 暂时用模拟输入代替。

---

# 2. 模块 ①：Sports Data

## 作用

回答：

> 真实比赛刚刚发生了什么？

例如：

- 一发开始；
- 一发失误；
- 二发；
- 这一分结束；
- 某球员赢下一分。

## 推荐技术

- 数据源：Sportradar（生产方向）
- MVP：模拟数据 / 历史数据
- Backend：Node.js + TypeScript
- 数据标准化：Data Adapter
- 实时传输：HTTP Stream / WebSocket
- 查询补偿：REST

## 输入

外部体育数据源的原始数据。

## 输出接口

统一输出 PointPulse Event JSON：

```json
{
  "eventId": "evt_12345",
  "matchId": "match_001",
  "eventType": "FIRST_SERVE_FAULT",
  "server": "SINNER",
  "score": "30-15",
  "timestamp": 1791051234,
  "sequence": 182,
  "schemaVersion": "1.0"
}
```

这里输出的是“事件”，不是“当前状态”。

---

# 3. 模块 ②：State Engine

## 作用

回答：

> 根据刚刚发生的事件，现在比赛到底处于什么状态？

状态机本质：

```text
当前状态
+
新事件
=
新的状态
```

例如：

```text
FIRST_SERVE_READY
+
FIRST_SERVE_FAULT
=
SECOND_SERVE_READY
```

## 推荐技术

- TypeScript
- Node.js
- XState（状态机库）

## 输入接口

模块 ① 的 Event JSON。

例如：

```json
{
  "eventType": "FIRST_SERVE_FAULT",
  "server": "SINNER"
}
```

## 输出接口

Current State JSON：

```json
{
  "matchId": "match_001",
  "state": "SECOND_SERVE_READY",
  "server": "SINNER",
  "score": "30-15"
}
```

含义：

> Sinner 一发已经失误，现在马上准备二发。

---

# 4. 模块 ③：Micro Market Engine

## 作用

回答：

> 当前这个比赛状态下，应该开什么 Micro Market？

第一版不让 AI 随意创造市场，而采用：

```text
State
↓
合法 Market Templates
↓
生成 Market
```

例如：

```text
SECOND_SERVE_READY
↓
允许：
- SECOND_SERVE_OUTCOME
- DOUBLE_FAULT
- NEXT_POINT_WINNER
```

## 推荐技术

- TypeScript
- Node.js
- Market Template Library
- 第一版不使用 LLM 生成市场

## 输入接口

模块 ② 的 Current State JSON。

## 输出接口

Market JSON：

```json
{
  "marketId": "market_001",
  "matchId": "match_001",
  "marketType": "DOUBLE_FAULT",
  "question": "Will Sinner double fault?",
  "options": ["YES", "NO"],
  "triggerState": "SECOND_SERVE_READY",
  "status": "READY"
}
```

中文含义：

> 系统根据“准备二发”的状态，生成了一个“Sinner 会不会双误”的市场。

这个 Market JSON 就是模块 ④ 的输入。

---

# 5. 模块 ④：Monad Trading

这是当前最重要的模块，也是最能体现 Monad 的部分。

## 作用

把模块 ③ 的“市场说明书”真正变成 Monad 上能够交易的市场。

主要负责：

```text
创建市场
→ 接受 YES / NO 投注
→ 托管资金
→ 记录用户持仓
→ 风险检查
→ Freeze
```

## 技术栈

### 链
- Monad

### 智能合约
- Solidity

### 合约开发与测试
- Foundry

### 前端 / 后端调用合约
- TypeScript
- viem

### 合约通用组件
- OpenZeppelin

### 测试资产
- Mock USDC

### 前端
优先沿用当前已经能工作的网页技术栈，不为了统一技术栈重写。

如后续需要新建：
- TypeScript
- React / Next.js 均可

---

## 为什么使用 Mock USDC

MON 主要负责 Gas。

Mock USDC 用来：

- 下注；
- 锁定资金；
- 赔付；
- 表示价格和收益。

例如：

```text
下注 10 USDC
赢了拿回 20 USDC
```

比使用价格会波动的 MON 更容易理解和计算。

---

## Phase 1 的市场机制

暂时固定：

```text
YES = 1:1
NO  = 1:1
```

例：

```text
下注 10
赢 → 20
输 → 0
```

暂时不做：

- 动态赔率；
- AMM；
- LMSR；
- Batch Auction；
- 真实 LP 经济模型。

---

## 模块 ④ 输入

来自模块 ③：

```json
{
  "marketId": "market_001",
  "question": "Will Sinner double fault?",
  "options": ["YES", "NO"],
  "status": "READY"
}
```

---

## 模块 ④ 核心数据

### 市场信息

```text
marketId
question
status
winningOutcome
bankroll
maxLiability
```

市场状态：

```text
OPEN
FROZEN
RESOLVED
```

### 用户信息

对每个：

```text
用户地址 + marketId
```

记录：

```text
YES 下注金额
NO 下注金额
是否已经 Claim
```

---

## 模块 ④ 核心函数

这些英文可以理解成“合约按钮”。

### `createMarket()`
创建一个新市场。

### `fundMarket()`
给市场注入测试赔付资金。

### `bet()`
用户下注 YES / NO。

### `freezeMarket()`
停止接受新下注。

### 查询函数
例如：

- 查看市场；
- 查看用户下注；
- 查看当前状态。

---

## 用户下注后发生什么

例如 Alice：

```text
买 YES
10 Mock USDC
```

系统执行：

```text
检查市场是否 OPEN
↓
检查 Alice 是否有足够 USDC
↓
检查风险是否超过 maxLiability
↓
资金进入合约
↓
记录 Alice：YES = 10
```

---

## Phase 1 简单风险控制

假设：

```text
YES 总下注 = 20
NO 总下注 = 10
```

1:1 固定赔率。

YES 赢：

```text
需要赔付 = 40
用户一共投入 = 30
资金池净亏 = 10
```

NO 赢：

```text
需要赔付 = 20
用户一共投入 = 30
资金池净赚 = 10
```

取两个结果里更坏的情况，作为当前最大风险。

规定：

```text
maxLiability = 100 USDC
```

如果接受下一笔下注后最大可能亏损超过 100 USDC：

```text
拒绝下注
```

---

## 模块 ④ 输出

第四阶段输出的不再只是“市场说明书”，而是实际链上状态。

例如：

```json
{
  "marketId": "market_001",
  "onchainStatus": "FROZEN",
  "totalYesBet": 20,
  "totalNoBet": 10,
  "totalVolume": 30,
  "contractAddress": "0x123...",
  "lastTxHash": "0xabc..."
}
```

模块 ⑤ 在这个基础上继续。

---

# 6. 模块 ⑤：Oracle + Resolve

## Oracle 是什么

Oracle 不是预测未来。

它的作用是：

> 把链外现实结果可靠地提交给智能合约。

最简单的第一版 Oracle：

```text
一个指定的钱包地址
+
结果提交权限
```

例如：

```text
Oracle：
market_001 的结果 = NO
```

其他普通用户没有权限修改结果。

---

## 输入接口

```json
{
  "marketId": "market_001",
  "result": "NO",
  "sourceEventId": "evt_9988"
}
```

---

## `resolveMarket()`

作用：

> 正式确认这个市场最终谁赢。

流程：

```text
检查调用者是不是 Oracle
↓
检查市场是不是 FROZEN
↓
检查市场是否已经 Resolve
↓
winningOutcome = NO
↓
status = RESOLVED
```

---

## 输出接口

```json
{
  "marketId": "market_001",
  "status": "RESOLVED",
  "winningOutcome": "NO"
}
```

---

## Phase 1 Oracle 方案

先使用：

```text
1 个可信 Oracle 钱包
```

以后再升级：

```text
多数据源
+
多个 Oracle
+
2-of-3 / 3-of-5 多签
+
争议机制
```

---

# 7. 模块 ⑥：Claim / Payout

## 作用

Resolve 之后，赢家自己领取收益。

流程：

```text
市场 RESOLVED
↓
用户调用 Claim
↓
合约检查用户是不是赢家
↓
检查是否已经领过
↓
计算应得金额
↓
Mock USDC 转回用户钱包
```

---

## 输入接口

```text
用户钱包地址
+
marketId
```

---

## `claim()`

例如 Bob：

```text
NO 下注 = 20
赔率 = 1:1
NO 最终获胜
```

则：

```text
Bob 可领取 = 40 Mock USDC
```

Claim 后：

```text
claimed = true
```

防止重复领取。

---

## 输出

```json
{
  "marketId": "market_001",
  "user": "0xBob...",
  "claimAmount": 40,
  "claimed": true,
  "txHash": "0x..."
}
```

---

# 8. Phase 1 当前计划

## Phase 1 的唯一目标

完成这个闭环：

```text
创建市场
↓
不同钱包下注
↓
资金进入合约
↓
Freeze
↓
Oracle 提交结果
↓
Resolve
↓
赢家 Claim
```

---

## 当前已经完成

已确认：

```text
✅ 简单网页
✅ 可以自己创建市场
✅ 可以切换不同账号
✅ 不同账号可以进行投注
```

---

## 接下来优先完成

### 第一步：检查现有下注流程

确认：

- 投注是否真的发生在 Monad 合约上；
- 是否使用 Mock USDC；
- 用户下注数据是否正确记录；
- 合约是否真正持有用户下注资金。

### 第二步：补 Freeze

需要：

```text
OPEN
↓
FROZEN
```

Freeze 后：

```text
禁止所有新下注
```

测试模式可以先使用：

```text
创建后立即 OPEN
30 秒后停止下注
```

第一版也可以保留管理员手动 Freeze 作为调试入口。

### 第三步：补 Oracle + Resolve

增加：

```text
Oracle 钱包
↓
提交 YES / NO
↓
resolveMarket()
```

要求：

- 非 Oracle 不能 Resolve；
- OPEN 市场不能直接 Resolve；
- 已经 Resolve 的市场不能重复修改。

### 第四步：补 Claim

要求：

- 赢家可以 Claim；
- 输家不能 Claim；
- 同一个用户不能重复 Claim；
- Claim 后钱包 Mock USDC 余额正确变化。

### 第五步：加入简单风险上限

增加：

```text
bankroll
maxLiability
```

新的下注可能让市场超过最大风险：

```text
拒绝下注
```

### 第六步：自动化测试

至少覆盖：

```text
Alice 买 YES
Bob 买 NO
Charlie 买 NO
↓
Freeze
↓
Oracle 提交 NO
↓
Bob Claim 成功
Charlie Claim 成功
Alice Claim 失败
↓
Bob / Charlie 不能重复 Claim
```

### 第七步：完整 Demo

最终演示：

```text
创建市场
↓
切 Alice 投 YES
↓
切 Bob 投 NO
↓
再切其他账号下注
↓
倒计时结束 / 手动 Freeze
↓
Oracle 选择最终结果
↓
Resolve
↓
赢家 Claim
↓
钱包余额变化
```

做到这里：

# Phase 1 完成。

---

# 9. Phase 2：流动性与风险

Phase 1 完成以后再进入。

目标：

```text
固定测试 Bankroll
↓
升级为真正的 Liquidity Pool
```

主要研究：

- LP 如何存入资金；
- 多个 Micro Market 是否共享流动性；
- 每个市场最多可以占用多少风险；
- LP 如何退出；
- 资金利用率；
- 极端单边下注如何处理。

参考：

- Azuro 的 Shared Liquidity；
- Reinforcement / Risk Limit 思路。

---

# 10. Phase 3：价格形成机制

这是当前明确保留的重点待办。

需要解决：

> 用户买入 YES 后，价格为什么从 0.50 变成 0.53，而不是 0.60？

候选机制：

- Prediction Market AMM；
- LMSR；
- Order Book；
- Batch Auction（暂缓）；
- 其他混合机制。

当前优先研究：

```text
LMSR
```

原因：

- 专门为预测市场设计；
- 自动形成 YES / NO 价格；
- 可以计算做市商理论最大亏损；
- 与短生命周期市场有一定匹配潜力。

但目前尚未最终确定。

---

# 11. LP 经济模型待办

另一个独立待办：

> LP 为什么愿意提供资金？

需要设计：

```text
LP 收入
=
手续费
+
可能的做市收益
+
可能的协议激励
-
市场赔付亏损
```

需要进一步确定：

- 交易手续费；
- Margin；
- 单市场最大风险；
- LP 收益如何分配；
- LP 是否共享多个市场风险；
- 极端行情下如何保护资金池。

注意：

> 不追求“保证 LP 盈利”，而是让 LP 的风险有上限、长期收益逻辑成立。

---

# 12. Phase 4：接回真实体育市场

最后才把前三模块接回来：

```text
Sportradar / Sports Feed
↓
PointPulse Event
↓
State Engine
↓
Micro Market Engine
↓
Monad Trading
↓
Freeze
↓
Oracle
↓
Resolve
↓
Claim
```

届时人工创建市场会被替换成：

```text
FIRST_SERVE_FAULT
↓
SECOND_SERVE_READY
↓
自动生成：
“Will Sinner double fault?”
↓
Monad 自动创建市场
```

---

# 13. 后续真正的大卡点

目前项目没有阻止 Phase 1 继续开发的硬卡点。

## P0：Safe Window Engine

真实体育 Micro Market 生命周期非常短。

需要计算：

```text
预计剩余事件时间
-
数据延迟
-
链上确认时间
-
安全缓冲
=
真正可交易窗口
```

如果窗口太短：

```text
不开放市场
```

这个问题在接真实体育数据前必须解决。

## P1：AMM / 价格形成

尚未确定。

优先研究 LMSR。

## P1：LP Economics

尚未确定。

需要同时设计：

- 收益；
- 风险；
- 最大赔付；
- 共享流动性。

## P1：Oracle 信任模型

Phase 1：

```text
单可信 Oracle
```

生产方向：

```text
多数据源
+
签名
+
多 Oracle
+
争议 / Correction
```

## P2：真实体育数据

生产方向：

- Sportradar
- Genius Sports 等

需要重点关注：

- Serve / Point 级粒度；
- 实际延迟；
- 授权与价格；
- Push Feed；
- 视频与数据同步。

---

# 14. 项目核心差异化

PointPulse 不是普通链上 sportsbook。

核心目标是：

> 把一场体育比赛拆成连续大量生命周期只有几秒到几十秒的链上市场。

例如：

```text
第 1 分市场
→ Resolve

第 2 分市场
→ Resolve

二发市场
→ Resolve

下一局 Break 市场
→ Resolve
```

因此 Monad 的作用不是简单“支付更快”，而是支持：

```text
高频 Market Creation
+
高频用户交易
+
快速 Freeze
+
快速 Resolve
+
大量短生命周期市场并存
```

---

# 15. 参考项目

## Sportradar
主要学习：

> 真实体育数据如何进入系统。

## Kero
主要学习：

> Micro Market 如何生成、暂停、恢复、结束和结算。

## nVenue
主要学习：

> 实时概率、赔率模型和自动市场编排。

第一版不复制复杂 Prediction Engine。

## Azuro
主要学习：

> 链上流动性、AMM、风险控制、资金托管和结算。

---

# 16. 当前最应该做的下一件事

不要重新设计整个系统。

基于当前已经可以：

```text
创建市场
+
切换账号下注
```

下一步直接完成：

```text
Freeze
↓
Oracle
↓
Resolve
↓
Claim
```

然后补：

```text
简单 maxLiability
+
自动测试
```

完成后立即封版 Phase 1，再进入 Phase 2。

---

## 一句话开发路线

```text
先把链上市场闭环跑通
↓
再解决流动性与风险
↓
再解决动态赔率
↓
最后接真实体育数据和自动 Market Generator
```

---

# 17. 相关成熟项目与模块参考库

这一节用于避免后续开发时重复搜索资料。

原则：

> 不把这些项目全部接进 PointPulse。  
> 能直接复用的模块再接入；其余项目主要作为架构、机制和产品设计参考。

---

## 17.1 一张表先看懂

| PointPulse 模块 | 主要参考项目 | 重点学习内容 | 是否建议直接依赖 |
|---|---|---|---|
| ① Sports Data | Sportradar | 网球实时数据、point-by-point、比赛 ID、数据更新和补偿 | 是，后期真实数据优先考虑 |
| ② State Engine | Sportradar / nVenue | 原始体育数据如何变成确定的比赛状态 | 自己实现 |
| ③ Micro Market Engine | Kero / nVenue | 状态驱动市场、模板、自动创建、市场生命周期 | 自己实现，参考它们 |
| ④ Monad Trading | Azuro / LEVR / Monocast | 链上资金、做市、风险、交易、Prediction Market 合约 | 自己实现核心 |
| ⑤ Oracle + Resolve | Azuro / LEVR / Monocast | 数据提交、Oracle、结果确认、多方仲裁 | Phase 1 自己实现单 Oracle |
| ⑥ Claim / Payout | Azuro / Hunch | Claim、Prize Pool、链上提款 | 自己实现 |
| Micro UX | Hunch / Kero / RareBetSports | 倒计时、锁盘、用户快速下注、结果展示 | 参考产品体验 |
| AMM / 动态赔率 | Azuro / Monocast | vAMM、LMSR、最大风险 | Phase 3 重点研究 |

---

# 18. Sportradar

## 它是什么

Sportradar 是体育数据和博彩基础设施供应商。

对 PointPulse 来说，最重要的是：

> 它可以解决“真实网球比赛发生了什么”这一层。

它的 Tennis API 可以提供：

- 实时比分；
- point-by-point timeline；
- 比赛和球员 ID；
- 比赛状态；
- 比赛统计；
- 部分比赛概率；
- 实时 Push Feed；
- REST 补数据。

它还已经提供 ATP Tennis Micro Markets。

公开过的 Micro Market 类型包括：

- 下一次发球是 Ace / Rally / Double Fault；
- Point Outcome；
- 一分内总击球数；
- 下一次 Break；
- 最后一拍类型等。

---

## 我们参考什么

主要参考模块：

```text
真实比赛
↓
结构化体育数据
↓
PointPulse Data Adapter
```

重点研究：

- point / serve 级数据；
- 时间戳；
- event ID；
- Push Feed；
- REST 数据恢复；
- 数据修正；
- 实际延迟。

---

## 能不能直接接入

可以。

正式版本可以通过：

```text
Sportradar API
↓
我们的 Data Adapter
↓
PointPulse Event JSON
```

但实时产品权限、低延迟数据和官方数据通常需要生产级账号/商业权限。

所以：

### MVP

```text
模拟数据 / 历史数据
```

### 后期

```text
Sportradar Realtime
```

---

## 资料入口

- Tennis API：
  https://developer.sportradar.com/tennis/
- Tennis Integration Guide：
  https://developer.sportradar.com/tennis/docs/tennis-ig-overview
- ATP Micro Markets：
  https://sportradar.com/content-hub/news/sportradar-drives-betting-innovation-with-micro-markets-expansion/

---

# 19. Kero Sports

## 它是什么

Kero 是非常接近 PointPulse “Micro Market Engine” 的成熟参考。

它重点解决：

> 实时体育比赛过程中，持续生成大量“接下来会发生什么”的小市场。

一场比赛可以产生大量 Micro Markets，并持续发送：

- 新市场；
- Odds 更新；
- Suspend；
- Activate；
- Timeout；
- Resolve。

Kero 的典型市场状态：

```text
PUBLISHED
SUSPENDED
TIMED_OUT
RESOLVED
DRAFT
```

对应到 PointPulse，可以粗略理解：

```text
OPEN
FROZEN
等待结果
RESOLVED
VOID
```

---

## 我们参考什么

主要参考模块：

```text
State
↓
Market Template
↓
Micro Market
↓
Suspend
↓
Resolve
```

特别值得参考：

- Market Template；
- 状态驱动市场；
- 市场自动生成；
- 市场生命周期；
- Suspend / Reactivate；
- 数据修正；
- 大量短市场管理。

---

## 能不能直接接入

技术上可以，因为 Kero 有 API/SDK 类型的集成方式。

但它偏 B2B 体育博彩基础设施，不建议把 PointPulse MVP 依赖在能否拿到 Kero 商业权限上。

所以我们的方案是：

> 学 Kero 的架构，但自己实现 Market Engine。

---

## 资料入口

- Kero Docs：
  https://docs.rushsports.io/
- Market States：
  https://docs.rushsports.io/overview/market-states-and-messages/

---

# 20. nVenue

## 它是什么

nVenue 比 Kero 更强调：

> 从实时数据一路计算到状态、概率、市场、价格和自动结算。

它公开的平台流程大致是：

```text
Raw Live Data
↓
State Control
↓
AI / ML Prediction Engine
↓
Market Orchestration
↓
Settlement
```

它会实时计算大量概率，并自动：

- 创建市场；
- 定价；
- Listing；
- Settlement。

---

## 我们参考什么

主要参考两个部分：

### State Engine

```text
原始体育数据
↓
确定当前比赛状态
```

### Probability / Pricing

```text
当前比赛状态
↓
实时概率
↓
初始市场价格
```

---

## 我们暂时不做什么

PointPulse 第一版不自己训练专业体育概率模型。

所以不复制：

```text
复杂 AI / ML Prediction Engine
```

第一版先：

```text
简单初始价格
+
后续 AMM
```

---

## 能不能直接接入

理论上可以作为企业级概率/市场模块，但不是我们 Phase 1 的必要依赖。

当前定位：

> 设计参考，不作为 MVP 核心依赖。

---

## 资料入口

- nVenue Platform：
  https://www.nvenue.com/platform

---

# 21. Azuro

## 它是什么

Azuro 是我们链上部分最重要的参考之一。

它是 EVM Prediction Market Protocol，重点解决：

- 流动性；
- 用户下注；
- 链上赔率；
- 风险；
- 资金托管；
- Settlement。

---

## 我们重点参考什么

### 1. Shared Liquidity

大量 Prediction Markets 共用一个流动性池，而不是每个市场重新找 LP。

这对 PointPulse 非常重要，因为未来可能同时存在很多短生命周期市场。

---

### 2. Reinforcement

Azuro 用 Reinforcement 控制某一个市场能从共享池承担多少风险。

可以把它理解成：

> 这个市场最多允许 LP 承担多少潜在损失。

这和我们当前 Phase 1 的：

```text
maxLiability
```

思想很接近。

---

### 3. vAMM

Azuro 使用 vAMM 根据下注流调整赔率。

PointPulse Phase 3 可以重点研究：

```text
Azuro vAMM
vs
LMSR
```

---

### 4. LiquidityTree / Virtual Funds

用于管理多个市场共享同一个 LP 时：

- 哪些市场占用了多少流动性；
- 池子还有多少风险容量；
- 是否还能继续接单。

这是 PointPulse 后期做大量 Micro Markets 时非常重要的参考。

---

## 能不能直接接入

Azuro 有公开协议和开发工具，但 PointPulse 的核心目标是：

> 在 Monad 上自己构建短生命周期市场协议。

所以暂时不把 Azuro 当成依赖。

定位：

> 链上架构和经济机制老师。

---

## 资料入口

- Azuro Knowledge Hub：
  https://gem.azuro.org/knowledge-hub
- Reinforcement：
  https://gem.azuro.org/knowledge-hub/how-azuro-works/components/reinforcement
- Contracts FAQ：
  https://gem.azuro.org/knowledge-hub/faqs/contracts

---

# 22. LEVR

## 它是什么

LEVR 是 Monad 上非常值得关注的体育预测 / 体育交易项目。

它已经把体育市场、Oracle、链上资金和 Monad 放到了一起。

公开产品包括：

- 体育 Event Contracts；
- In-game Betting；
- Oracle 驱动数据；
- 流动性 Vault；
- 杠杆；
- 实时进出体育仓位。

---

## 为什么和 PointPulse 有关系

LEVR 证明：

> “体育市场 + Monad + Oracle + 链上交易”本身是成立的方向。

但它与 PointPulse 的重点不同。

LEVR 更接近：

```text
一场比赛
↓
持续交易一个市场 / 仓位
```

PointPulse 想做：

```text
一场比赛
↓
连续生成很多极短生命周期的 Micro Market
```

所以它是重要的 Monad 体育竞品/参考，而不是直接相同产品。

---

## 我们参考什么

主要参考：

- Monad 体育交易 UX；
- Oracle；
- Sports Vault；
- LP 对手盘；
- In-game Market；
- 风险分层；
- 实时交易。

尤其值得后续研究它的：

```text
MVP Vault
```

因为它让资金池充当用户的交易对手，同时避免单场比赛暴露全部池子风险。

---

## 资料入口

- LEVR：
  https://levr.bet/
- LEVR Blog：
  https://blog.levr.bet/

---

# 23. Hunch

## 它是什么

Hunch 是 Monad Blitz 出现过的短周期 Prediction Game。

它的典型流程：

```text
主持人创建 YES / NO 问题
↓
15 / 30 / 60 秒倒计时
↓
用户预测
↓
倒计时结束锁定
↓
主持人 Resolve
↓
积分 / 排行榜
↓
最终 Prize Pool
↓
赢家 Claim
```

---

## 为什么值得参考

Hunch 证明：

> Monad 上短时间、高频参与、倒计时、Lock、Resolve、Claim 这一套 UX 是可以成立的。

它和 PointPulse 很像的地方：

```text
短生命周期
+
YES / NO
+
Countdown
+
Lock
+
Resolve
+
Claim
```

---

## 和我们最大的不同

Hunch 当前主要是：

```text
预测用积分
+
活动结束后的链上 Prize Pool
```

而不是：

```text
每一个 Micro Market 都进行真实链上金融交易
```

PointPulse 要继续解决：

- 每个市场真实下注；
- 流动性；
- AMM；
- 风险；
- Oracle；
- 每个市场独立 Resolve。

---

## 技术栈参考

Hunch 使用过：

- Next.js；
- TypeScript；
- React；
- RainbowKit；
- wagmi；
- viem；
- Solidity；
- Monad；
- Claim-based Prize Pool。

这些都可以作为 PointPulse 前端和 Claim 流程参考。

---

## 资料入口

- Monad 项目页：
  https://mojo.devnads.com/projects/267

---

# 24. Monocast

## 它是什么

Monocast 是一个非常值得保留的 Monad Prediction Market 黑客松参考。

它做的是：

> AI 增强的 Monad Prediction Market。

它公开的技术栈包括：

```text
Solidity 0.8.24
LMSR
Next.js 14
wagmi
viem
Monad Testnet
```

这和我们未来 Phase 3 的路线高度相关。

---

## 它解决什么

Monocast 做了：

```text
用户给出市场主题
↓
AI 生成清晰市场定义
↓
多个 Agent 审查市场
↓
市场创建
↓
LMSR 定价
↓
多个 Agent / Oracle 仲裁
↓
Resolve
```

---

## 我们重点参考什么

### Phase 3：LMSR

这是目前和我们最直接相关的地方。

等 PointPulse 开始研究：

```text
AMM 定价公式
```

第一批就应该查看 Monocast 的 LMSR 实现。

### Oracle / 多方结果

它使用多个 Agent 对结算结果进行判断，可以作为后期：

```text
单 Oracle
↓
多 Oracle / 多 Agent
```

的参考。

---

## 和 PointPulse 区别

Monocast 是：

> 通用 Prediction Market + AI Market Definition。

PointPulse 是：

> 体育事件驱动 + 极短生命周期 Micro Markets。

所以我们主要借它：

- LMSR；
- Prediction Contract；
- Oracle / Judge；
- Monad 技术栈。

---

## 资料入口

- Monad 项目页：
  https://mojo.devnads.com/projects/268

---

# 25. RareBetSports

## 它是什么

RareBetSports 是体育方向的链上产品，可作为体育投注用户流程参考。

目前公开文档里可以看到：

- 用户钱包；
- 体育 Props；
- 投注；
- Open / Past Bets；
- Claim；
- MON Gas。

---

## 我们参考什么

主要参考产品层：

- 体育市场怎么展示；
- Props 怎么组织；
- 用户怎么下注；
- Open / Past Markets；
- Claim 提示；
- Gas 不足怎么处理。

它不作为 PointPulse 的核心协议参考。

---

## 资料入口

- Docs：
  https://rarebetsports.gitbook.io/rarebetsports/

---

# 26. Castora / Griffy

这两个可以作为 Monad Prediction Market 的轻量产品参考。

## Castora

Monad 生态中的价格 Prediction Market。

主要参考：

- Prediction Market 产品形态；
- Monad 上创建和展示市场。

## Griffy

二元预测产品，强调非常简单的用户交互。

主要参考：

- Consumer UX；
- YES / NO 快速操作；
- 降低 Prediction Market 使用门槛。

---

## 资料入口

- Monad Ecosystem：
  https://www.monad.xyz/ecosystem

---

# 27. 后续开发遇到问题时先查谁

以后不用重新搜索整个行业。

直接按问题查：

### 体育数据不懂

先查：

```text
Sportradar
```

### 不知道什么时候应该创建 / Suspend / Resolve 市场

先查：

```text
Kero
```

### 不知道概率和专业赔率怎么计算

先查：

```text
nVenue
```

### 不知道 LP、风险、共享流动性怎么设计

先查：

```text
Azuro
+
LEVR
```

### 不知道 AMM / LMSR 怎么实现

先查：

```text
Monocast
+
Azuro
```

### 不知道 Monad 体育市场产品怎么做

先查：

```text
LEVR
+
RareBetSports
```

### 不知道短周期倒计时 / Lock / Claim UX 怎么做

先查：

```text
Hunch
```

### 不知道 Monad 普通 Prediction Market 长什么样

先查：

```text
Monocast
+
Castora
+
Griffy
```

---

# 28. 项目参考关系最终总结

PointPulse 不是从零发明整条技术链。

我们的参考组合可以记成：

```text
Sportradar
真实体育数据

        ↓

nVenue
状态 / 概率模型参考

        ↓

Kero
Micro Market Generator
市场生命周期

        ↓

PointPulse

        ↓

Azuro
流动性 / AMM / 风险参考

        +

LEVR
Monad 体育链上交易参考

        +

Monocast
Monad + LMSR + Oracle 参考

        ↓

Monad
真正执行短生命周期链上市场
```

PointPulse 要解决的独特问题不是：

> “怎么做一个 Prediction Market？”

而是：

> “怎么让一场真实体育比赛连续生成大量只有几秒到几十秒生命周期的链上 Prediction Markets，并让创建、交易、Freeze、Resolve 和下一轮市场之间足够快。”

这也是 Monad 在项目里的核心意义。

