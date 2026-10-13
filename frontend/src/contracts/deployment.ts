import { getAddress, isAddress, type Address } from "viem";

/** Monad Testnet settings used by the future wallet and RPC modules. */
export const monadTestnet = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadvision.com" },
  },
} as const;

/**
 * TimedGift learning contract deployed on Monad Testnet on 2026-09-21.
 * This is a testnet-only address: do not reuse it for a future mainnet release.
 */
export const timedGiftDeployment: {
  readonly chainId: typeof monadTestnet.id;
  readonly address: Address | undefined;
} = {
  chainId: monadTestnet.id,
  address: "0x25fd52bd5e8c6068332b72d480fc8873c2526389",
};

export function requireTimedGiftAddress(): Address {
  if (timedGiftDeployment.address === undefined) {
    throw new Error("TimedGift has not been deployed to Monad Testnet yet.");
  }

  return timedGiftDeployment.address;
}

type PointPulseDeployment = {
  readonly chainId: typeof monadTestnet.id;
  readonly mockUsdcAddress: Address | undefined;
  readonly predictionMarketAddress: Address | undefined;
};

const pointPulseDeploymentStorageKey = `pointpulse-deployment-${monadTestnet.id}`;

// This module is also imported by the private Node operator. Vite provides
// import.meta.env in the browser build, while Node exposes no `env` member.
const viteEnv = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
const configuredMockUsdcAddress = typeof viteEnv?.VITE_MUSDC_ADDRESS === "string" ? viteEnv.VITE_MUSDC_ADDRESS : undefined;
const configuredPredictionMarketAddress = typeof viteEnv?.VITE_MARKET_ADDRESS === "string" ? viteEnv.VITE_MARKET_ADDRESS : undefined;

function deploymentAddress(value: string | undefined, fallback: Address, label: string): Address {
  const candidate = value?.trim() || fallback;
  if (!isAddress(candidate)) throw new Error(`${label} 不是有效的 EVM 合约地址。`);
  return getAddress(candidate);
}

/**
 * Public Monad Testnet deployment used by visitors and fresh clones. These are
 * public contract addresses, not secrets. A self-hosted deployment can replace
 * them through VITE_MUSDC_ADDRESS and VITE_MARKET_ADDRESS.
 */
export const pointPulseDeployment: {
  readonly chainId: typeof monadTestnet.id;
  readonly mockUsdcAddress: Address | undefined;
  readonly predictionMarketAddress: Address | undefined;
} = {
  chainId: monadTestnet.id,
  mockUsdcAddress: deploymentAddress(
    configuredMockUsdcAddress,
    "0xE26c912bA6088cb10465c4D92a1425D8eBFC413b",
    "VITE_MUSDC_ADDRESS",
  ),
  predictionMarketAddress: deploymentAddress(
    configuredPredictionMarketAddress,
    "0x1C40571CBDA4313092f0a41B15ad2Aa9B10B1970",
    "VITE_MARKET_ADDRESS",
  ),
};

function getBrowserSavedDeployment(): PointPulseDeployment | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(pointPulseDeploymentStorageKey) ?? "null");
    if (typeof value !== "object" || value === null) return undefined;

    const { mockUsdcAddress, predictionMarketAddress } = value as Record<string, unknown>;
    if (typeof mockUsdcAddress !== "string" || typeof predictionMarketAddress !== "string") return undefined;
    if (!isAddress(mockUsdcAddress) || !isAddress(predictionMarketAddress)) return undefined;

    return {
      chainId: monadTestnet.id,
      mockUsdcAddress: getAddress(mockUsdcAddress),
      predictionMarketAddress: getAddress(predictionMarketAddress),
    };
  } catch {
    return undefined;
  }
}

export function getPointPulseDeployment(): PointPulseDeployment {
  return getBrowserSavedDeployment() ?? pointPulseDeployment;
}

export function isPointPulseDeployed(): boolean {
  const deployment = getPointPulseDeployment();
  return deployment.mockUsdcAddress !== undefined && deployment.predictionMarketAddress !== undefined;
}

/** Stores only public contract addresses. No wallet secret is ever persisted by the app. */
export function savePointPulseDeployment(mockUsdcAddress: Address, predictionMarketAddress: Address): void {
  if (typeof window === "undefined") throw new Error("只能在浏览器钱包中保存部署地址。");

  window.localStorage.setItem(pointPulseDeploymentStorageKey, JSON.stringify({
    mockUsdcAddress,
    predictionMarketAddress,
  }));
}

export function requireMockUsdcAddress(): Address {
  const { mockUsdcAddress } = getPointPulseDeployment();
  if (mockUsdcAddress === undefined) {
    throw new Error("MockUSDC has not been deployed to Monad Testnet yet.");
  }
  return mockUsdcAddress;
}

export function requirePredictionMarketAddress(): Address {
  const { predictionMarketAddress } = getPointPulseDeployment();
  if (predictionMarketAddress === undefined) {
    throw new Error("PredictionMarket has not been deployed to Monad Testnet yet.");
  }
  return predictionMarketAddress;
}
