import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, parseUnits, type Address, type Hash } from "viem";

import { getMockUsdcAccount, getPointPulseSnapshot, type MarketView } from "./chain/pointPulseReader.js";
import { approveMarket, claim, claimFaucet, placeBet, waitForPointPulseTransaction } from "./chain/pointPulseWriter.js";
import { monadTestnet } from "./contracts/deployment.js";
import { connectWallet, getConnectedAddress, getWalletChainId, subscribeToWalletChanges } from "./wallet/walletSession.js";

function shortAddress(address: Address) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }
function formatUsdc(amount: bigint) {
  const [whole, fraction = ""] = formatUnits(amount, 6).split(".");
  return fraction.length === 0 ? whole : `${whole}.${fraction.slice(0, 2)}`;
}
function statusText(status: number) { return ["下注中", "等待结果", "已结算", "已退款"][status] ?? "未知状态"; }
function outcomeText(outcome: number) { return outcome === 1 ? "YES" : outcome === 2 ? "NO" : "等待结果"; }
function remainingText(closeAt: bigint, now: number) {
  const seconds = Number(closeAt) - now;
  if (seconds <= 0) return "即将封盘";
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}:${String(seconds % 60).padStart(2, "0")}` : `${seconds} 秒`;
}
function estimateMultiplier(pool: bigint, sidePool: bigint, typedAmount: string) {
  try {
    const amount = typedAmount.trim() === "" ? 0n : parseUnits(typedAmount, 6);
    if (amount <= 0n || sidePool + amount === 0n) return "输入金额";
    return `${(Number(((pool + amount) * 100n) / (sidePool + amount)) / 100).toFixed(2)}×`;
  } catch { return "金额有误"; }
}
function hasClaimablePosition(market: MarketView) {
  if (market.status === 3) return market.yesStake + market.noStake > 0n;
  if (market.status !== 2) return false;
  return market.outcome === 1 ? market.yesStake > 0n : market.outcome === 2 && market.noStake > 0n;
}

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [address, setAddress] = useState<Address>();
  const [usdcBalance, setUsdcBalance] = useState<bigint>();
  const [faucetClaimed, setFaucetClaimed] = useState(false);
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [marketArchiveOpen, setMarketArchiveOpen] = useState(false);
  const [marketArchiveTab, setMarketArchiveTab] = useState<"all" | "mine">("all");
  const [marketScale, setMarketScale] = useState(1);
  const [marketLanes, setMarketLanes] = useState<Record<string, "left" | "right">>({});
  const [replayStarted, setReplayStarted] = useState(false);
  const [notice, setNotice] = useState("市场数据正在同步…");
  const [busy, setBusy] = useState(false);
  const [betAmounts, setBetAmounts] = useState<Record<string, string>>({});
  const [claimedMarketIds, setClaimedMarketIds] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1_000));
  const videoUrl = import.meta.env.VITE_REPLAY_VIDEO_URL as string | undefined;

  const refresh = useCallback(async () => {
    let connected: Address | undefined;
    try {
      connected = await getConnectedAddress();
      if (connected !== undefined && (await getWalletChainId()) !== monadTestnet.id) {
        setNotice("钱包网络不是 Monad Testnet，点击右上角账户按钮即可切换。");
      }
    } catch { connected = undefined; }
    setAddress(connected);

    try {
      const snapshot = await getPointPulseSnapshot(connected);
      setMarkets(snapshot.markets);
      if (connected === undefined) {
        setUsdcBalance(undefined);
        setFaucetClaimed(false);
      } else {
        const account = await getMockUsdcAccount(connected);
        setUsdcBalance(account.balance);
        setFaucetClaimed(account.faucetClaimed);
      }
      setNotice((current) => current === "市场数据正在同步…" ? "链上市场已同步" : current);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "暂时无法读取链上市场。");
    }
  }, []);

  useEffect(() => {
    void refresh();
    let unsubscribe = () => undefined;
    try { unsubscribe = subscribeToWalletChanges(() => void refresh()); } catch { /* Wallet is optional for browsing. */ }
    const timer = window.setInterval(() => {
      setNow(Math.floor(Date.now() / 1_000));
      if (document.visibilityState === "visible") void refresh();
    }, 5_000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, [refresh]);

  async function handleConnect() {
    try {
      setBusy(true);
      await connectWallet();
      setNotice("钱包已连接 Monad Testnet。");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "钱包连接未完成。");
    } finally { setBusy(false); }
  }

  async function submit(label: string, write: (from: Address) => Promise<Hash>) {
    if (address === undefined) { setAccountOpen(true); setNotice("请先连接钱包。"); return false; }
    try {
      setBusy(true);
      setNotice(`请在 MetaMask 中确认：${label}`);
      const hash = await write(address);
      setNotice("交易已提交，等待 Monad Testnet 确认…");
      await waitForPointPulseTransaction(hash);
      setNotice(`${label}成功`);
      await refresh();
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `${label}未完成。`);
      return false;
    } finally { setBusy(false); }
  }

  async function handleBet(market: MarketView, side: 1 | 2) {
    const amountText = betAmounts[market.id.toString()] ?? "";
    if (address === undefined) { setAccountOpen(true); setNotice("连接钱包后即可下注。"); return; }
    try {
      const amount = parseUnits(amountText, 6);
      if (amount <= 0n) throw new Error("请输入大于 0 的 mUSDC 金额。");
      setBusy(true);
      setNotice("第一步：请授权市场合约使用本次 mUSDC。");
      await waitForPointPulseTransaction(await approveMarket(address, amount));
      setNotice(`第二步：请确认 ${side === 1 ? "YES" : "NO"} 下注。`);
      await waitForPointPulseTransaction(await placeBet(address, market.id, side, amount));
      setBetAmounts((values) => ({ ...values, [market.id.toString()]: "" }));
      setNotice("下注成功，市场仓位已更新。");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "下注未完成。");
    } finally { setBusy(false); }
  }

  async function handleClaim(market: MarketView) {
    const marketId = market.id.toString();
    const completed = await submit(market.status === 3 ? "领取退款" : "领取奖金", (from) => claim(from, market.id));
    if (completed) setClaimedMarketIds((ids) => new Set(ids).add(marketId));
  }

  async function startReplay() {
    if (!videoUrl) { setNotice("视频槽已经准备好；添加视频并设置 VITE_REPLAY_VIDEO_URL 后即可播放。"); return; }
    setReplayStarted(true);
    try {
      await videoRef.current?.play();
      setNotice("演示已开始，新市场会在画面两侧出现。");
    } catch { setNotice("浏览器阻止了播放，请直接点击视频上的播放按钮。"); }
  }

  const liveMarkets = useMemo(
    () => markets.filter((market) => market.status === 0 && Number(market.closeAt) > now),
    [markets, now],
  );
  const historyMarkets = useMemo(() => markets.filter((market) => market.status === 2 || market.status === 3), [markets]);
  const claimableMarkets = useMemo(
    () => historyMarkets.filter((market) => hasClaimablePosition(market) && !claimedMarketIds.has(market.id.toString())),
    [claimedMarketIds, historyMarkets],
  );
  const myMarkets = markets.filter((market) => market.yesStake + market.noStake > 0n);

  useEffect(() => {
    const activeMarkets = [...liveMarkets].sort((a, b) => Number(a.id - b.id));
    setMarketLanes((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([marketId]) => activeMarkets.some((market) => market.id.toString() === marketId)),
      ) as Record<string, "left" | "right">;
      let leftCount = Object.values(next).filter((lane) => lane === "left").length;
      let rightCount = Object.values(next).filter((lane) => lane === "right").length;
      const initialPattern: Array<"left" | "right"> = ["left", "right", "right", "left"];

      for (const market of activeMarkets) {
        const marketId = market.id.toString();
        if (next[marketId] !== undefined || leftCount + rightCount >= 4) continue;
        const lane = leftCount === rightCount
          ? initialPattern[leftCount + rightCount]
          : leftCount < rightCount ? "left" : "right";
        next[marketId] = lane;
        if (lane === "left") leftCount += 1;
        else rightCount += 1;
      }

      const unchanged = Object.keys(current).length === Object.keys(next).length
        && Object.entries(current).every(([marketId, lane]) => next[marketId] === lane);
      return unchanged ? current : next;
    });
  }, [liveMarkets]);

  const featuredMarkets = useMemo(() => {
    const laneMarkets = (lane: "left" | "right") => liveMarkets
      .filter((market) => marketLanes[market.id.toString()] === lane)
      .sort((a, b) => Number(a.id - b.id));
    const positioned = (lane: "left" | "right") => laneMarkets(lane).map((market, index, laneItems) => ({
      market,
      lane,
      position: laneItems.length === 1 ? "middle" : index === 0 ? "top" : "middle",
    }));
    return [...positioned("left"), ...positioned("right")];
  }, [liveMarkets, marketLanes]);

  return <main className="courtcast-app">
    <header className="courtcast-topbar">
      <a className="courtcast-brand" href="/" aria-label="CourtCast 首页"><span className="courtcast-logo" aria-hidden="true">CC</span><span><strong>CourtCast</strong><small>LIVE PREDICTION</small></span></a>
      <div className="courtcast-top-actions"><span className="testnet-badge">MONAD TESTNET</span><button className="market-archive-trigger" type="button" onClick={() => { setMarketArchiveTab("all"); setMarketArchiveOpen(true); }}><span aria-hidden="true">▤</span> 市场总览</button><button className="account-trigger" type="button" onClick={() => setAccountOpen(true)}><span className="account-trigger-icon" aria-hidden="true">◎</span><span>{address === undefined ? "连接钱包" : shortAddress(address)}</span>{claimableMarkets.length > 0 && <b aria-label={`${claimableMarkets.length} 个可领取市场`}>{claimableMarkets.length}</b>}</button></div>
    </header>

    <section className="cinema-stage" aria-label="CourtCast 沉浸式赛事直播"><div className="cinema-video-wrap">
      {videoUrl ? <video ref={videoRef} className="cinema-video" src={videoUrl} controls={replayStarted} playsInline onEnded={() => setReplayStarted(false)}>当前浏览器无法播放该视频。</video> : <div className="cinema-placeholder" aria-label="视频占位区域"><div className="court-lines" aria-hidden="true"><span /><span /><span /></div><p>COURTCAST FEATURE MATCH</p></div>}
      {!replayStarted && <div className="replay-intro"><span className="replay-kicker">INTERACTIVE MATCH · ON-CHAIN</span><h1>每一分，都可以预测</h1><p>观看比赛，在关键时刻对场上即将发生的结果下注。</p><button type="button" onClick={() => void startReplay()}><span aria-hidden="true">▶</span>{videoUrl ? "开始观看" : "视频即将接入"}</button></div>}
      <div className="stage-status"><i /> LIVE DEMO <span>·</span> 市场每 5 秒同步</div>
      <div className="market-scale-controls" aria-label="市场卡片大小"><button type="button" aria-label="缩小市场卡片" disabled={marketScale === 0} onClick={() => setMarketScale((scale) => Math.max(0, scale - 1))}>A−</button><button type="button" aria-label="放大市场卡片" disabled={marketScale === 2} onClick={() => setMarketScale((scale) => Math.min(2, scale + 1))}>A+</button></div>
      <div className={`floating-market-layer market-scale-${marketScale}`}>
      {featuredMarkets.map(({ market, lane, position }) => {
        const amount = betAmounts[market.id.toString()] ?? "";
        const pool = market.yesPool + market.noPool;
        return <article className={`floating-market floating-market-${lane} floating-market-${position}`} key={market.id.toString()}>
          <div className="floating-market-head"><span className={`market-state market-state-${market.status}`}>{statusText(market.status)}</span><span>#{market.id.toString()} · {market.status === 0 ? remainingText(market.closeAt, now) : "已封盘"}</span></div>
          <h2>{market.question}</h2><div className="floating-odds"><span>YES <strong>{formatUsdc(market.yesPool)}</strong></span><span>NO <strong>{formatUsdc(market.noPool)}</strong></span></div>
          {market.status === 0 ? <div className="floating-bet"><div className="floating-amount"><input aria-label={`市场 ${market.id.toString()} 下注金额`} value={amount} inputMode="decimal" placeholder="下注金额" onChange={(event) => setBetAmounts((values) => ({ ...values, [market.id.toString()]: event.target.value }))}/><span>mUSDC</span></div><div className="floating-bet-actions"><button type="button" disabled={busy} onClick={() => void handleBet(market, 1)}>YES <small>{estimateMultiplier(pool, market.yesPool, amount)}</small></button><button type="button" disabled={busy} onClick={() => void handleBet(market, 2)}>NO <small>{estimateMultiplier(pool, market.noPool, amount)}</small></button></div></div> : <p className="market-waiting">投注已结束，等待 Oracle 公布结果</p>}
        </article>;
      })}
      </div>
      {featuredMarkets.length === 0 && <div className="no-live-market"><span>◌</span> 等待下一条场内预测</div>}
      {liveMarkets.length > featuredMarkets.length && <div className="market-queue">待出现 {liveMarkets.length - featuredMarkets.length} 个市场</div>}
    </div></section>

    <footer className="courtcast-footer"><span>仅限 Monad Testnet 演示 · 请勿使用真实资产</span><span>{notice}</span></footer>

    {accountOpen && <button className="drawer-backdrop" aria-label="关闭账户面板" type="button" onClick={() => setAccountOpen(false)} />}
    <aside className={`account-drawer ${accountOpen ? "account-drawer-open" : ""}`} aria-hidden={!accountOpen} aria-label="我的账户">
      <div className="drawer-head"><div><span>MY COURTCAST</span><h2>我的账户</h2></div><button type="button" aria-label="关闭" onClick={() => setAccountOpen(false)}>×</button></div>
      {address === undefined ? <section className="drawer-connect"><div aria-hidden="true">◎</div><h3>连接钱包开始体验</h3><p>连接后可领取测试币、下注、查看仓位和领取结算结果。</p><button type="button" disabled={busy} onClick={() => void handleConnect()}>连接 MetaMask</button></section> : <>
        <section className="wallet-balance-card"><div><span>测试币余额</span><strong>{usdcBalance === undefined ? "—" : formatUsdc(usdcBalance)} <small>mUSDC</small></strong></div><span className="connected-chip"><i /> {shortAddress(address)}</span><button type="button" disabled={busy || faucetClaimed} onClick={() => void submit("领取 100 mUSDC", claimFaucet)}>{faucetClaimed ? "测试币已领取" : "领取 100 mUSDC 测试币"}</button></section>
        <section className="drawer-section"><div className="drawer-section-title"><h3>可领取</h3><span>{claimableMarkets.length}</span></div>{claimableMarkets.length === 0 ? <p className="drawer-empty">当前没有待领取的奖金或退款。</p> : claimableMarkets.map((market) => <article className="drawer-market" key={market.id.toString()}><div><span>#{market.id.toString()} · {market.status === 3 ? "退款" : `${outcomeText(market.outcome)} 胜出`}</span><h4>{market.question}</h4></div><button type="button" disabled={busy} onClick={() => void handleClaim(market)}>Claim</button></article>)}</section>
        <section className="drawer-section"><div className="drawer-section-title"><h3>我的市场记录</h3><span>{myMarkets.length}</span></div>{myMarkets.length === 0 ? <p className="drawer-empty">下注后，历史记录会显示在这里。</p> : myMarkets.map((market) => <article className="history-row" key={market.id.toString()}><div><span className={`history-dot history-dot-${market.status}`} /><h4>{market.question}</h4></div><p><span>{statusText(market.status)}{market.status === 2 ? ` · ${outcomeText(market.outcome)}` : ""}</span><strong>YES {formatUsdc(market.yesStake)} · NO {formatUsdc(market.noStake)}</strong></p></article>)}</section>
      </>}
    </aside>

    {marketArchiveOpen && <button className="drawer-backdrop" aria-label="关闭市场总览" type="button" onClick={() => setMarketArchiveOpen(false)} />}
    <aside className={`market-archive-drawer ${marketArchiveOpen ? "market-archive-drawer-open" : ""}`} aria-hidden={!marketArchiveOpen} aria-label="市场总览">
      <div className="drawer-head"><div><span>COURTCAST ARCHIVE</span><h2>市场总览</h2></div><button type="button" aria-label="关闭" onClick={() => setMarketArchiveOpen(false)}>×</button></div>
      <div className="archive-tabs"><button type="button" className={marketArchiveTab === "all" ? "active" : ""} onClick={() => setMarketArchiveTab("all")}>全部市场 <span>{markets.length}</span></button><button type="button" className={marketArchiveTab === "mine" ? "active" : ""} onClick={() => setMarketArchiveTab("mine")}>我的下注 <span>{myMarkets.length}</span></button></div>
      <div className="archive-list">{(marketArchiveTab === "all" ? markets : myMarkets).length === 0 ? <p className="drawer-empty">{marketArchiveTab === "all" ? "市场会在出现后保留在这里。" : "连接钱包并下注后，这里会显示你的市场。"}</p> : (marketArchiveTab === "all" ? markets : myMarkets).map((market) => <article className="archive-market" key={market.id.toString()}><div><span className={`history-dot history-dot-${market.status}`} /> <small>#{market.id.toString()} · {statusText(market.status)}{market.status === 2 ? ` · ${outcomeText(market.outcome)}` : ""}</small><h4>{market.question}</h4></div><p><span>奖池 YES {formatUsdc(market.yesPool)} · NO {formatUsdc(market.noPool)}</span>{marketArchiveTab === "mine" && <strong>我的：YES {formatUsdc(market.yesStake)} · NO {formatUsdc(market.noStake)}</strong>}</p></article>)}</div>
    </aside>
  </main>;
}
