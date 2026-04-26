// =============================================================================
// Lexe sidecar REST client.
//
// Wraps the 5 endpoints documented at
// https://github.com/lexe-app/lexe-sidecar-sdk:
//
//   GET  /v2/health
//   GET  /v2/node/node_info
//   POST /v2/node/create_invoice
//   POST /v2/node/pay_invoice
//   GET  /v2/node/payment?index=...
//
// Lexe serializes amount values as fixed-precision DECIMAL STRINGS (e.g.
// "1000" or "1000.123" for sub-sat msat precision). The hub uses integer
// `number` sats internally — this client converts at the boundary.
// =============================================================================

import * as z from "zod";
import { env } from "../lib/env.js";
import { childLogger, logger } from "../lib/logger.js";
import { HubError } from "../lib/errors.js";

const log = childLogger({ component: "lexe-client" });

// Per Lexe docs: prefer longer timeouts (>=15s) since the node may need time
// to wake up if cold.
const DEFAULT_TIMEOUT_MS = 15_000;

// Convert an integer-sat number to Lexe's string-decimal format.
function satsToString(n: number): string {
  if (!Number.isInteger(n) || n < 0) {
    throw new HubError(400, "invalid_amount", `amount must be a non-negative integer sat, got ${n}`);
  }
  return n.toString(10);
}

// Parse Lexe's decimal-string sat amount back to integer sats. Floors anything
// sub-sat (Lexe can carry msat precision) — for our books, sub-sat is always 0.
function stringToSats(s: string | null | undefined): number {
  if (s === null || s === undefined) return 0;
  const f = Number.parseFloat(s);
  if (Number.isNaN(f)) {
    throw new HubError(502, "lexe_bad_amount", `bad sat amount from sidecar: ${s}`);
  }
  return Math.floor(f);
}

// -----------------------------------------------------------------------------
// Response schemas
// -----------------------------------------------------------------------------
const healthSchema = z.object({ status: z.string() });

const nodeInfoSchema = z.object({
  version: z.string(),
  measurement: z.string(),
  user_pk: z.string(),
  node_pk: z.string(),
  balance: z.string(),
  lightning_balance: z.string(),
  lightning_sendable_balance: z.string(),
  lightning_max_sendable_balance: z.string(),
  onchain_balance: z.string(),
  onchain_trusted_balance: z.string(),
  num_channels: z.number(),
  num_usable_channels: z.number(),
});

const createInvoiceResponseSchema = z.object({
  index: z.string(),
  invoice: z.string(),
  description: z.string().nullable(),
  amount: z.string().nullable(),
  created_at: z.number(),
  expires_at: z.number(),
  payment_hash: z.string(),
  payment_secret: z.string(),
});

const payInvoiceResponseSchema = z.object({
  index: z.string(),
  created_at: z.number(),
});

const paymentSchema = z.object({
  index: z.string(),
  rail: z.string(),
  kind: z.string(),
  direction: z.enum(["inbound", "outbound", "info"]),
  txid: z.string().nullable().optional(),
  amount: z.string().nullable().optional(),
  fees: z.string().nullable().optional(),
  status: z.enum(["pending", "completed", "failed"]),
  status_msg: z.string().nullable().optional(),
  hash: z.string().nullable().optional(),
  preimage: z.string().nullable().optional(),
  invoice: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  payer_note: z.string().nullable().optional(),
  expires_at: z.number().nullable().optional(),
  finalized_at: z.number().nullable().optional(),
  created_at: z.number(),
  updated_at: z.number(),
});

export type LexeNodeInfo = z.infer<typeof nodeInfoSchema>;
export type LexeCreateInvoiceResponse = z.infer<typeof createInvoiceResponseSchema>;
export type LexePayInvoiceResponse = z.infer<typeof payInvoiceResponseSchema>;
export type LexePayment = z.infer<typeof paymentSchema>;

// -----------------------------------------------------------------------------
// HTTP helper
// -----------------------------------------------------------------------------
interface FetchOpts {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  query?: Record<string, string>;
  timeoutMs?: number;
}

async function lexeFetch<T>(
  schema: z.ZodType<T>,
  opts: FetchOpts,
): Promise<T> {
  const url = new URL(opts.path, env.LEXE_SIDECAR_URL);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
  }

  const headers: Record<string, string> = {};
  if (opts.body) headers["content-type"] = "application/json";
  if (env.LEXE_CLIENT_CREDENTIALS) {
    headers["authorization"] = `Bearer ${env.LEXE_CLIENT_CREDENTIALS}`;
  }

  const res = await fetch(url, {
    method: opts.method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  }).catch((err: unknown) => {
    log.error({ err, url: url.toString() }, "lexe fetch failed");
    throw new HubError(
      502,
      "lexe_unreachable",
      `Could not reach Lexe sidecar at ${env.LEXE_SIDECAR_URL}`,
      err,
    );
  });

  const text = await res.text();
  if (!res.ok) {
    log.warn({ status: res.status, body: text, url: url.toString() }, "lexe non-2xx");
    throw new HubError(
      res.status === 404 ? 404 : 502,
      "lexe_error",
      `${res.status} ${res.statusText}: ${text.slice(0, 200)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HubError(502, "lexe_bad_json", text.slice(0, 200));
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    log.error(
      { issues: result.error.issues, raw: parsed },
      "lexe response did not match schema",
    );
    throw new HubError(
      502,
      "lexe_schema_mismatch",
      JSON.stringify(result.error.issues).slice(0, 200),
    );
  }
  return result.data;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------
export const lexeClient = {
  async health(): Promise<{ status: string }> {
    return lexeFetch(healthSchema, { method: "GET", path: "/v2/health", timeoutMs: 3_000 });
  },

  async nodeInfo(): Promise<LexeNodeInfo> {
    return lexeFetch(nodeInfoSchema, { method: "GET", path: "/v2/node/node_info" });
  },

  async createInvoice(input: {
    sats?: number;
    description?: string;
    expiresInSecs?: number;
    payerNote?: string;
  }): Promise<LexeCreateInvoiceResponse> {
    const body: Record<string, unknown> = {};
    if (input.sats !== undefined) body.amount = satsToString(input.sats);
    if (input.description !== undefined) body.description = input.description;
    if (input.expiresInSecs !== undefined) body.expiration_secs = input.expiresInSecs;
    if (input.payerNote !== undefined) body.payer_note = input.payerNote;
    return lexeFetch(createInvoiceResponseSchema, {
      method: "POST",
      path: "/v2/node/create_invoice",
      body,
    });
  },

  async payInvoice(input: {
    bolt11: string;
    note?: string;
    fallbackAmountSats?: number;
  }): Promise<LexePayInvoiceResponse> {
    const body: Record<string, unknown> = { invoice: input.bolt11 };
    if (input.note !== undefined) body.note = input.note;
    if (input.fallbackAmountSats !== undefined) {
      body.fallback_amount = satsToString(input.fallbackAmountSats);
    }
    return lexeFetch(payInvoiceResponseSchema, {
      method: "POST",
      path: "/v2/node/pay_invoice",
      body,
      // Pay can take longer if multiple route attempts are needed.
      timeoutMs: 30_000,
    });
  },

  async getPayment(index: string): Promise<LexePayment> {
    return lexeFetch(paymentSchema, {
      method: "GET",
      path: "/v2/node/payment",
      query: { index },
    });
  },

  /**
   * Block until a payment with the given index reaches a terminal state
   * (`completed` or `failed`), polling every `intervalMs`. Throws after
   * `timeoutMs`.
   */
  async waitForPayment(
    index: string,
    opts: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<LexePayment> {
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const intervalMs = opts.intervalMs ?? 1_000;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const p = await this.getPayment(index);
      if (p.status !== "pending") return p;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new HubError(
      504,
      "payment_timeout",
      `payment ${index} did not finalize in ${timeoutMs}ms`,
    );
  },
};

export const lexeUtils = {
  satsToString,
  stringToSats,
};

logger.debug({ url: env.LEXE_SIDECAR_URL }, "lexe-client loaded");
