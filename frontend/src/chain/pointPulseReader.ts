import type { Address } from "viem";

import { requireMockUsdcAddress, requirePredictionMarketAddress } from "../contracts/deployment.js";
import { mockUsdcAbi, predictionMarketAbi } from "../contracts/pointPulseAbi.js";
import { monadPublicClient } from "./publicClient.js";

const envioGraphqlUrl = (import.meta.env.VITE_ENVIO_GRAPHQL_URL as string | undefined)?.trim()
  || "https://indexer.dev.hyperindex.xyz/91d7d5d/v1/graphql";

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

function asBigInt(value: unknown, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  throw new Error(`Envio 返回的 ${label} 不是整数。`);
}

function envioState(value: unknown): number {
  switch (value) {
    case "OPEN": return 0;
    case "FROZEN": return 1;
    case "RESOLVED": return 2;
    case "CANCELLED": return 3;
    default: throw new Error(`Envio 返回了未知市场状态：${String(value)}`);
  }
}

function envioOutcome(value: unknown): number {
  if (value === null || value === undefined || value === "UNRESOLVED") return 0;
  if (value === "YES") return 1;
  if (value === "NO") return 2;
  throw new Error(`Envio 返回了未知市场结果：${String(value)}`);
}

type EnvioMarket = {
  id: string;
  marketId: string;
  creator: string;
  question: string;
  closeAt: string;
  resolveAt: string;
  state: string;
  outcome: string | null;
  yesPool: string;
  noPool: string;
};

async function fetchEnvioMarkets(): Promise<EnvioMarket[]> {
  const response = await fetch(envioGraphqlUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `query CourtCastMarkets {
        Market(order_by: { updatedAt: desc }, limit: 50) {
          id marketId creator question closeAt resolveAt state outcome yesPool noPool
        }
      }`,
    }),
  });
  if (!response.ok) throw new Error(`Envio 请求失败（HTTP ${response.status}）。`);
  const payload = await response.json() as { data?: { Market?: EnvioMarket[] }; errors?: Array<{ message?: string }> };
  if (payload.errors?.length) throw new Error(payload.errors[0]?.message || "Envio GraphQL 查询失败。");
  if (!Array.isArray(payload.data?.Market)) throw new Error("Envio 返回中缺少 Market 数据。");
  return payload.data.Market;
}

export async function getPointPulseSnapshot(viewer?: Address) {
  const marketAddress = requirePredictionMarketAddress();
  const rawOracle = await monadPublicClient.readContract({ address: marketAddress, abi: predictionMarketAbi, functionName: "oracle" });
  const oracle = expectAddress(rawOracle, "oracle");

  let indexedMarkets: EnvioMarket[] | undefined;
  try {
    indexedMarkets = await fetchEnvioMarkets();
  } catch {
    // The RPC path remains available while Envio is restarting or rate-limited.
  }

  const markets = indexedMarkets
    ? await Promise.all(indexedMarkets.map(async (indexedMarket) => {
      const id = asBigInt(indexedMarket.marketId, "marketId");
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
        question: indexedMarket.question,
        creator: expectAddress(indexedMarket.creator, "market.creator"),
        closeAt: asBigInt(indexedMarket.closeAt, "closeAt"),
        resolveAt: asBigInt(indexedMarket.resolveAt, "resolveAt"),
        status: envioState(indexedMarket.state),
        outcome: envioOutcome(indexedMarket.outcome),
        yesPool: asBigInt(indexedMarket.yesPool, "yesPool"),
        noPool: asBigInt(indexedMarket.noPool, "noPool"),
        yesStake: position[0],
        noStake: position[1],
      } satisfies MarketView;
    }))
    : await readMarketsFromRpc(marketAddress, viewer);
  return { oracle, markets: [...markets].reverse() };
}

async function readMarketsFromRpc(marketAddress: Address, viewer?: Address): Promise<MarketView[]> {
  const rawMarketCount = await monadPublicClient.readContract({ address: marketAddress, abi: predictionMarketAbi, functionName: "marketCount" });
  const total = Math.min(Number(expectBigInt(rawMarketCount, "marketCount")), 50);
  return Promise.all(Array.from({ length: total }, async (_, index) => {
    const id = BigInt(index);
    const market = expectMarket(await monadPublicClient.readContract({ address: marketAddress, abi: predictionMarketAbi, functionName: "getMarket", args: [id] }));
    const position = viewer === undefined ? [0n, 0n] as const : expectPosition(await monadPublicClient.readContract({ address: marketAddress, abi: predictionMarketAbi, functionName: "getUserPosition", args: [id, viewer] }));
    return { id, ...market, yesStake: position[0], noStake: position[1] } satisfies MarketView;
  }));
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
