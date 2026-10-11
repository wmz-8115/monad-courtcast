import { encodeFunctionData, isHash, type Address, type Hash } from "viem";

import { requireMockUsdcAddress, requirePredictionMarketAddress } from "../contracts/deployment.js";
import { mockUsdcAbi, predictionMarketAbi } from "../contracts/pointPulseAbi.js";
import { getBrowserWallet } from "../wallet/provider.js";
import { monadPublicClient } from "./publicClient.js";

async function send(from: Address, to: Address, data: `0x${string}`): Promise<Hash> {
  const hash = await getBrowserWallet().request({
    method: "eth_sendTransaction",
    params: [{ from, to, data }],
  });
  if (typeof hash !== "string" || !isHash(hash)) throw new Error("钱包没有返回有效交易哈希。");
  return hash;
}

export async function claimFaucet(from: Address) {
  return send(from, requireMockUsdcAddress(), encodeFunctionData({ abi: mockUsdcAbi, functionName: "claimFaucet" }));
}

export async function mintDemoUsdc(from: Address, to: Address, amount: bigint) {
  return send(from, requireMockUsdcAddress(), encodeFunctionData({
    abi: mockUsdcAbi,
    functionName: "mint",
    args: [to, amount],
  }));
}

export async function approveMarket(from: Address, amount: bigint) {
  return send(from, requireMockUsdcAddress(), encodeFunctionData({
    abi: mockUsdcAbi,
    functionName: "approve",
    args: [requirePredictionMarketAddress(), amount],
  }));
}

export async function createMarket(from: Address, question: string, closeAt: bigint, resolveAt: bigint) {
  return send(from, requirePredictionMarketAddress(), encodeFunctionData({
    abi: predictionMarketAbi,
    functionName: "createMarket",
    args: [question, closeAt, resolveAt],
  }));
}

export async function placeBet(from: Address, marketId: bigint, side: 1 | 2, amount: bigint) {
  return send(from, requirePredictionMarketAddress(), encodeFunctionData({
    abi: predictionMarketAbi,
    functionName: "bet",
    args: [marketId, side, amount],
  }));
}

export async function freezeMarket(from: Address, marketId: bigint) {
  return send(from, requirePredictionMarketAddress(), encodeFunctionData({
    abi: predictionMarketAbi,
    functionName: "freezeMarket",
    args: [marketId],
  }));
}

export async function cancelMarket(from: Address, marketId: bigint) {
  return send(from, requirePredictionMarketAddress(), encodeFunctionData({
    abi: predictionMarketAbi,
    functionName: "cancelMarket",
    args: [marketId],
  }));
}

export async function resolveMarket(from: Address, marketId: bigint, outcome: 1 | 2) {
  return send(from, requirePredictionMarketAddress(), encodeFunctionData({
    abi: predictionMarketAbi,
    functionName: "resolveMarket",
    args: [marketId, outcome],
  }));
}

export async function claim(from: Address, marketId: bigint) {
  return send(from, requirePredictionMarketAddress(), encodeFunctionData({
    abi: predictionMarketAbi,
    functionName: "claim",
    args: [marketId],
  }));
}

export function waitForPointPulseTransaction(hash: Hash) {
  return monadPublicClient.waitForTransactionReceipt({ hash });
}
