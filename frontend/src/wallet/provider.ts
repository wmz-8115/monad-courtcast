/** A minimal browser-wallet interface shared by MetaMask and other EIP-1193 wallets. */
export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void): void;
  removeListener?(event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void): void;
};

export class WalletProviderMissingError extends Error {
  constructor() {
    super("No browser wallet was found. Install and unlock MetaMask first.");
    this.name = "WalletProviderMissingError";
  }
}

/**
 * Reads the browser-injected wallet only when a wallet action is requested.
 * This module never receives a private key, seed phrase, or wallet password.
 */
export function getBrowserWallet(): Eip1193Provider {
  if (typeof window === "undefined" || window.ethereum === undefined) {
    throw new WalletProviderMissingError();
  }

  return window.ethereum;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}
