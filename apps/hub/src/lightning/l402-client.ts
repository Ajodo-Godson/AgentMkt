// =============================================================================
// L402 client — does the HTTP 402 + macaroon + bolt11 dance.
//
// Per the Lightning Labs L402 spec:
//   - Request hits an L402 endpoint without auth.
//   - Server responds 402 + `WWW-Authenticate: L402 macaroon="...", invoice="..."`
//   - We parse the macaroon (base64) and bolt11 invoice.
//   - We pay the invoice via the Lexe sidecar to obtain a preimage.
//   - We retry the request with `Authorization: L402 <b64macaroon>:<hexpreimage>`.
//   - 200 + result body comes back.
//
// Spec references:
//   https://github.com/lightninglabs/L402/blob/master/protocol-specification.md
//   https://github.com/Roasbeef/blips/blob/master/blip-0026.md
//
// Compatibility notes (per spec section "Backwards Compatibility"):
//   - Servers SHOULD send both `LSAT` and `L402` scheme names. We accept either.
//   - The challenge param may be `macaroon=` (older) or `token=` (BLIP-26).
//     We accept either.
// =============================================================================

import bolt11 from "bolt11";
import { createHash } from "node:crypto";
import { lexeClient } from "./lexe-client.js";
import { childLogger } from "../lib/logger.js";
import { HubError } from "../lib/errors.js";
import { maxRoutingFeeForInvoice } from "../policy/fee.js";

const log = childLogger({ component: "l402-client" });

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------
export interface L402Challenge {
  scheme: "L402" | "LSAT";
  macaroon: string; // base64-encoded, as-received
  invoice: string; // BOLT11
  invoice_amount_sats: number; // decoded from the bolt11 amount
  invoice_payment_hash: string; // hex
}

export interface L402PaidPayment {
  preimage: string; // hex
  paid_amount_sats: number; // what Lexe says we paid (== invoice amount in normal cases)
  routing_fee_sats: number; // Lightning routing fee paid on top
  payment_index: string;
}

export interface L402ForwardOk {
  status: 200;
  result: unknown;
  challenge: L402Challenge;
  payment: L402PaidPayment;
}

// -----------------------------------------------------------------------------
// Header parsing
// -----------------------------------------------------------------------------

/**
 * Parse an HTTP `WWW-Authenticate` header value into one or more L402 challenges.
 * Tolerant of both `L402` and legacy `LSAT` scheme names, and both `macaroon=`
 * and BLIP-26 `token=` parameter names.
 *
 * Returns the FIRST L402/LSAT challenge found that has both a macaroon/token
 * AND an invoice. Throws HubError(502) if nothing valid is present.
 */
export function parseWwwAuthenticate(header: string): L402Challenge {
  // The header may contain multiple challenges separated by commas, but the
  // params themselves are also comma-separated, so we can't naively split.
  // Strategy: scan for "L402" or "LSAT" tokens, then parse the params that
  // follow until we hit the next scheme keyword or end of string.
  //
  // Accept formats:
  //   L402 macaroon="..." invoice="..."
  //   L402 macaroon="...", invoice="..."
  //   LSAT macaroon="...", invoice="..."
  //   L402 version="0", token="...", invoice="..."

  const schemeRe = /\b(L402|LSAT)\b\s+([^]*?)(?=\b(?:L402|LSAT)\s|$)/g;
  const matches = [...header.matchAll(schemeRe)];
  if (matches.length === 0) {
    throw new HubError(
      502,
      "l402_no_challenge",
      `No L402/LSAT scheme found in WWW-Authenticate: ${header.slice(0, 200)}`,
    );
  }

  for (const m of matches) {
    const scheme = m[1] as "L402" | "LSAT";
    const paramsStr = m[2] ?? "";
    const params = parseAuthParams(paramsStr);

    const macaroon = params.macaroon ?? params.token;
    const invoice = params.invoice;
    if (!macaroon || !invoice) continue;

    let decoded;
    try {
      decoded = bolt11.decode(invoice);
    } catch (err) {
      throw new HubError(
        502,
        "l402_bad_invoice",
        `Could not decode bolt11: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const sats = bolt11Sats(decoded);
    const payment_hash = bolt11Tag(decoded, "payment_hash");
    if (!payment_hash) {
      throw new HubError(
        502,
        "l402_bad_invoice",
        "bolt11 missing payment_hash tag",
      );
    }

    return {
      scheme,
      macaroon,
      invoice,
      invoice_amount_sats: sats,
      invoice_payment_hash: payment_hash,
    };
  }

  throw new HubError(
    502,
    "l402_no_valid_challenge",
    "No L402/LSAT challenge with both macaroon and invoice found",
  );
}

/** Parse RFC-7235 quoted-string params. Tolerant of unquoted values. */
function parseAuthParams(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Match key=value where value is either "quoted" or until a comma/space.
  const kvRe = /([a-zA-Z_][\w-]*)\s*=\s*(?:"([^"]*)"|([^,\s]+))/g;
  let m: RegExpExecArray | null;
  while ((m = kvRe.exec(raw))) {
    const k = m[1];
    if (!k) continue;
    out[k.toLowerCase()] = m[2] ?? m[3] ?? "";
  }
  return out;
}

// Helpers for the `bolt11` package's slightly clunky shape.
function bolt11Sats(decoded: { satoshis?: number | null; millisatoshis?: string | null }): number {
  if (typeof decoded.satoshis === "number") return decoded.satoshis;
  if (decoded.millisatoshis) {
    const ms = BigInt(decoded.millisatoshis);
    return Number(ms / 1000n);
  }
  return 0;
}

function bolt11Tag(
  decoded: { tags?: Array<{ tagName: string; data: unknown }> },
  name: string,
): string | undefined {
  const t = decoded.tags?.find((x) => x.tagName === name);
  return typeof t?.data === "string" ? t.data : undefined;
}

function sha256HexOfHex(hex: string): string {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new HubError(
      502,
      "lexe_bad_preimage",
      "Lexe returned a malformed payment preimage",
    );
  }
  return createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
}

// -----------------------------------------------------------------------------
// Payment flow
// -----------------------------------------------------------------------------

/**
 * Pay an L402 challenge invoice via Lexe, returning the preimage we'll
 * present in the retried request. Surfaces routing fee for ledger booking.
 */
export async function payL402Invoice(
  challenge: L402Challenge,
  ctx: { ceiling_sats: number; hold_invoice_id: string },
): Promise<L402PaidPayment> {
  if (challenge.invoice_amount_sats > ctx.ceiling_sats) {
    throw new HubError(
      402,
      "supplier_over_ceiling",
      `supplier asks ${challenge.invoice_amount_sats} sats, ceiling is ${ctx.ceiling_sats}`,
    );
  }

  log.info(
    {
      hold: ctx.hold_invoice_id,
      ask_sats: challenge.invoice_amount_sats,
      ceiling: ctx.ceiling_sats,
    },
    "paying L402 invoice",
  );

  const pay = await lexeClient.payInvoice({
    bolt11: challenge.invoice,
    note: `L402 forward for hold ${ctx.hold_invoice_id}`,
  });

  // Block until the payment finalizes. 60s ceiling — Lightning hops should
  // resolve in <5s but we're paranoid for the demo.
  const finalized = await lexeClient.waitForPayment(pay.index, {
    timeoutMs: 60_000,
    intervalMs: 750,
  });

  if (finalized.status !== "completed") {
    throw new HubError(
      502,
      "l402_payment_failed",
      `payment ${pay.index} ended in status ${finalized.status} (${finalized.status_msg ?? ""})`,
    );
  }

  const preimage = finalized.preimage;
  if (!preimage) {
    throw new HubError(
      502,
      "lexe_no_preimage",
      `completed outbound payment ${pay.index} did not include a preimage`,
    );
  }
  const preimageHash = sha256HexOfHex(preimage);
  if (preimageHash !== challenge.invoice_payment_hash.toLowerCase()) {
    throw new HubError(
      502,
      "l402_preimage_mismatch",
      `preimage hash ${preimageHash} does not match invoice payment_hash ${challenge.invoice_payment_hash}`,
    );
  }

  const paid_sats = numFromString(finalized.amount, challenge.invoice_amount_sats);
  const routing_fee_sats = numFromString(finalized.fees, 0);

  const cap = maxRoutingFeeForInvoice(challenge.invoice_amount_sats);
  if (routing_fee_sats > cap) {
    log.warn(
      { routing_fee_sats, cap, invoice_amount: challenge.invoice_amount_sats },
      "routing fee exceeded local cap — payment already settled, surfacing warning",
    );
  }

  return {
    preimage,
    paid_amount_sats: paid_sats,
    routing_fee_sats,
    payment_index: pay.index,
  };
}

function numFromString(s: string | null | undefined, fallback: number): number {
  if (s === null || s === undefined) return fallback;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

// -----------------------------------------------------------------------------
// Full forward flow
// -----------------------------------------------------------------------------

export interface ForwardInput {
  supplier_endpoint: string;
  supplier_payload: unknown;
  ceiling_sats: number;
  hold_invoice_id: string;
}

/**
 * Execute one full L402 round-trip against a supplier endpoint.
 *
 * Throws HubError on:
 *   - non-402 first response that's not 200 (502 supplier_protocol_error)
 *   - missing/invalid WWW-Authenticate (502 l402_*)
 *   - supplier ceiling violation (402 supplier_over_ceiling)
 *   - payment failure (502 l402_payment_failed)
 *   - timeout (504 supplier_timeout / payment_timeout)
 */
export async function l402Forward(input: ForwardInput): Promise<L402ForwardOk> {
  const t0 = Date.now();

  const initial = await fetch(input.supplier_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input.supplier_payload),
    signal: AbortSignal.timeout(30_000),
  }).catch((err: unknown) => {
    throw new HubError(
      504,
      "supplier_timeout",
      `Could not reach supplier ${input.supplier_endpoint}: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  });

  // Some L402 servers will return 200 if the resource is unpaywalled or if a
  // cached macaroon is presented — we don't expect this, but handle it.
  if (initial.status === 200) {
    log.warn(
      { endpoint: input.supplier_endpoint },
      "supplier returned 200 without 402 challenge — no payment made",
    );
    const result = await safeJson(initial);
    return {
      status: 200,
      result,
      challenge: {
        scheme: "L402",
        macaroon: "",
        invoice: "",
        invoice_amount_sats: 0,
        invoice_payment_hash: "",
      },
      payment: {
        preimage: "",
        paid_amount_sats: 0,
        routing_fee_sats: 0,
        payment_index: "",
      },
    };
  }

  if (initial.status !== 402) {
    const body = await initial.text();
    throw new HubError(
      502,
      "supplier_protocol_error",
      `expected 402, got ${initial.status}: ${body.slice(0, 200)}`,
    );
  }

  const wwwAuth = initial.headers.get("www-authenticate");
  if (!wwwAuth) {
    throw new HubError(
      502,
      "supplier_no_auth_header",
      "supplier returned 402 with no WWW-Authenticate header",
    );
  }
  const challenge = parseWwwAuthenticate(wwwAuth);

  // Drain the 402 body so the connection can be reused (best-effort).
  await initial.body?.cancel();

  // Pay via Lexe.
  const payment = await payL402Invoice(challenge, {
    ceiling_sats: input.ceiling_sats,
    hold_invoice_id: input.hold_invoice_id,
  });

  // Retry with Authorization header.
  // Per spec section 5.2: `Authorization: L402 <base64(macaroon)>:<hex(preimage)>`
  // The macaroon as received is already base64-encoded.
  const authHeader = `${challenge.scheme} ${challenge.macaroon}:${payment.preimage}`;
  const second = await fetch(input.supplier_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: authHeader,
    },
    body: JSON.stringify(input.supplier_payload),
    signal: AbortSignal.timeout(30_000),
  }).catch((err: unknown) => {
    throw new HubError(
      504,
      "supplier_timeout",
      `Supplier ${input.supplier_endpoint} timed out on retry: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  });

  if (second.status !== 200) {
    const body = await second.text();
    throw new HubError(
      502,
      "supplier_paywall_failed",
      `supplier rejected payment: ${second.status} ${body.slice(0, 200)}`,
    );
  }

  const result = await safeJson(second);

  log.info(
    {
      hold: input.hold_invoice_id,
      endpoint: input.supplier_endpoint,
      paid_sats: payment.paid_amount_sats,
      routing_fee_sats: payment.routing_fee_sats,
      elapsed_ms: Date.now() - t0,
    },
    "L402 forward succeeded",
  );

  return { status: 200, result, challenge, payment };
}

async function safeJson(res: Response): Promise<unknown> {
  const t = await res.text();
  try {
    return JSON.parse(t);
  } catch {
    return { raw_text: t };
  }
}
