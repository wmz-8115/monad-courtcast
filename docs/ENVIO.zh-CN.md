# PointPulse 的 Envio 实时审计层

`indexer/` 是独立的 Envio HyperIndex 项目。它不会保管钱包、私钥或运营密钥，也不会
发送交易；它只把 Monad Testnet 上 PointPulse 市场合约发出的事件变成可查询的 GraphQL 数据。

## 索引内容

- `MarketCreated` → 市场题目、创建者、时间窗口；
- `BetPlaced` → YES/NO 奖池与投注审计记录；
- `MarketFrozen`、`MarketResolved`、`MarketCancelled`、`MarketVoided` → 市场生命周期；
- `Claimed` → 领奖或退款记录。

这会生成两张核心数据表：`Market`（当前汇总状态）和 `MarketActivity`（不可变操作日志）。
交易页会用它做个人历史，运营页会用它做自动化演示的可审计执行时间线。

## 当前环境限制

Envio CLI 3.14.0 不原生支持 Windows。此电脑目前没有 WSL Linux 发行版，也没有 Docker，
所以索引器代码已就绪但尚未在本机启动。请先安装 WSL 2 的 Linux 发行版和 Docker Desktop；
这会改动系统，需由你确认并执行。

## 环境准备完成后的运行方式

在 WSL 中进入项目的 `indexer/` 目录，并准备 Envio API token：

```bash
export ENVIO_API_TOKEN='从 Envio Cloud 创建的 token'
export POINTPULSE_MARKET_ADDRESS='0x已部署的V2市场合约地址'
# 在启动演示前运行可用 latest；已运行过演示则填 V2 部署交易所在区块。
export POINTPULSE_START_BLOCK='latest'

pnpm configure
pnpm codegen
pnpm check
pnpm dev
```

`pnpm dev` 会通过 Docker 启动本地 Postgres、Hasura 和 GraphQL 服务。等 V2 部署、索引器真实
跑起来后，再把前端切到这个 GraphQL 地址；在此之前，前端继续安全地使用现有 RPC 读取模式。
