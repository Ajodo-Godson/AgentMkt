/**
 * Browser WebLN wrapper. Speaks to whatever LN wallet provider the user has
 * installed (Alby, Mutiny, Joule, etc.) — the API surface is standardized.
 *
 * We only use three calls:
 *   - enable()       → user grants the site permission to talk to the wallet
 *   - getInfo()      → returns the wallet's node pubkey (we use this as user_id)
 *   - sendPayment(invoice) → user confirms in their wallet, sats fly
 */

declare global {
  interface Window {
    webln?: WebLNProvider;
  }
}

export interface WebLNProvider {
  enabled?: boolean;
  enable(): Promise<void>;
  getInfo(): Promise<{
    node?: { alias?: string; pubkey?: string; color?: string };
  }>;
  sendPayment(paymentRequest: string): Promise<{ preimage: string }>;
}

export type ConnectedWallet = {
  pubkey: string;
  alias: string;
};

/** Short-circuit check before we try to call enable(). */
export function isWebLNAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.webln !== "undefined";
}

/**
 * Asks the user's wallet for permission and returns a stable identifier we
 * can use as user_id. Throws a friendly error if no provider is installed.
 */
export async function connectWallet(): Promise<ConnectedWallet> {
  if (!isWebLNAvailable()) {
    throw new Error(
      "No Lightning wallet detected. Install the Alby browser extension at https://getalby.com",
    );
  }
  const webln = window.webln!;
  await webln.enable();
  const info = await webln.getInfo();
  const pubkey = info.node?.pubkey ?? "";
  if (!pubkey) {
    throw new Error("Wallet did not return a node pubkey");
  }
  return {
    pubkey,
    alias: info.node?.alias ?? "lightning-user",
  };
}

/**
 * Pay a bolt11 invoice via the connected wallet. The wallet shows its own
 * confirm popup — this resolves once the user approves and the payment
 * succeeds, or rejects if they decline.
 */
export async function payInvoice(bolt11: string): Promise<{ preimage: string }> {
  if (!isWebLNAvailable()) {
    throw new Error("No Lightning wallet connected");
  }
  return window.webln!.sendPayment(bolt11);
}

/**
 * Build a stable, readable user_id from a node pubkey so we don't shove a
 * 66-char hex string into our DB. Format: `user_<short-pubkey>`.
 */
export function userIdFromPubkey(pubkey: string): string {
  return `user_${pubkey.slice(0, 16)}`;
}
