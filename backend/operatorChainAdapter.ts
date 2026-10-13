import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  isAddress,
  maxUint256,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { OperatorChainAdapter } from "../engine/demoOperator.js";
import type { DemoOutcome } from "../engine/prerecordedScenario.js";
import { monadTestnet } from "../frontend/src/contracts/deployment.js";
import { mockUsdcAbi, predictionMarketAbi } from "../frontend/src/contracts/pointPulseAbi.js";

export type OperatorRuntimeConfig = {
  privateKey: Hex;
  mockUsdcAddress: Address;
  predictionMarketAddress: Address;
  rpcUrl: string;
};

function requireAddress(value: string | undefined, name: string): Address {
  if (value === undefined || !isAddress(value)) throw new Error(`${name} 必须是有效的 0x 地址。`);
  return value;
}

/** Reads secrets only from the local process environment, never from the UI. */
export function readOperatorRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): OperatorRuntimeConfig {
  const privateKey = environment.POINTPULSE_OPERATOR_PRIVATE_KEY;
  if (privateKey === undefined || !/^0x[\da-fA-F]{64}$/.test(privateKey)) {
    throw new Error("请在本机设置 POINTPULSE_OPERATOR_PRIVATE_KEY（64 位十六进制私钥）。");
  }

  return {
    privateKey: privateKey as Hex,
    mockUsdcAddress: requireAddress(environment.POINTPULSE_MUSDC_ADDRESS, "POINTPULSE_MUSDC_ADDRESS"),
    predictionMarketAddress: requireAddress(environment.POINTPULSE_MARKET_ADDRESS, "POINTPULSE_MARKET_ADDRESS"),
    rpcUrl: environment.POINTPULSE_RPC_URL ?? monadTestnet.rpcUrls.default.http[0],
  };
}

function sideToContractOutcome(side: DemoOutcome): 1 | 2 {
  return side === "YES" ? 1 : 2;
}

/** A real Monad Testnet adapter used only by the local, explicitly started worker. */
export class MonadOperatorChainAdapter implements OperatorChainAdapter {
  readonly account;
  readonly #publicClient;
  readonly #walletClient;
  readonly #config;
  #approved = false;

  constructor(config: OperatorRuntimeConfig) {
    this.#config = config;
    this.account = privateKeyToAccount(config.privateKey);
    this.#publicClient = createPublicClient({ chain: monadTestnet, transport: http(config.rpcUrl) });
    this.#walletClient = createWalletClient({
      account: this.account,
      chain: monadTestnet,
      transport: http(config.rpcUrl),
    });
  }

  /**
   * Tops the testnet operator up to a target balance without minting again on
   * every service restart. MockUSDC only permits its owner to call mint().
   */
  async ensureMinimumBalance(targetMusdc: number): Promise<bigint> {
    if (!Number.isSafeInteger(targetMusdc) || targetMusdc < 0) {
      throw new Error("运营账号 mUSDC 目标余额必须是非负整数。");
    }
    const target = BigInt(targetMusdc) * 1_000_000n;
    const [owner, balance] = await Promise.all([
      this.#publicClient.readContract({
        address: this.#config.mockUsdcAddress,
        abi: mockUsdcAbi,
        functionName: "owner",
      }),
      this.#publicClient.readContract({
        address: this.#config.mockUsdcAddress,
        abi: mockUsdcAbi,
        functionName: "balanceOf",
        args: [this.account.address],
      }),
    ]);
    if (typeof owner !== "string" || owner.toLowerCase() !== this.account.address.toLowerCase()) {
      throw new Error(`运营账号 ${this.account.address} 不是 mUSDC 合约所有者，无法铸造测试币。`);
    }
    if (typeof balance !== "bigint") throw new Error("无法读取运营账号 mUSDC 余额。");
    if (balance >= target) return balance;

    const hash = await this.#walletClient.writeContract({
      address: this.#config.mockUsdcAddress,
      abi: mockUsdcAbi,
      functionName: "mint",
      args: [this.account.address, target - balance],
    });
    await this.#waitForSuccess(hash);
    return target;
  }

  async createMarket(question: string, closeAt: number, resolveAt: number): Promise<bigint> {
    const hash = await this.#walletClient.writeContract({
      address: this.#config.predictionMarketAddress,
      abi: predictionMarketAbi,
      functionName: "createMarket",
      args: [question, BigInt(closeAt), BigInt(resolveAt)],
    });
    const receipt = await this.#waitForSuccess(hash);
    const createdLog = receipt.logs.find((log) => log.address.toLowerCase() === this.#config.predictionMarketAddress.toLowerCase());
    if (createdLog === undefined) throw new Error("创建交易中没有找到 MarketCreated 事件。");

    const decoded = decodeEventLog({ abi: predictionMarketAbi, data: createdLog.data, topics: createdLog.topics });
    const eventArgs: unknown = decoded.args;
    if (
      decoded.eventName !== "MarketCreated"
      || typeof eventArgs !== "object"
      || eventArgs === null
      || !("marketId" in eventArgs)
      || typeof eventArgs.marketId !== "bigint"
    ) {
      throw new Error("无法从创建交易读取 marketId。");
    }
    return eventArgs.marketId;
  }

  async placeBet(marketId: bigint, side: DemoOutcome, amountMusdc: number): Promise<boolean> {
    const amount = BigInt(amountMusdc) * 1_000_000n;
    await this.#ensureApproval();
    const balance = await this.#publicClient.readContract({
      address: this.#config.mockUsdcAddress,
      abi: mockUsdcAbi,
      functionName: "balanceOf",
      args: [this.account.address],
    });
    if (typeof balance !== "bigint" || balance < amount) {
      return false;
    }

    const hash = await this.#walletClient.writeContract({
      address: this.#config.predictionMarketAddress,
      abi: predictionMarketAbi,
      functionName: "bet",
      args: [marketId, sideToContractOutcome(side), amount],
    });
    await this.#waitForSuccess(hash);
    return true;
  }

  async freezeMarket(marketId: bigint): Promise<void> {
    const hash = await this.#walletClient.writeContract({
      address: this.#config.predictionMarketAddress,
      abi: predictionMarketAbi,
      functionName: "freezeMarket",
      args: [marketId],
    });
    await this.#waitForSuccess(hash);
  }

  async resolveMarket(marketId: bigint, outcome: DemoOutcome): Promise<void> {
    const hash = await this.#walletClient.writeContract({
      address: this.#config.predictionMarketAddress,
      abi: predictionMarketAbi,
      functionName: "resolveMarket",
      args: [marketId, sideToContractOutcome(outcome)],
    });
    await this.#waitForSuccess(hash);
  }

  async cancelMarket(marketId: bigint): Promise<void> {
    const hash = await this.#walletClient.writeContract({
      address: this.#config.predictionMarketAddress,
      abi: predictionMarketAbi,
      functionName: "cancelMarket",
      args: [marketId],
    });
    await this.#waitForSuccess(hash);
  }

  async claim(marketId: bigint): Promise<boolean> {
    const position = await this.#publicClient.readContract({
      address: this.#config.predictionMarketAddress,
      abi: predictionMarketAbi,
      functionName: "getUserPosition",
      args: [marketId, this.account.address],
    });
    if (!Array.isArray(position) || typeof position[0] !== "bigint" || typeof position[1] !== "bigint") {
      throw new Error("无法读取运营账号的演示仓位。");
    }
    if (position[0] + position[1] === 0n) return false;

    const hash = await this.#walletClient.writeContract({
      address: this.#config.predictionMarketAddress,
      abi: predictionMarketAbi,
      functionName: "claim",
      args: [marketId],
    });
    await this.#waitForSuccess(hash);
    return true;
  }

  async #ensureApproval(): Promise<void> {
    if (this.#approved) return;
    const allowance = await this.#publicClient.readContract({
      address: this.#config.mockUsdcAddress,
      abi: mockUsdcAbi,
      functionName: "allowance",
      args: [this.account.address, this.#config.predictionMarketAddress],
    });
    if (typeof allowance === "bigint" && allowance > 1_000_000_000n) {
      this.#approved = true;
      return;
    }

    const hash = await this.#walletClient.writeContract({
      address: this.#config.mockUsdcAddress,
      abi: mockUsdcAbi,
      functionName: "approve",
      args: [this.#config.predictionMarketAddress, maxUint256],
    });
    await this.#waitForSuccess(hash);
    this.#approved = true;
  }

  async #waitForSuccess(hash: Hex) {
    const receipt = await this.#publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`运营交易失败：${hash}`);
    return receipt;
  }
}
