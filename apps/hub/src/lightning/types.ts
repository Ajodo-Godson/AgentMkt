export type LightningBackend = "lexe" | "lnd";

export interface LightningNodeInfo {
  backend: LightningBackend;
  version: string | null;
  node_pk: string | null;
  lightning_balance_sats: number;
  lightning_sendable_balance_sats: number;
  onchain_balance_sats: number;
  num_usable_channels: number | null;
}

export interface LightningCreateInvoiceResponse {
  index: string;
  invoice: string;
  amount_sats: number | null;
  created_at: number;
  expires_at: number;
  payment_hash: string;
  payment_secret: string | null;
}

export interface LightningPayInvoiceResponse {
  index: string;
  created_at: number;
}

export interface LightningPayment {
  index: string;
  direction: "inbound" | "outbound" | "info";
  amount_sats: number | null;
  fees_sats: number | null;
  status: "pending" | "completed" | "failed";
  status_msg: string | null;
  hash: string | null;
  preimage: string | null;
  invoice: string | null;
  created_at: number;
  updated_at: number;
  finalized_at: number | null;
}

export interface LightningClient {
  health(): Promise<{ status: string }>;
  nodeInfo(): Promise<LightningNodeInfo>;
  createInvoice(input: {
    sats?: number;
    description?: string;
    expiresInSecs?: number;
    payerNote?: string;
  }): Promise<LightningCreateInvoiceResponse>;
  payInvoice(input: {
    bolt11: string;
    note?: string;
    fallbackAmountSats?: number;
  }): Promise<LightningPayInvoiceResponse>;
  getPayment(index: string): Promise<LightningPayment>;
  waitForPayment(
    index: string,
    opts?: { timeoutMs?: number; intervalMs?: number },
  ): Promise<LightningPayment>;
}
