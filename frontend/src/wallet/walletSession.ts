import { getAddress, isAddress, type Address } from "viem";

import { monadTestnet } from "../contracts/deployment.js";
import { getBrowserWallet, type Eip1193Provider } from "./provider.js";

type WalletProviderError = { code?: number; message?: string };

let locallyRememberedAddress: Address | undefined;

const monadTestnetChainIdHex = `0x${monadTestnet.id.toString(16)}`;

function isProviderErrorWithCode(error: unknown, code: number): error is WalletProviderError {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function parseWalletAddress(accounts: unknown): Address {
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || !isAddress(accounts[0])) {
    throw new Error("The wallet did not return a valid account address.");
  }

  return getAddress(accounts[0]);
}

function parseChainId(value: unknown): number {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error("The wallet returned an invalid chain ID.");
  }

  return Number.parseInt(value, 16);
}

async function addMonadTestnet(provider: Eip1193Provider): Promise<void> {
  await provider.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: monadTestnetChainIdHex,
        chainName: monadTestnet.name,
        nativeCurrency: monadTestnet.nativeCurrency,
        rpcUrls: monadTestnet.rpcUrls.default.http,
        blockExplorerUrls: [monadTestnet.blockExplorers.default.url],
      },
    ],
  });
}

/** Requests wallet access only after a user explicitly presses Connect. */
export async function connectWallet(): Promise<Address> {
  const provider = getBrowserWallet();
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const address = parseWalletAddress(accounts);

  await ensureMonadTestnet(provider);
  locallyRememberedAddress = address;
  return address;
}

/** Reads already-authorized accounts without opening a MetaMask approval window. */
export async function getConnectedAddress(): Promise<Address | undefined> {
  const provider = getBrowserWallet();
  const accounts = await provider.request({ method: "eth_accounts" });

  if (!Array.isArray(accounts) || accounts.length === 0) {
    locallyRememberedAddress = undefined;
    return undefined;
  }

  const address = parseWalletAddress(accounts);
  locallyRememberedAddress = address;
  return address;
}

export async function getWalletChainId(): Promise<number> {
  const provider = getBrowserWallet();
  return parseChainId(await provider.request({ method: "eth_chainId" }));
}

/** Switches to Monad Testnet, adding it to MetaMask only if the wallet does not know it yet. */
export async function ensureMonadTestnet(provider = getBrowserWallet()): Promise<void> {
  const currentChainId = await provider.request({ method: "eth_chainId" });
  if (parseChainId(currentChainId) === monadTestnet.id) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: monadTestnetChainIdHex }],
    });
  } catch (error) {
    if (!isProviderErrorWithCode(error, 4902)) throw error;

    await addMonadTestnet(provider);
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: monadTestnetChainIdHex }],
    });
  }
}

/**
 * Clears only this app's in-memory display state.
 * A web page cannot disconnect MetaMask or revoke its authorization by itself.
 */
export function forgetLocalWalletSession(): void {
  locallyRememberedAddress = undefined;
}

export function getLocallyRememberedAddress(): Address | undefined {
  return locallyRememberedAddress;
}

/** Lets the future UI refresh when the user changes accounts or networks in MetaMask. */
export function subscribeToWalletChanges(onChange: () => void): () => void {
  const provider = getBrowserWallet();
  const listener = () => onChange();

  provider.on?.("accountsChanged", listener);
  provider.on?.("chainChanged", listener);

  return () => {
    provider.removeListener?.("accountsChanged", listener);
    provider.removeListener?.("chainChanged", listener);
  };
}
