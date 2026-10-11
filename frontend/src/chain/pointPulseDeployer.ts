import { encodeDeployData, isAddress, isHash, type Address, type Hash, type Hex } from "viem";

import mockUsdcArtifact from "../../../artifacts/contracts/MockUSDC.sol/MockUSDC.json" with { type: "json" };
import predictionMarketArtifact from "../../../artifacts/contracts/PredictionMarket.sol/PredictionMarket.json" with { type: "json" };
import { savePointPulseDeployment } from "../contracts/deployment.js";
import { getBrowserWallet } from "../wallet/provider.js";
import { waitForPointPulseTransaction } from "./pointPulseWriter.js";

const predictionMarketConstructorAbi = [
  {
    type: "constructor",
    inputs: [
      { name: "settlementToken_", type: "address" },
      { name: "oracle_", type: "address" },
    ],
    stateMutability: "nonpayable",
  },
] as const;

export type PointPulseDeploymentResult = {
  mockUsdcAddress: Address;
  predictionMarketAddress: Address;
};

function creationBytecode(value: unknown, contractName: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error(`${contractName} 的编译字节码无效，请先重新构建前端。`);
  }
  return value as Hex;
}

function requireDeploymentAddress(address: Address | null | undefined, contractName: string): Address {
  if (address === null || address === undefined || !isAddress(address)) {
    throw new Error(`${contractName} 部署交易已确认，但回执中没有合约地址。`);
  }
  return address;
}

async function sendDeployment(from: Address, data: Hex): Promise<Hash> {
  const hash = await getBrowserWallet().request({
    method: "eth_sendTransaction",
    params: [{ from, data }],
  });
  if (typeof hash !== "string" || !isHash(hash)) {
    throw new Error("钱包没有返回有效的部署交易哈希。");
  }
  return hash;
}

/**
 * Deploys both contracts from the browser wallet. MetaMask signs each
 * transaction, so this flow never asks for or handles a private key.
 */
export async function deployPointPulse(
  from: Address,
  onProgress: (message: string) => void,
): Promise<PointPulseDeploymentResult> {
  onProgress("第一笔：请在 MetaMask 中确认部署 MockUSDC。");
  const mockHash = await sendDeployment(from, creationBytecode(mockUsdcArtifact.bytecode, "MockUSDC"));
  onProgress("MockUSDC 已提交，正在等待 Monad Testnet 确认。");
  const mockReceipt = await waitForPointPulseTransaction(mockHash);
  const mockUsdcAddress = requireDeploymentAddress(mockReceipt.contractAddress, "MockUSDC");

  onProgress("第二笔：请在 MetaMask 中确认部署 PredictionMarket（当前钱包将成为 Oracle）。");
  const marketData = encodeDeployData({
    abi: predictionMarketConstructorAbi,
    bytecode: creationBytecode(predictionMarketArtifact.bytecode, "PredictionMarket"),
    args: [mockUsdcAddress, from],
  });
  const marketHash = await sendDeployment(from, marketData);
  onProgress("PredictionMarket 已提交，正在等待 Monad Testnet 确认。");
  const marketReceipt = await waitForPointPulseTransaction(marketHash);
  const predictionMarketAddress = requireDeploymentAddress(marketReceipt.contractAddress, "PredictionMarket");

  savePointPulseDeployment(mockUsdcAddress, predictionMarketAddress);
  return { mockUsdcAddress, predictionMarketAddress };
}
