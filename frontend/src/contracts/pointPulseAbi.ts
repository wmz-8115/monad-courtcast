import type { Abi } from "viem";

/** Public interfaces compiled from MockUSDC.sol and PredictionMarket.sol. */
export const mockUsdcAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "faucetClaimed", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "claimFaucet", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const satisfies Abi;

export const predictionMarketAbi = [
  { type: "function", name: "oracle", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "marketCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function",
    name: "createMarket",
    stateMutability: "nonpayable",
    inputs: [{ name: "question", type: "string" }, { name: "closeAt", type: "uint64" }, { name: "resolveAt", type: "uint64" }],
    outputs: [{ name: "marketId", type: "uint256" }],
  },
  {
    type: "function",
    name: "bet",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }, { name: "side", type: "uint8" }, { name: "amount", type: "uint256" }],
    outputs: [],
  },
  { type: "function", name: "freezeMarket", stateMutability: "nonpayable", inputs: [{ name: "marketId", type: "uint256" }], outputs: [] },
  { type: "function", name: "cancelMarket", stateMutability: "nonpayable", inputs: [{ name: "marketId", type: "uint256" }], outputs: [] },
  { type: "function", name: "resolveMarket", stateMutability: "nonpayable", inputs: [{ name: "marketId", type: "uint256" }, { name: "outcome", type: "uint8" }], outputs: [] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "marketId", type: "uint256" }], outputs: [{ name: "payout", type: "uint256" }] },
  {
    type: "function",
    name: "getMarket",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "market", type: "tuple", components: [
      { name: "question", type: "string" }, { name: "creator", type: "address" }, { name: "closeAt", type: "uint64" }, { name: "resolveAt", type: "uint64" }, { name: "status", type: "uint8" }, { name: "outcome", type: "uint8" }, { name: "yesPool", type: "uint256" }, { name: "noPool", type: "uint256" }, { name: "remainingWinningStake", type: "uint256" }, { name: "remainingPayout", type: "uint256" },
    ] }],
  },
  {
    type: "function",
    name: "getUserPosition",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }, { name: "user", type: "address" }],
    outputs: [{ name: "yesStake", type: "uint256" }, { name: "noStake", type: "uint256" }],
  },
  {
    type: "event",
    name: "MarketCreated",
    anonymous: false,
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "question", type: "string", indexed: false },
      { name: "closeAt", type: "uint64", indexed: false },
      { name: "resolveAt", type: "uint64", indexed: false },
    ],
  },
] as const satisfies Abi;
