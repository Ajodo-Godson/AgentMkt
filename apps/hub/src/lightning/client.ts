import { env } from "../lib/env.js";
import { lexeClient, lexeUtils } from "./lexe-client.js";
import { lndClient } from "./lnd-client.js";
import type {
  LightningBackend,
  LightningClient,
  LightningCreateInvoiceResponse,
  LightningNodeInfo,
  LightningPayment,
} from "./types.js";

export const activeLightningBackend: LightningBackend = env.HUB_LIGHTNING_BACKEND;

const lexeLightningClient: LightningClient = {
  async health() {
    return lexeClient.health();
  },

  async nodeInfo(): Promise<LightningNodeInfo> {
    const info = await lexeClient.nodeInfo();
    return {
      backend: "lexe",
      version: info.version,
      node_pk: info.node_pk,
      lightning_balance_sats: lexeUtils.stringToSats(info.lightning_balance),
      lightning_sendable_balance_sats: lexeUtils.stringToSats(info.lightning_sendable_balance),
      onchain_balance_sats: lexeUtils.stringToSats(info.onchain_balance),
      num_usable_channels: info.num_usable_channels,
    };
  },

  async createInvoice(input): Promise<LightningCreateInvoiceResponse> {
    const created = await lexeClient.createInvoice(input);
    return {
      index: created.index,
      invoice: created.invoice,
      amount_sats: created.amount ? lexeUtils.stringToSats(created.amount) : null,
      created_at: created.created_at,
      expires_at: created.expires_at,
      payment_hash: created.payment_hash,
      payment_secret: created.payment_secret,
    };
  },

  async payInvoice(input) {
    return lexeClient.payInvoice(input);
  },

  async getPayment(index): Promise<LightningPayment> {
    const payment = await lexeClient.getPayment(index);
    return {
      index: payment.index,
      direction: payment.direction,
      amount_sats: lexeUtils.stringToSats(payment.amount),
      fees_sats: lexeUtils.stringToSats(payment.fees),
      status: payment.status,
      status_msg: payment.status_msg ?? null,
      hash: payment.hash ?? null,
      preimage: payment.preimage ?? null,
      invoice: payment.invoice ?? null,
      created_at: payment.created_at,
      updated_at: payment.updated_at,
      finalized_at: payment.finalized_at ?? null,
    };
  },

  async waitForPayment(index, opts) {
    const payment = await lexeClient.waitForPayment(index, opts);
    return {
      index: payment.index,
      direction: payment.direction,
      amount_sats: lexeUtils.stringToSats(payment.amount),
      fees_sats: lexeUtils.stringToSats(payment.fees),
      status: payment.status,
      status_msg: payment.status_msg ?? null,
      hash: payment.hash ?? null,
      preimage: payment.preimage ?? null,
      invoice: payment.invoice ?? null,
      created_at: payment.created_at,
      updated_at: payment.updated_at,
      finalized_at: payment.finalized_at ?? null,
    };
  },
};

export const lightningClient: LightningClient =
  activeLightningBackend === "lnd" ? lndClient : lexeLightningClient;
