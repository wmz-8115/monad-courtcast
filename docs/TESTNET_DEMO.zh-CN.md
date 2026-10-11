# PointPulse 测试网演示清单

本项目仅连接 Monad Testnet：Chain ID `10143`、RPC `https://testnet-rpc.monad.xyz`。不要将任何主网钱包或真实资产用于本演示。

## 一次性准备

1. 使用一个专用测试钱包作为部署者和 Oracle，在 [Monad Faucet](https://faucet.monad.xyz) 领取少量测试 MON。
2. 构建并启动前端：

   ```bash
   pnpm build:frontend
   pnpm dev:frontend
   ```

3. 连接 MetaMask，确认页面显示 Monad Testnet；点击“用 MetaMask 部署”。钱包会依次请求两笔交易确认：
   - 部署 `MockUSDC`
   - 部署 `PredictionMarket`

4. 等待两笔交易确认。页面自动保存两个公开合约地址，并把部署钱包设置为 Oracle。私钥、助记词和钱包密码不会交给网页或命令行。

## Alice / Bob 演示

建议部署钱包使用一个浏览器配置文件，Alice 与 Bob 使用两个不同的 MetaMask 钱包或浏览器配置文件。

1. Alice 和 Bob 分别连接页面，点击“领取 100 mUSDC”。
2. Oracle 创建市场，例如“下一分会是 Ace 吗？”，下注窗口设为 30 秒，结算时间设为 35 秒后。
3. Alice 输入 `10` 并点击“买 YES”，依次确认授权和下注两笔交易。
4. Bob 输入 `20` 并点击“买 NO”，依次确认授权和下注两笔交易。
5. 截止后，由任意钱包点击“到时后冻结市场”。
6. 到结算时间后，用 Oracle 钱包点击 `NO` 结算。
7. 用 Bob 钱包点击“领取奖池”。应领取 `30 mUSDC`；Bob 的余额由初始 `100` 变为 `110 mUSDC`，Alice 为 `90 mUSDC`，市场合约余额变为 `0`。

## 无赢家退款验证

再创建一个只有 Alice 对 YES 下注的市场，并由 Oracle 结算为 NO。市场将显示“退款中”；Alice 点击“领取退款”后可取回全部 `10 mUSDC`。这验证结果一侧无人下注时不会锁住资金。
