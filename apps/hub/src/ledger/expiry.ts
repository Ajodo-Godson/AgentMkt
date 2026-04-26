import { db, schema } from "@agentmkt/db";
import { and, eq, isNull, lt } from "drizzle-orm";
import { recordPosting } from "./postings.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger({ component: "hold-expiry" });

export async function sweepExpiredHolds(now = new Date()): Promise<number> {
  const candidates = await db
    .select()
    .from(schema.holdInvoices)
    .where(
      and(
        eq(schema.holdInvoices.status, "held"),
        lt(schema.holdInvoices.expires_at, now),
        isNull(schema.holdInvoices.paid_to_supplier_sats),
      ),
    );

  let expired = 0;
  for (const candidate of candidates) {
    const [hold] = await db
      .update(schema.holdInvoices)
      .set({ status: "expired", updated_at: now, cancel_reason: "expired" })
      .where(
        and(
          eq(schema.holdInvoices.id, candidate.id),
          eq(schema.holdInvoices.status, "held"),
          lt(schema.holdInvoices.expires_at, now),
          isNull(schema.holdInvoices.paid_to_supplier_sats),
        ),
      )
      .returning();

    if (!hold) continue;
    await recordPosting({
      job_id: hold.job_id,
      step_id: hold.step_id,
      type: "refund",
      amount_sats: hold.amount_sats,
      hold_invoice_id: hold.id,
      meta: { reason: "hold_expired" },
    });
    expired += 1;
  }

  if (expired > 0) {
    log.info({ expired }, "expired held invoices");
  }
  return expired;
}

export function startHoldExpirySweeper(intervalMs = 60_000): NodeJS.Timeout {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await sweepExpiredHolds();
    } catch (err) {
      log.error({ err }, "hold expiry sweep failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void run(), intervalMs);
  timer.unref?.();
  void run();
  return timer;
}
