import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, type Address, type Hash } from "viem";

import { getMockUsdcAccount, getPointPulseSnapshot, type MarketView } from "./chain/pointPulseReader.js";
import { deployPointPulse } from "./chain/pointPulseDeployer.js";
import { approveMarket, claim, claimFaucet, placeBet, waitForPointPulseTransaction } from "./chain/pointPulseWriter.js";
import { isPointPulseDeployed, monadTestnet } from "./contracts/deployment.js";
import { connectWallet, ensureMonadTestnet, getConnectedAddress, getWalletChainId } from "./wallet/walletSession.js";

function shortAddress(address: Address) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }
function formatUsdc(amount: bigint) {
  const [whole, fraction = ""] = formatUnits(amount, 6).split(".");
  return fraction.length === 0 ? whole : `${whole}.${fraction.slice(0, 2)}`;
}
function statusText(status: number) { return ["下注中", "已冻结", "已结算", "退款中"][status] ?? "未知状态"; }
function outcomeText(outcome: number) { return outcome === 1 ? "YES" : outcome === 2 ? "NO" : "等待 Oracle 结果"; }
function remainingText(closeAt: bigint, now: number) {
  const seconds = Number(closeAt) - now;
  if (seconds <= 0) return "等待冻结";
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}:${String(seconds % 60).padStart(2, "0")}` : `${seconds} 秒`;
}
function estimateMultiplier(pool: bigint, sidePool: bigint, typedAmount: string) {
  try {
    const amount = typedAmount.trim() === "" ? 0n : parseUnits(typedAmount, 6);
    if (amount <= 0n || sidePool + amount === 0n) return "输入金额后显示";
    return `${(Number((pool + amount) * 100n / (sidePool + amount)) / 100).toFixed(2)}× 预估回报`;
  } catch { return "请输入有效金额"; }
}

export function App() {
  const [address, setAddress] = useState<Address>();
  const [usdcBalance, setUsdcBalance] = useState<bigint>();
  const [faucetClaimed, setFaucetClaimed] = useState(false);
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [walletMessage, setWalletMessage] = useState("尚未连接钱包");
  const [notice, setNotice] = useState("连接钱包后可读取链上市场与个人仓位。");
  const [isDeployed, setIsDeployed] = useState(() => isPointPulseDeployed());
  const [busy, setBusy] = useState(false);
  const [betAmounts, setBetAmounts] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1_000));
  const videoUrl = import.meta.env.VITE_REPLAY_VIDEO_URL as string | undefined;

  const refresh = useCallback(async () => {
    try {
      const connected = await getConnectedAddress();
      if (connected === undefined) { setAddress(undefined); setUsdcBalance(undefined); setWalletMessage("尚未连接钱包"); return; }
      setAddress(connected);
      const chainId = await getWalletChainId();
      setWalletMessage(chainId === monadTestnet.id ? "已连接 Monad Testnet" : "请切换至 Monad Testnet");
      const deployed = isPointPulseDeployed(); setIsDeployed(deployed);
      if (!deployed) return;
      const [account, snapshot] = await Promise.all([getMockUsdcAccount(connected), getPointPulseSnapshot(connected)]);
      setUsdcBalance(account.balance); setFaucetClaimed(account.faucetClaimed); setMarkets(snapshot.markets);
    } catch (error) { setWalletMessage(error instanceof Error ? error.message : "无法读取钱包状态"); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => { setNow(Math.floor(Date.now() / 1_000)); if (document.visibilityState === "visible") void refresh(); }, 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function handleConnect() { try { await connectWallet(); await refresh(); } catch (error) { setNotice(error instanceof Error ? error.message : "钱包连接未完成。"); } }
  async function handleDeploy() {
    if (address === undefined) { setNotice("请先连接运营用的 MetaMask 账户。"); return; }
    try { setBusy(true); await ensureMonadTestnet(); await deployPointPulse(address, setNotice); setIsDeployed(true); setNotice("V2 合约已部署；请到运营后台启动预写市场演示。"); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "部署未完成。"); } finally { setBusy(false); }
  }
  async function submit(label: string, write: (from: Address) => Promise<Hash>) {
    if (!isDeployed) { setNotice("请先由运营者完成测试网部署。"); return; }
    if (address === undefined) { setNotice("请先连接钱包。"); return; }
    try { setBusy(true); setNotice(`请在 MetaMask 中确认：${label}。`); const hash = await write(address); setNotice(`交易已提交：${hash.slice(0, 10)}…，等待链上确认。`); await waitForPointPulseTransaction(hash); setNotice(`${label}成功，已刷新链上数据。`); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : `${label}未完成。`); } finally { setBusy(false); }
  }
  async function handleBet(market: MarketView, side: 1 | 2) {
    const amountText = betAmounts[market.id.toString()] ?? "";
    if (address === undefined) { setNotice("请先连接钱包。"); return; }
    try {
      const amount = parseUnits(amountText, 6); if (amount <= 0n) throw new Error("请输入大于 0 的 mUSDC 金额。");
      setBusy(true); setNotice("第一步：请在 MetaMask 中授权市场合约使用 mUSDC。");
      await waitForPointPulseTransaction(await approveMarket(address, amount));
      setNotice(`第二步：请确认 ${side === 1 ? "YES" : "NO"} 下注。`);
      await waitForPointPulseTransaction(await placeBet(address, market.id, side, amount));
      setNotice("下注成功，已刷新奖池和你的仓位。"); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "下注未完成。"); } finally { setBusy(false); }
  }

  const liveMarkets = useMemo(() => markets.filter((market) => market.status === 0 || market.status === 1), [markets]);
  const historyMarkets = useMemo(() => markets.filter((market) => market.status === 2 || market.status === 3), [markets]);
  return <main className="app-shell pointpulse-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark" aria-hidden="true">◉</div><strong>PointPulse</strong><span className="network-pill">◇ Monad Testnet</span></div><div className="wallet-summary"><a className="page-link" href="#history">我的历史</a><a className="page-link" href="/operator">运营后台</a>{address !== undefined && <span>{shortAddress(address)} · {usdcBalance === undefined ? "…" : `${formatUsdc(usdcBalance)} mUSDC`}</span>}<button className="wallet-button" type="button" onClick={() => void handleConnect()}>{address === undefined ? "连接钱包" : "刷新钱包"}</button></div></header>
    <section className="warning-banner" role="note"><span>⚠</span>仅限 Monad Testnet 演示，请勿使用真实资产。</section><p className="wallet-status">{walletMessage} · 页面每 5 秒刷新链上市场。</p><p className="notice">{notice}</p>
    {!isDeployed && <section className="deployment-card"><div><strong>PointPulse V2 尚未部署</strong><p>由运营账户在运营后台部署。V2 加入了撤回未结算市场与退款能力。</p></div><button className="primary-button deploy-button" type="button" disabled={busy || address === undefined} onClick={() => void handleDeploy()}>用当前钱包部署 V2</button></section>}
    <section className="viewer-grid"><div className="video-card"><div className="video-card-head"><div><span className="eyebrow">REPLAY · LIVE DEMO</span><h1>网球短期预测</h1><p>录播会按真实播放器方式呈现；市场、投注、结算均以链上状态为准。</p></div><span className="live-dot">● 演示中</span></div>{videoUrl ? <video className="replay-video" controls playsInline src={videoUrl}>当前浏览器无法播放该视频。</video> : <div className="video-placeholder"><span>🎾</span><strong>已预留录播画面位置</strong><p>你找到 MP4/WebM 或可授权的视频链接后，把它接入这里；无需改动合约或市场逻辑。</p></div>}</div><aside className="card account-card"><h2>我的账户</h2><strong className="balance-value">{usdcBalance === undefined ? "—" : `${formatUsdc(usdcBalance)} mUSDC`}</strong><p>测试币余额</p><button className="secondary-button" type="button" disabled={busy || !isDeployed || faucetClaimed} onClick={() => void submit("领取 100 mUSDC", claimFaucet)}>{faucetClaimed ? "已领取测试币" : "领取 100 mUSDC"}</button><p className="oracle-note">运营账户会以“演示流动性”身份自动下注；链上数据公开可审计，但本页只展示总奖池与本人的仓位。</p></aside></section>
    <section className="markets-section"><div className="section-heading"><div><span className="eyebrow">LIVE MARKETS</span><h2>正在进行的市场</h2><p>可同时出现多个未冻结市场。倒计时结束后，运营端负责冻结与提交预写结果。</p></div><button className="wallet-button" type="button" onClick={() => void refresh()}>立即刷新</button></div>{liveMarkets.length === 0 ? <div className="empty-state"><span>◌</span><strong>{isDeployed ? "当前没有开放市场" : "等待运营者部署 V2"}</strong><p>运营者启动演示后，市场会自动上链并显示在这里。</p></div> : <div className="market-list">{liveMarkets.map((market) => {
      const amount = betAmounts[market.id.toString()] ?? ""; const pool = market.yesPool + market.noPool;
      return <article className="market-card" key={market.id.toString()}><div className="market-card-top"><span className={`status status-${market.status}`}>{statusText(market.status)}</span><span className="market-id">#{market.id.toString()} · {market.status === 0 ? `剩余 ${remainingText(market.closeAt, now)}` : "等待结果"}</span></div><h3>{market.question}</h3><div className="pool-grid"><div><span>YES 总额</span><strong>{formatUsdc(market.yesPool)} mUSDC</strong></div><div><span>NO 总额</span><strong>{formatUsdc(market.noPool)} mUSDC</strong></div></div><p className="position">我的仓位：YES {formatUsdc(market.yesStake)} · NO {formatUsdc(market.noStake)} mUSDC</p>{market.status === 0 && <div className="bet-controls"><input aria-label="下注金额" value={amount} onChange={(event) => setBetAmounts((values) => ({ ...values, [market.id.toString()]: event.target.value }))} placeholder="输入 mUSDC 金额" inputMode="decimal"/><small>YES：{estimateMultiplier(pool, market.yesPool, amount)} · NO：{estimateMultiplier(pool, market.noPool, amount)}</small><div><button className="yes-button" type="button" disabled={busy} onClick={() => void handleBet(market, 1)}>投注 YES</button><button className="no-button" type="button" disabled={busy} onClick={() => void handleBet(market, 2)}>投注 NO</button></div></div>}</article>;
    })}</div>}</section>
    <section className="markets-section" id="history"><div className="section-heading"><div><span className="eyebrow">SETTLED</span><h2>历史市场与领取</h2><p>已结算市场的赢家可领取奖池；退款中市场可领回原下注。</p></div></div>{historyMarkets.length === 0 ? <div className="empty-state"><strong>暂时没有可领取的历史市场</strong></div> : <div className="market-list">{historyMarkets.map((market) => <article className="market-card" key={market.id.toString()}><div className="market-card-top"><span className={`status status-${market.status}`}>{statusText(market.status)}</span><span className="market-id">#{market.id.toString()}</span></div><h3>{market.question}</h3><div className="pool-grid"><div><span>总奖池</span><strong>{formatUsdc(market.yesPool + market.noPool)} mUSDC</strong></div><div><span>链上结果</span><strong>{outcomeText(market.outcome)}</strong></div></div><p className="position">我的仓位：YES {formatUsdc(market.yesStake)} · NO {formatUsdc(market.noStake)} mUSDC</p><button className="primary-button claim-button" type="button" disabled={busy || (market.yesStake === 0n && market.noStake === 0n)} onClick={() => void submit(market.status === 3 ? "领取退款" : "领取奖池", (from) => claim(from, market.id))}>{market.status === 3 ? "领取退款" : "领取奖池"}</button></article>)}</div>}</section>
  </main>;
}
