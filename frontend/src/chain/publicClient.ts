import { createPublicClient, http } from "viem";

import { monadTestnet } from "../contracts/deployment.js";

/**
 * The app's read-only connection to Monad Testnet.
 * It can query public blockchain data but cannot sign or send a user transaction.
 */
export const monadPublicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(monadTestnet.rpcUrls.default.http[0]),
});
