import type { Address } from "viem";

import { requireMockUsdcAddress, requirePredictionMarketAddress } from "../contracts/deployment.js";
import { mockUsdcAbi, predictionMarketAbi } from "../contracts/pointPulseAbi.js";
import { monadPublicClient } from "./publicClient.js";

export type MarketView = {
  id: bigint;
  question: string;
  creator: Address;
  closeAt: bigint;
  resolveAt: bigint;
  status: number;
  outcome: number;
  yesPool: bigint;
  noPool: bigint;
  yesStake: bigint;
  noStake: bigint;
};

type RawMarket = Omit<MarketView, "id" | "yesStake" | "noStake"> & {
  status: number;
  outcome: number;
};

function expectBigInt(value: unknown, label: string): bigint {
  if (typeof value !== "bigint") throw new Error(`链上读取 ${label} 的类型不正确。`);
  return value;
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`链上读取 ${label} 的类型不正确。`);
  return value;
}

function expectSmallUnsignedInteger(value: unknown, label: string): number {
  const numberValue = typeof value === "bigint" ? Number(value) : value;
  if (
    typeof numberValue !== "number" ||
    !Number.isSafeInteger(numberValue) ||
    numberValue < 0
  ) {
    throw new Error(`链上读取 ${label} 的类型不正确。`);
  }
  return numberValue;
}

function expectAddress(value: unknown, label: string): Address {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`链上读取 ${label} 的地址不正确。`);
  }
  return value as Address;
}

function expectMarket(value: unknown): RawMarket {
  if (typeof value !== "object" || value === null) throw new Error("链上读取 market 的类型不正确。");
  const market = value as Record<string, unknown>;
  if (typeof market.question !== "string") throw new Error("链上读取 market.question 的类型不正确。");
  return {
    question: market.question,
    creator: expectAddress(market.creator, "market.creator"),
    closeAt: expectBigInt(market.closeAt, "market.closeAt"),
    resolveAt: expectBigInt(market.resolveAt, "market.resolveAt"),
    status: expectSmallUnsignedInteger(market.status, "market.status"),
    outcome: expectSmallUnsignedInteger(market.outcome, "market.outcome"),
    yesPool: expectBigInt(market.yesPool, "market.yesPool"),
    noPool: expectBigInt(market.noPool, "market.noPool"),
  };
}

function expectPosition(value: unknown): readonly [bigint, bigint] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error("链上读取用户仓位的类型不正确。");
  }
  return [expectBigInt(value[0], "yesStake"), expectBigInt(value[1], "noStake")];
}

export async function getPointPulseSnapshot(viewer?: Address) {
  const marketAddress = requirePredictionMarketAddress();
  const [rawMarketCount, rawOracle] = await Promise.all([
    monadPublicClient.readContract({ address: marketAddress, abi: predictionMarketAbi, functionName: "marketCount" }),
    monadPublicClient.readContract({ address: marketAddress, abi: predictionMarketAbi, functionName: "oracle" }),
  ]);
  const marketCount = expectBigInt(rawMarketCount, "marketCount");
  const oracle = expectAddress(rawOracle, "oracle");
  const total = Math.min(Number(marketCount), 50);
  const markets = await Promise.all(
    Array.from({ length: total }, async (_, index) => {
      const id = BigInt(index);
      const rawMarket = await monadPublicClient.readContract({
        address: marketAddress,
        abi: predictionMarketAbi,
        functionName: "getMarket",
        args: [id],
      });
      const market = expectMarket(rawMarket);
      const position = viewer === undefined
        ? [0n, 0n] as const
        : expectPosition(await monadPublicClient.readContract({
            address: marketAddress,
            abi: predictionMarketAbi,
            functionName: "getUserPosition",
            args: [id, viewer],
          }));
      return {
        id,
        question: market.question,
        creator: market.creator,
        closeAt: market.closeAt,
        resolveAt: market.resolveAt,
        status: market.status,
        outcome: market.outcome,
        yesPool: market.yesPool,
        noPool: market.noPool,
        yesStake: position[0],
        noStake: position[1],
      } satisfies MarketView;
    }),
  );
  return { oracle, markets: [...markets].reverse() };
}

export async function getMockUsdcAccount(account: Address) {
  const tokenAddress = requireMockUsdcAddress();
  const [rawBalance, rawFaucetClaimed] = await Promise.all([
    monadPublicClient.readContract({ address: tokenAddress, abi: mockUsdcAbi, functionName: "balanceOf", args: [account] }),
    monadPublicClient.readContract({ address: tokenAddress, abi: mockUsdcAbi, functionName: "faucetClaimed", args: [account] }),
  ]);
  return {
    balance: expectBigInt(rawBalance, "mUSDC 余额"),
    faucetClaimed: expectBoolean(rawFaucetClaimed, "水龙头领取状态"),
  };
}
