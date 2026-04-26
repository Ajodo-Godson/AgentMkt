/**
 * Tiny L402 supplier used by smoke-happy-path.ts. Generates Lightning
 * invoices via the SAME Lexe sidecar the hub uses, which is fine for a
 * single-node sanity test (the hub pays itself; the round-trip exercises
 * every code path EXCEPT actual cross-node Lightning routing).
 *
 * For a real cross-node smoke test, run a P3 supplier (suppliers/summarizer)
 * which uses MDK against its own wallet.
 *
 * Usage:
 *   pnpm fake-supplier             # listens on :5099
 *   PORT=5099 pnpm fake-supplier
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { lexeClient } from "../src/lightning/lexe-client.js";
import { logger } from "../src/lib/logger.js";

const PORT = Number.parseInt(process.env.PORT ?? "5099", 10);
const PRICE_SATS = Number.parseInt(process.env.FAKE_SUPPLIER_PRICE ?? "10", 10);

// In-memory store of invoices we issued: payment_hash -> {invoice, paid?}
const issued = new Map<string, { invoice: string; index: string; paid: boolean }>();

const app = new Hono();

app.post("/service", async (c) => {
  const auth = c.req.header("authorization");

  if (!auth) {
    // First request: issue a 402 challenge.
    const inv = await lexeClient.createInvoice({
      sats: PRICE_SATS,
      description: `fake-supplier service (${PRICE_SATS} sats)`,
      expiresInSecs: 600,
    });
    issued.set(inv.payment_hash, {
      invoice: inv.invoice,
      index: inv.index,
      paid: false,
    });
    // Use a placeholder macaroon. Real L402 servers commit to the payment_hash
    // in the macaroon identifier; for the smoke test we just echo the payment
    // hash back so we can verify on retry.
    const macaroonB64 = Buffer.from(`fake-mac:${inv.payment_hash}`).toString(
      "base64",
    );
    c.header(
      "WWW-Authenticate",
      `L402 macaroon="${macaroonB64}", invoice="${inv.invoice}"`,
    );
    return c.json({ error: "payment required" }, 402);
  }

  // Retry: verify auth header.
  const m = /^L402\s+([^:]+):([0-9a-fA-F]+)$/i.exec(auth.trim());
  if (!m) return c.json({ error: "bad auth" }, 401);
  const macB64 = m[1] ?? "";
  // Extract committed payment_hash from our toy macaroon.
  let committedHash: string;
  try {
    const decoded = Buffer.from(macB64, "base64").toString("utf8");
    const parts = decoded.split(":");
    committedHash = parts[1] ?? "";
  } catch {
    return c.json({ error: "bad macaroon" }, 401);
  }

  const rec = issued.get(committedHash);
  if (!rec) return c.json({ error: "unknown invoice" }, 401);

  // Confirm payment via the Lexe sidecar.
  const payment = await lexeClient.getPayment(rec.index);
  if (payment.status !== "completed") {
    return c.json(
      { error: "invoice_not_paid", detail: `status=${payment.status}` },
      402,
    );
  }
  rec.paid = true;

  const body = await c.req.json().catch(() => ({}));
  return c.json({
    kind: "json",
    data: {
      echo: body,
      served_by: "fake-supplier",
      price_sats: PRICE_SATS,
    },
  });
});

app.get("/health", (c) => c.json({ ok: true, price_sats: PRICE_SATS }));

serve({ fetch: app.fetch, port: PORT }, (info) => {
  logger.info(
    { port: info.port, price_sats: PRICE_SATS },
    `fake-supplier listening on http://localhost:${info.port}/service`,
  );
});
