// GET /hub/admin/ledger?job_id=...

import { Hono } from "hono";
import { desc, eq, schema, db } from "@agentmkt/db";
import { computeJobBalance } from "../ledger/balance.js";
import { env } from "../lib/env.js";
import { jsonError, HubError } from "../lib/errors.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger({ component: "route:admin-ledger" });

function requireAdmin(auth: string | undefined): void {
  if (!env.HUB_ADMIN_TOKEN) {
    throw new HubError(503, "admin_token_unconfigured", "HUB_ADMIN_TOKEN is not set");
  }
  if (auth !== `Bearer ${env.HUB_ADMIN_TOKEN}`) {
    throw new HubError(401, "unauthorized", "missing or invalid admin token");
  }
}

export const adminLedgerRoute = new Hono().get("/admin/ledger", async (c) => {
  try {
    requireAdmin(c.req.header("authorization"));
    const job_id = c.req.query("job_id");
    if (!job_id) {
      return c.json({ error: "validation", detail: "job_id query param required" }, 400);
    }

    const [balance, entries] = await Promise.all([
      computeJobBalance(job_id),
      db
        .select({
          id: schema.ledgerEntries.id,
          job_id: schema.ledgerEntries.job_id,
          step_id: schema.ledgerEntries.step_id,
          type: schema.ledgerEntries.type,
          amount_sats: schema.ledgerEntries.amount_sats,
          hold_invoice_id: schema.ledgerEntries.hold_invoice_id,
          bolt11: schema.ledgerEntries.bolt11,
          preimage: schema.ledgerEntries.preimage,
          meta: schema.ledgerEntries.meta,
          created_at: schema.ledgerEntries.created_at,
        })
        .from(schema.ledgerEntries)
        .where(eq(schema.ledgerEntries.job_id, job_id))
        .orderBy(desc(schema.ledgerEntries.created_at)),
    ]);

    return c.json({
      job_id,
      balance,
      entries: entries.map((entry) => ({
        ...entry,
        created_at: entry.created_at.toISOString(),
      })),
    });
  } catch (err) {
    return jsonError(c, err, log);
  }
});
