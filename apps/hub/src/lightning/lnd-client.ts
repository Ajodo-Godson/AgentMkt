import * as z from "zod";
import bolt11 from "bolt11";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { env } from "../lib/env.js";
import { HubError } from "../lib/errors.js";
import { childLogger } from "../lib/logger.js";
import type {
  LightningClient,
  LightningCreateInvoiceResponse,
  LightningNodeInfo,
  LightningPayment,
  LightningPayInvoiceResponse,
} from "./types.js";

const log = childLogger({ component: "lnd-client" });

const DEFAULT_TIMEOUT_MS = 30_000;
const PAYMENT_PREFIX = "payment:";
const INVOICE_PREFIX = "invoice:";

const paymentCache = new Map<string, LightningPayment>();

const getInfoSchema = z.object({
  version: z.string().optional(),
  identity_pubkey: z.string().optional(),
  num_active_channels: z.string().optional(),
  num_inactive_channels: z.string().optional(),
});

const channelBalanceSchema = z.object({
  balance: z.string().optional(),
  local_balance: z.object({ sat: z.string().optional() }).optional(),
});

const walletBalanceSchema = z.object({
  total_balance: z.string().optional(),
  confirmed_balance: z.string().optional(),
});

const addInvoiceResponseSchema = z.object({
  r_hash: z.string(),
  payment_request: z.string(),
  payment_addr: z.string().optional(),
});

const invoiceLookupSchema = z.object({
  payment_request: z.string().optional(),
  creation_date: z.string().optional(),
  settle_date: z.string().optional(),
  amt_paid_sat: z.string().optional(),
  state: z.string().optional(),
});

const sendPaymentSyncSchema = z.object({
  payment_error: z.string().optional(),
  payment_preimage: z.string().optional(),
  payment_hash: z.string().optional(),
  payment_route: z
    .object({
      total_fees: z.string().optional(),
      total_amt: z.string().optional(),
    })
    .optional(),
});

const trackedPaymentSchema = z.object({
  payment_hash: z.string().optional(),
  payment_preimage: z.string().optional(),
  payment_request: z.string().optional(),
  value_sat: z.string().optional(),
  fee_sat: z.string().optional(),
  status: z.string().optional(),
  failure_reason: z.string().optional(),
  creation_date: z.string().optional(),
  creation_time_ns: z.string().optional(),
});

function parseIntLike(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function parseUnixSecondsToMs(value: string | null | undefined): number | null {
  const secs = parseIntLike(value);
  return secs === null ? null : secs * 1000;
}

function parseUnixNsToMs(value: string | null | undefined): number | null {
  if (!value) return null;
  return Number(BigInt(value) / 1_000_000n);
}

function base64ToHex(value: string): string {
  return Buffer.from(value, "base64").toString("hex");
}

function hexToBase64(value: string): string {
  return Buffer.from(value, "hex").toString("base64");
}

function hexToBase64Url(value: string): string {
  return hexToBase64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBolt11(input: string): { paymentHash: string; amountSats: number | null } {
  const decoded = bolt11.decode(input);
  const paymentHashTag = decoded.tags.find((tag) => tag.tagName === "payment_hash");
  const paymentHash = typeof paymentHashTag?.data === "string" ? paymentHashTag.data : null;
  if (!paymentHash) {
    throw new HubError(502, "lnd_bad_invoice", "bolt11 missing payment_hash");
  }
  if (typeof decoded.satoshis === "number") {
    return { paymentHash, amountSats: decoded.satoshis };
  }
  if (decoded.millisatoshis) {
    return { paymentHash, amountSats: Number(BigInt(decoded.millisatoshis) / 1000n) };
  }
  return { paymentHash, amountSats: null };
}

function getMacaroonHex(): string {
  const inline = env.LND_MACAROON_HEX.trim();
  if (inline) return inline;
  const fromPath = env.LND_MACAROON_PATH.trim();
  if (!fromPath) {
    throw new HubError(500, "lnd_missing_macaroon", "set LND_MACAROON_HEX or LND_MACAROON_PATH");
  }
  return readFileSync(fromPath).toString("hex").trim();
}

function getTlsRequestOptions(): { ca?: string | Buffer; rejectUnauthorized?: boolean } {
  if (env.LND_TLS_SKIP_VERIFY) {
    return { rejectUnauthorized: false };
  }
  if (env.LND_TLS_CERT_PEM.trim()) {
    return { ca: env.LND_TLS_CERT_PEM };
  }
  if (env.LND_TLS_CERT_PATH.trim()) {
    return { ca: readFileSync(env.LND_TLS_CERT_PATH) };
  }
  return {};
}

interface RequestOpts {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  query?: Record<string, string>;
  timeoutMs?: number;
}

async function lndRequestRaw(opts: RequestOpts): Promise<string> {
  const base = new URL(env.LND_REST_URL);
  const url = new URL(opts.path, base);
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      url.searchParams.set(key, value);
    }
  }

  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const headers: Record<string, string> = {
    "Grpc-Metadata-macaroon": getMacaroonHex(),
  };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    headers["content-length"] = Buffer.byteLength(body).toString();
  }

  return await new Promise<string>((resolve, reject) => {
    const callback = (res: http.IncomingMessage) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        text += chunk;
      });
      res.on("end", () => {
        const status = res.statusCode ?? 500;
        if (status < 200 || status >= 300) {
          log.warn({ status, path: url.pathname, body: text }, "lnd non-2xx");
          reject(
            new HubError(
              status === 404 ? 404 : 502,
              "lnd_error",
              `${status} ${res.statusMessage ?? ""}: ${text.slice(0, 300)}`,
            ),
          );
          return;
        }
        resolve(text);
      });
    };

    const baseOptions = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: opts.method,
      headers,
    };

    const req =
      url.protocol === "https:"
        ? https.request({ ...baseOptions, ...getTlsRequestOptions() }, callback)
        : http.request(baseOptions, callback);

    req.setTimeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, () => {
      req.destroy(new Error(`timed out after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`));
    });
    req.on("error", (err) => {
      reject(
        new HubError(
          502,
          "lnd_unreachable",
          `Could not reach LND at ${env.LND_REST_URL}: ${err.message}`,
          err,
        ),
      );
    });
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function lndRequest<T>(schema: z.ZodType<T>, opts: RequestOpts): Promise<T> {
  const text = await lndRequestRaw(opts);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HubError(502, "lnd_bad_json", text.slice(0, 300));
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    log.error({ issues: result.error.issues, raw: parsed }, "lnd schema mismatch");
    throw new HubError(502, "lnd_schema_mismatch", JSON.stringify(result.error.issues).slice(0, 300));
  }
  return result.data;
}

async function lndStreamRequest<T>(schema: z.ZodType<T>, opts: RequestOpts): Promise<T> {
  const text = await lndRequestRaw({ ...opts, timeoutMs: opts.timeoutMs ?? 90_000 });
  const chunks = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (chunks.length === 0) {
    throw new HubError(502, "lnd_empty_stream", `${opts.method} ${opts.path} returned no payload`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(chunks[chunks.length - 1] ?? "");
  } catch {
    throw new HubError(502, "lnd_bad_stream_json", (chunks[chunks.length - 1] ?? "").slice(0, 300));
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    log.error({ issues: result.error.issues, raw: parsed }, "lnd stream schema mismatch");
    throw new HubError(502, "lnd_stream_schema_mismatch", JSON.stringify(result.error.issues).slice(0, 300));
  }
  return result.data;
}

async function lookupInvoicePayment(paymentHashHex: string): Promise<LightningPayment> {
  const invoice = await lndRequest(invoiceLookupSchema, {
    method: "GET",
    path: "/v2/invoices/lookup",
    query: { payment_hash: hexToBase64(paymentHashHex) },
  });

  const state = invoice.state ?? "OPEN";
  const status =
    state === "SETTLED" ? "completed" : state === "CANCELED" ? "failed" : "pending";

  return {
    index: `${INVOICE_PREFIX}${paymentHashHex}`,
    direction: "inbound",
    amount_sats: parseIntLike(invoice.amt_paid_sat),
    fees_sats: 0,
    status,
    status_msg: invoice.state ?? null,
    hash: paymentHashHex,
    preimage: null,
    invoice: invoice.payment_request ?? null,
    created_at: parseUnixSecondsToMs(invoice.creation_date) ?? Date.now(),
    updated_at:
      parseUnixSecondsToMs(invoice.settle_date) ??
      parseUnixSecondsToMs(invoice.creation_date) ??
      Date.now(),
    finalized_at: parseUnixSecondsToMs(invoice.settle_date),
  };
}

async function trackOutboundPayment(paymentHashHex: string): Promise<LightningPayment> {
  const tracked = await lndStreamRequest(trackedPaymentSchema, {
    method: "GET",
    path: `/v2/router/track/${hexToBase64Url(paymentHashHex)}`,
    query: { no_inflight_updates: "true" },
  });

  const status =
    tracked.status === "SUCCEEDED"
      ? "completed"
      : tracked.status === "FAILED"
        ? "failed"
        : "pending";

  const payment: LightningPayment = {
    index: `${PAYMENT_PREFIX}${paymentHashHex}`,
    direction: "outbound",
    amount_sats: parseIntLike(tracked.value_sat),
    fees_sats: parseIntLike(tracked.fee_sat),
    status,
    status_msg: tracked.failure_reason ?? tracked.status ?? null,
    hash: tracked.payment_hash ?? paymentHashHex,
    preimage: tracked.payment_preimage ? base64ToHex(tracked.payment_preimage) : null,
    invoice: tracked.payment_request ?? null,
    created_at:
      parseUnixNsToMs(tracked.creation_time_ns) ??
      parseUnixSecondsToMs(tracked.creation_date) ??
      Date.now(),
    updated_at: Date.now(),
    finalized_at: status === "pending" ? null : Date.now(),
  };
  paymentCache.set(payment.index, payment);
  return payment;
}

export const lndClient: LightningClient = {
  async health() {
    await lndRequest(z.unknown(), { method: "GET", path: "/v1/getinfo", timeoutMs: 5_000 });
    return { status: "ok" };
  },

  async nodeInfo(): Promise<LightningNodeInfo> {
    const [info, channels, wallet] = await Promise.all([
      lndRequest(getInfoSchema, { method: "GET", path: "/v1/getinfo" }),
      lndRequest(channelBalanceSchema, { method: "GET", path: "/v1/balance/channels" }),
      lndRequest(walletBalanceSchema, { method: "GET", path: "/v1/balance/blockchain" }),
    ]);

    const lightningBalance =
      parseIntLike(channels.local_balance?.sat) ?? parseIntLike(channels.balance) ?? 0;
    const onchainBalance =
      parseIntLike(wallet.confirmed_balance) ?? parseIntLike(wallet.total_balance) ?? 0;
    const activeChannels = parseIntLike(info.num_active_channels) ?? 0;
    const inactiveChannels = parseIntLike(info.num_inactive_channels) ?? 0;

    return {
      backend: "lnd",
      version: info.version ?? null,
      node_pk: info.identity_pubkey ?? null,
      lightning_balance_sats: lightningBalance,
      lightning_sendable_balance_sats: lightningBalance,
      onchain_balance_sats: onchainBalance,
      num_usable_channels: activeChannels + inactiveChannels,
    };
  },

  async createInvoice(input): Promise<LightningCreateInvoiceResponse> {
    const createdAt = Date.now();
    const response = await lndRequest(addInvoiceResponseSchema, {
      method: "POST",
      path: "/v1/invoices",
      body: {
        memo: input.description,
        value: input.sats === undefined ? undefined : String(input.sats),
        expiry: input.expiresInSecs === undefined ? undefined : String(input.expiresInSecs),
        private: env.LND_PRIVATE_INVOICES,
      },
    });

    const paymentHash = base64ToHex(response.r_hash);
    return {
      index: `${INVOICE_PREFIX}${paymentHash}`,
      invoice: response.payment_request,
      amount_sats: input.sats ?? null,
      created_at: createdAt,
      expires_at: createdAt + (input.expiresInSecs ?? 86_400) * 1000,
      payment_hash: paymentHash,
      payment_secret: response.payment_addr ? base64ToHex(response.payment_addr) : null,
    };
  },

  async payInvoice(input): Promise<LightningPayInvoiceResponse> {
    const createdAt = Date.now();
    const decoded = decodeBolt11(input.bolt11);
    const paymentHash = decoded.paymentHash;
    // Keep the LND-specific payment behavior boxed in here. We use the
    // synchronous REST send because it gives us the final preimage in one
    // response, which is exactly what the hub needs for L402 auth.
    const response = await lndRequest(sendPaymentSyncSchema, {
      method: "POST",
      path: "/v1/channels/transactions",
      body: {
        payment_request: input.bolt11,
        amt:
          decoded.amountSats === null && input.fallbackAmountSats !== undefined
            ? String(input.fallbackAmountSats)
            : undefined,
        fee_limit: { fixed: String(env.HUB_MAX_ROUTING_FEE_SATS) },
      },
      timeoutMs: 90_000,
    });

    if (response.payment_error) {
      throw new HubError(502, "lnd_payment_failed", response.payment_error);
    }

    const payment: LightningPayment = {
      index: `${PAYMENT_PREFIX}${paymentHash}`,
      direction: "outbound",
      amount_sats: decoded.amountSats ?? input.fallbackAmountSats ?? null,
      fees_sats: parseIntLike(response.payment_route?.total_fees),
      status: response.payment_preimage ? "completed" : "failed",
      status_msg: response.payment_preimage ? "completed" : "missing payment_preimage",
      hash: paymentHash,
      preimage: response.payment_preimage ? base64ToHex(response.payment_preimage) : null,
      invoice: input.bolt11,
      created_at: createdAt,
      updated_at: Date.now(),
      finalized_at: Date.now(),
    };
    paymentCache.set(payment.index, payment);

    if (!payment.preimage) {
      throw new HubError(
        502,
        "lnd_no_preimage",
        `completed outbound payment ${paymentHash} did not include a preimage`,
      );
    }

    return { index: payment.index, created_at: createdAt };
  },

  async getPayment(index: string): Promise<LightningPayment> {
    const cached = paymentCache.get(index);
    if (cached) return cached;
    if (index.startsWith(INVOICE_PREFIX)) {
      return lookupInvoicePayment(index.slice(INVOICE_PREFIX.length));
    }
    if (index.startsWith(PAYMENT_PREFIX)) {
      return trackOutboundPayment(index.slice(PAYMENT_PREFIX.length));
    }
    throw new HubError(400, "payment_id_invalid", `unknown LND payment id ${index}`);
  },

  async waitForPayment(index: string, opts: { timeoutMs?: number; intervalMs?: number } = {}) {
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const intervalMs = opts.intervalMs ?? 1_000;

    if (index.startsWith(PAYMENT_PREFIX)) {
      const cached = paymentCache.get(index);
      if (cached) return cached;
      return trackOutboundPayment(index.slice(PAYMENT_PREFIX.length));
    }

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const payment = await this.getPayment(index);
      if (payment.status !== "pending") return payment;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new HubError(504, "payment_timeout", `payment ${index} did not finalize in ${timeoutMs}ms`);
  },
};
