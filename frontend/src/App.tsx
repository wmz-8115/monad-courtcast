import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { formatUnits, parseUnits, type Address, type Hash } from "viem";

import { getMockUsdcAccount, getPointPulseSnapshot, type MarketView } from "./chain/pointPulseReader.js";
import { approveMarket, claim, claimFaucet, placeBet, waitForPointPulseTransaction } from "./chain/pointPulseWriter.js";
import { monadTestnet } from "./contracts/deployment.js";
import { getOperatorSession, hasOperatorSessionApi, startOperatorSession } from "./operator/sessionApi.js";
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

const marketStackStorageKey = "courtcast-market-stack-position-v1";
const freezeNoticeDurationMs = 2_700;

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const marketLayerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number }>();
  const previousOpenMarketsRef = useRef<Map<string, MarketView>>(new Map());
  const frozenDismissalTimersRef = useRef<Record<string, number>>({});
  const [address, setAddress] = useState<Address>();
  const [usdcBalance, setUsdcBalance] = useState<bigint>();
  const [faucetClaimed, setFaucetClaimed] = useState(false);
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [marketArchiveOpen, setMarketArchiveOpen] = useState(false);
  const [marketArchiveTab, setMarketArchiveTab] = useState<"all" | "mine">("all");
  const [marketScale, setMarketScale] = useState(1);
  const [replayStarted, setReplayStarted] = useState(false);
  const [closingMarkets, setClosingMarkets] = useState<MarketView[]>([]);
  const [marketStackPosition, setMarketStackPosition] = useState<{ x: number; y: number } | undefined>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(marketStackStorageKey) ?? "null");
      if (typeof stored === "object" && stored !== null && "x" in stored && "y" in stored && typeof stored.x === "number" && typeof stored.y === "number") return stored as { x: number; y: number };
    } catch { /* First visit or malformed local preference. */ }
    return undefined;
  });
  const [notice, setNotice] = useState("市场数据正在同步…");
  const [busy, setBusy] = useState(false);
  const [betAmounts, setBetAmounts] = useState<Record<string, string>>({});
  const [claimedMarketIds, setClaimedMarketIds] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1_000));
  const videoUrl = (import.meta.env.VITE_REPLAY_VIDEO_URL as string | undefined)
    || "/replays/courtcast-zhengqinwen-2530-2737.mp4";

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
    const clockTimer = window.setInterval(() => setNow(Math.floor(Date.now() / 1_000)), 1_000);
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, replayStarted ? 2_000 : 5_000);
    return () => { unsubscribe(); window.clearInterval(clockTimer); window.clearInterval(refreshTimer); };
  }, [refresh, replayStarted]);

  useEffect(() => {
    try {
      if (marketStackPosition === undefined) localStorage.removeItem(marketStackStorageKey);
      else localStorage.setItem(marketStackStorageKey, JSON.stringify(marketStackPosition));
    } catch { /* Position persistence is an enhancement, not a requirement. */ }
  }, [marketStackPosition]);

  useEffect(() => () => Object.values(frozenDismissalTimersRef.current).forEach((timer) => window.clearTimeout(timer)), []);

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
    setReplayStarted(true);
    try {
      await videoRef.current?.play();
      if (!hasOperatorSessionApi()) {
        setNotice("视频已开始。当前没有连接私有运营服务，因此不会制造本地模拟市场。");
        return;
      }
      const session = await getOperatorSession();
      if (session?.active) { setNotice("本轮链上市场已在运行，正在同步真实市场数据。 "); return; }
      setBusy(true);
      if (session?.mode === "public-demo") {
        if (!session.canStart) throw new Error(session.retryAt === undefined ? "演示暂时不可重新开始。" : `上一轮刚结束，请在 ${new Date(session.retryAt * 1_000).toLocaleTimeString()} 后重试。`);
        setNotice("正在启动本轮真实链上演示，市场将按视频节奏出现。 ");
        await startOperatorSession(session);
      } else {
        const operatorAddress = address ?? await connectWallet();
        setAddress(operatorAddress);
        setNotice("请用管理钱包签名以启动本轮真实链上市场；此签名不会暴露私钥。 ");
        if (session === undefined) throw new Error("无法读取运营服务状态。");
        await startOperatorSession(session, operatorAddress);
      }
      setNotice("本轮链上市场已启动，市场会按视频节奏出现。 ");
      await refresh();
    } catch (error) {
      // The video still plays: ordinary visitors can join an already-running
      // session, but only the configured manager can start a new chain run.
      setNotice(error instanceof Error ? error.message.trim() : "浏览器阻止了播放或无法启动运营服务。");
    } finally {
      setBusy(false);
    }
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
    const current = new Map(liveMarkets.map((market) => [market.id.toString(), market]));
    for (const [marketId, market] of previousOpenMarketsRef.current) {
      if (current.has(marketId) || frozenDismissalTimersRef.current[marketId] !== undefined) continue;
      setClosingMarkets((items) => items.some((item) => item.id === market.id) ? items : [...items, market]);
      frozenDismissalTimersRef.current[marketId] = window.setTimeout(() => {
        setClosingMarkets((items) => items.filter((item) => item.id.toString() !== marketId));
        delete frozenDismissalTimersRef.current[marketId];
      }, freezeNoticeDurationMs);
    }
    previousOpenMarketsRef.current = current;
  }, [liveMarkets]);

  const featuredMarkets = useMemo(() => {
    const openIds = new Set(liveMarkets.map((market) => market.id.toString()));
    return [
      ...closingMarkets.filter((market) => !openIds.has(market.id.toString())).map((market) => ({ market, closing: true })),
      ...liveMarkets.map((market) => ({ market, closing: false })),
    ].sort((left, right) => Number(left.market.id - right.market.id));
  }, [closingMarkets, liveMarkets]);

  function beginMarketStackDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const layer = marketLayerRef.current;
    const stack = event.currentTarget.closest<HTMLElement>(".floating-market-stack");
    if (layer === null || stack === null) return;
    const layerRect = layer.getBoundingClientRect();
    const stackRect = stack.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - stackRect.left, offsetY: event.clientY - stackRect.top };
    setMarketStackPosition({ x: stackRect.left - layerRect.left, y: stackRect.top - layerRect.top });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveMarketStack(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const layer = marketLayerRef.current;
    if (drag === undefined || layer === null || event.pointerId !== drag.pointerId) return;
    const rect = layer.getBoundingClientRect();
    const x = Math.min(Math.max(8, event.clientX - rect.left - drag.offsetX), Math.max(8, rect.width - 280));
    const y = Math.min(Math.max(58, event.clientY - rect.top - drag.offsetY), Math.max(58, rect.height - 80));
    setMarketStackPosition({ x, y });
  }

  function endMarketStackDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = undefined;
  }

  const marketStackStyle = marketStackPosition === undefined ? undefined : {
    "--market-stack-x": `${marketStackPosition.x}px`,
    "--market-stack-y": `${marketStackPosition.y}px`,
  } as CSSProperties;

  return <main className="courtcast-app">
    <header className="courtcast-topbar">
      <a className="courtcast-brand" href="/" aria-label="CourtCast 首页"><span className="courtcast-logo" aria-hidden="true">CC</span><span><strong>CourtCast</strong><small>LIVE PREDICTION</small></span></a>
      <div className="courtcast-top-actions"><span className="testnet-badge">MONAD TESTNET</span><button className="market-archive-trigger" type="button" onClick={() => { setMarketArchiveTab("all"); setMarketArchiveOpen(true); }}><span aria-hidden="true">▤</span> 市场总览</button><button className="account-trigger" type="button" onClick={() => setAccountOpen(true)}><span className="account-trigger-icon" aria-hidden="true">◎</span><span>{address === undefined ? "连接钱包" : shortAddress(address)}</span>{claimableMarkets.length > 0 && <b aria-label={`${claimableMarkets.length} 个可领取市场`}>{claimableMarkets.length}</b>}</button></div>
    </header>

    <section className="cinema-stage" aria-label="CourtCast 沉浸式赛事直播"><div className="cinema-video-wrap">
      <video ref={videoRef} className="cinema-video" src={videoUrl} controls={replayStarted} playsInline onEnded={() => setReplayStarted(false)}>当前浏览器无法播放该视频。</video>
      {!replayStarted && <div className="replay-intro"><span className="replay-kicker">INTERACTIVE MATCH · ON-CHAIN</span><h1>每一分，都可以预测</h1><p>观看比赛，在关键时刻对场上即将发生的结果下注。</p><button type="button" onClick={() => void startReplay()}><span aria-hidden="true">▶</span>开始观看</button></div>}
      <div className="stage-status"><i /> LIVE <span>·</span> COURTCAST</div>
      <div className="market-scale-controls" aria-label="市场卡片大小"><button type="button" aria-label="缩小市场卡片" disabled={marketScale === 0} onClick={() => setMarketScale((scale) => Math.max(0, scale - 1))}>A−</button><button type="button" aria-label="放大市场卡片" disabled={marketScale === 2} onClick={() => setMarketScale((scale) => Math.min(2, scale + 1))}>A+</button></div>
      <div ref={marketLayerRef} className={`floating-market-layer market-scale-${marketScale}`} onPointerMove={moveMarketStack} onPointerUp={endMarketStackDrag} onPointerCancel={endMarketStackDrag}>
      {featuredMarkets.length > 0 && <div className={`floating-market-stack ${marketStackPosition === undefined ? "floating-market-stack-default" : "floating-market-stack-custom"}`} style={marketStackStyle}>
        <button className="market-drag-handle" type="button" aria-label="拖动市场卡片位置" title="拖动市场卡片位置" onPointerDown={beginMarketStackDrag}><span aria-hidden="true">⠿</span> 拖动</button>
      {featuredMarkets.map(({ market, closing }) => {
        const amount = betAmounts[market.id.toString()] ?? "";
        const pool = market.yesPool + market.noPool;
        const secondsLeft = Number(market.closeAt) - now;
        const urgent = !closing && secondsLeft > 0 && secondsLeft <= 5;
        return <article className={`floating-market ${closing ? "floating-market-freezing" : ""} ${urgent ? "floating-market-urgent" : ""}`} key={market.id.toString()}>
          <div className="floating-market-head"><span className={`market-state market-state-${closing ? 1 : market.status}`}>{closing ? "已冻结" : statusText(market.status)}</span><span>#{market.id.toString()} · {closing ? "收起中" : remainingText(market.closeAt, now)}</span></div>
          <h2>{market.question}</h2><div className="floating-odds"><span>YES <strong>{formatUsdc(market.yesPool)}</strong></span><span>NO <strong>{formatUsdc(market.noPool)}</strong></span></div>
          {closing ? <p className="market-freezing-note"><span aria-hidden="true">✓</span> 市场已冻结，等待结算</p> : <div className="floating-bet"><div className="floating-amount"><input aria-label={`市场 ${market.id.toString()} 下注金额`} value={amount} inputMode="decimal" placeholder="下注金额" onChange={(event) => setBetAmounts((values) => ({ ...values, [market.id.toString()]: event.target.value }))}/><span>mUSDC</span></div><div className="floating-bet-actions"><button type="button" disabled={busy} onClick={() => void handleBet(market, 1)}>YES <small>{estimateMultiplier(pool, market.yesPool, amount)}</small></button><button type="button" disabled={busy} onClick={() => void handleBet(market, 2)}>NO <small>{estimateMultiplier(pool, market.noPool, amount)}</small></button></div></div>}
        </article>;
      })}
      </div>}
      </div>
      {featuredMarkets.length === 0 && <div className="no-live-market"><span>◌</span> 等待真实链上市场</div>}
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
