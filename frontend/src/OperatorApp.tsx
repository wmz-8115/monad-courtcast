import { useCallback, useEffect, useState } from "react";
import { formatUnits, parseUnits, type Address, type Hash } from "viem";

import { getMockUsdcAccount, getPointPulseSnapshot, type MarketView } from "./chain/pointPulseReader.js";
import { deployPointPulse } from "./chain/pointPulseDeployer.js";
import { cancelMarket, createMarket, freezeMarket, mintDemoUsdc, resolveMarket, waitForPointPulseTransaction } from "./chain/pointPulseWriter.js";
import { getPointPulseDeployment, isPointPulseDeployed, monadTestnet } from "./contracts/deployment.js";
import { connectWallet, ensureMonadTestnet, getConnectedAddress, getWalletChainId } from "./wallet/walletSession.js";

function shortAddress(address: Address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatUsdc(amount: bigint) {
  const value = formatUnits(amount, 6);
  const [whole, fraction = ""] = value.split(".");
  return fraction.length === 0 ? whole : `${whole}.${fraction.slice(0, 2)}`;
}

function formatTime(timestamp: bigint) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false,
  }).format(new Date(Number(timestamp) * 1_000));
}

function statusText(status: number) {
  return ["下注中", "已冻结", "已结算", "退款中"][status] ?? "未知状态";
}

const testMarketQuestions = [
  "下一次发球会是 ACE 吗？",
  "这一分会出现双误吗？",
  "接下来两拍内会出现非受迫失误吗？",
  "本局发球方能保发吗？",
  "下一分会由接发方获胜吗？",
];

/** Operations view. It exposes privileged controls only to the deployed Oracle/creator. */
export function OperatorApp() {
  const [address, setAddress] = useState<Address>();
  const [oracle, setOracle] = useState<Address>();
  const [balance, setBalance] = useState<bigint>();
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [notice, setNotice] = useState("请连接运营钱包。");
  const [busy, setBusy] = useState(false);
  const [isDeployed, setIsDeployed] = useState(() => isPointPulseDeployed());
  const [testQuestion, setTestQuestion] = useState(testMarketQuestions[0]);
  const [testWindowSeconds, setTestWindowSeconds] = useState(60);

  const refresh = useCallback(async () => {
    try {
      const connected = await getConnectedAddress();
      if (connected === undefined) {
        setAddress(undefined);
        setBalance(undefined);
        return;
      }
      setAddress(connected);
      const chainId = await getWalletChainId();
      if (chainId !== monadTestnet.id) {
        setNotice("请在 MetaMask 切换到 Monad Testnet。");
        return;
      }
      const deployed = isPointPulseDeployed();
      setIsDeployed(deployed);
      if (!deployed) return;

      const [account, snapshot] = await Promise.all([
        getMockUsdcAccount(connected),
        getPointPulseSnapshot(connected),
      ]);
      setBalance(account.balance);
      setOracle(snapshot.oracle);
      setMarkets(snapshot.markets);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法读取运营状态。");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function connect() {
    try {
      await connectWallet();
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "连接钱包失败。");
    }
  }

  async function deploy() {
    if (address === undefined) return;
    try {
      setBusy(true);
      await ensureMonadTestnet();
      const deployment = await deployPointPulse(address, setNotice);
      setNotice(`V2 部署完成：mUSDC ${shortAddress(deployment.mockUsdcAddress)}；市场 ${shortAddress(deployment.predictionMarketAddress)}。`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "部署未完成。");
    } finally {
      setBusy(false);
    }
  }

  async function submit(label: string, write: (from: Address) => Promise<Hash>) {
    if (address === undefined) {
      setNotice("请先连接运营钱包。");
      return;
    }
    try {
      setBusy(true);
      setNotice(`请在 MetaMask 确认：${label}。`);
      const hash = await write(address);
      await waitForPointPulseTransaction(hash);
      setNotice(`${label}成功，已刷新链上状态。`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `${label}未完成。`);
    } finally {
      setBusy(false);
    }
  }

  function chooseRandomQuestion() {
    const candidates = testMarketQuestions.filter((question) => question !== testQuestion);
    setTestQuestion(candidates[Math.floor(Math.random() * candidates.length)] ?? testMarketQuestions[0]);
  }

  async function createTestMarket() {
    const question = testQuestion.trim();
    if (question.length === 0) {
      setNotice("请先填写预测问题。");
      return;
    }
    const now = Math.floor(Date.now() / 1_000);
    const closeAt = BigInt(now + testWindowSeconds);
    const resolveAt = BigInt(now + testWindowSeconds + 30);
    await submit(`创建 ${testWindowSeconds} 秒测试市场`, (from) => createMarket(from, question, closeAt, resolveAt));
  }

  const isOracle = address !== undefined && oracle !== undefined && address.toLowerCase() === oracle.toLowerCase();

  return (
    <main className="app-shell pointpulse-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark" aria-hidden="true">◉</div><strong>CourtCast Markets · 运营后台</strong><span className="network-pill">◇ Monad Testnet</span></div>
        <div className="wallet-summary"><a className="page-link" href="/">交易页</a><button className="wallet-button" type="button" onClick={() => void connect()}>{address === undefined ? "连接运营钱包" : "刷新"}</button></div>
      </header>
      <section className="warning-banner" role="note"><span>⚠</span> 仅限演示。撤回会让所有已下注用户可领取原始下注退款。</section>
      <p className="notice">{notice}</p>

      {!isDeployed && <section className="deployment-card"><div><strong>尚未部署 V2 合约</strong><p>使用运营账号部署后，该账号会成为 Oracle 和市场创建者，才能撤回自动创建的市场。</p></div><button className="primary-button deploy-button" disabled={busy || address === undefined} onClick={() => void deploy()}>部署 V2 合约</button></section>}

      {isDeployed && <section className="dashboard-grid operator-grid">
        <section className="card"><h1>运营资金与自动演示</h1><p className="operator-copy">运营账户：{address === undefined ? "未连接" : shortAddress(address)}<br />mUSDC：{balance === undefined ? "…" : formatUsdc(balance)}<br />Oracle：{oracle === undefined ? "…" : shortAddress(oracle)}{isOracle ? "（当前账号）" : ""}</p><button className="secondary-button" type="button" disabled={busy || !isOracle || address === undefined} onClick={() => void submit("铸造 10,000 mUSDC 运营资金", (from) => mintDemoUsdc(from, from, parseUnits("10000", 6)))}>给运营账号铸造 10,000 mUSDC</button><p className="preview-note">启动自动录播演示前，还需在本机 PowerShell 配置运营密钥并运行 <code>operator:demo</code>。该服务每笔操作都会真实上链。</p></section>
        <section className="card"><h2>预编排演示规则</h2><ol className="steps"><li><span>1</span><div><strong>提前发布</strong><p>每个市场会在对应回放时点前 8 秒创建。</p></div></li><li><span>2</span><div><strong>自动对手方</strong><p>运营账号约每 3 秒下注一次，每次 20–50 mUSDC。</p></div></li><li><span>3</span><div><strong>冻结、结算或撤回</strong><p>预设结果自动结算；运营者也可在未结算时撤回退款。</p></div></li></ol></section>
      </section>}

      {isDeployed && <section className="card manual-market-card">
        <div className="card-title"><div className="title-icon" aria-hidden="true">✦</div><div><h2>创建测试市场</h2><p>用当前运营钱包发布一条真实的 Monad Testnet 市场；到时后由你自主冻结、结算或撤回。</p></div></div>
        <label>预测问题<input value={testQuestion} maxLength={160} disabled={busy || !isOracle} onChange={(event) => setTestQuestion(event.target.value)} placeholder="例如：下一次发球会是 ACE 吗？" /></label>
        <div className="manual-market-actions"><label>下注窗口<select value={testWindowSeconds} disabled={busy || !isOracle} onChange={(event) => setTestWindowSeconds(Number(event.target.value))}><option value={30}>30 秒</option><option value={60}>60 秒</option></select></label><button className="text-button" type="button" disabled={busy || !isOracle} onClick={chooseRandomQuestion}>随机生成问题</button><button className="primary-button manual-create-button" type="button" disabled={busy || !isOracle || address === undefined} onClick={() => void createTestMarket()}>创建并在 MetaMask 确认</button></div>
        {!isOracle && <p className="preview-note">请连接部署该合约的运营钱包；只有 Oracle 才能在这里创建和管理演示市场。</p>}
      </section>}

      <section className="markets-section"><div className="section-heading"><div><h2>链上市场管理</h2><p>只有市场创建者可撤回；只有 Oracle 可提交结果。</p></div><button className="wallet-button" type="button" onClick={() => void refresh()}>刷新</button></div>{markets.length === 0 ? <div className="empty-state"><span>◌</span><strong>暂无 V2 市场</strong><p>可使用上方“创建测试市场”，或启动本地运营演示服务自动发布。</p></div> : <div className="market-list">{markets.map((market) => {
        const isCreator = address !== undefined && market.creator.toLowerCase() === address.toLowerCase();
        return <article className="market-card" key={market.id.toString()}><div className="market-card-top"><span className={`status status-${market.status}`}>{statusText(market.status)}</span><span className="market-id">#{market.id.toString()}</span></div><h3>{market.question}</h3><p className="market-meta">截止：{formatTime(market.closeAt)}<br />结算：{formatTime(market.resolveAt)}<br />总奖池：{formatUsdc(market.yesPool + market.noPool)} mUSDC</p>{(market.status === 0 || market.status === 1) && isCreator && <button className="cancel-button" type="button" disabled={busy} onClick={() => void submit("撤回市场并开放退款", (from) => cancelMarket(from, market.id))}>撤回市场并退款</button>}{market.status === 0 && <button className="text-button" type="button" disabled={busy} onClick={() => void submit("冻结市场", (from) => freezeMarket(from, market.id))}>到时后冻结市场</button>}{market.status === 1 && isOracle && <div className="resolution-controls"><span>提交结果：</span><button className="yes-button" type="button" disabled={busy} onClick={() => void submit("结算为 YES", (from) => resolveMarket(from, market.id, 1))}>YES</button><button className="no-button" type="button" disabled={busy} onClick={() => void submit("结算为 NO", (from) => resolveMarket(from, market.id, 2))}>NO</button></div>}</article>;
      })}</div>}</section>
    </main>
  );
}
