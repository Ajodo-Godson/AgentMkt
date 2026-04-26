// POST /hub/cancel

import { Hono } from "hono";
import * as z from "zod";
import { recordPosting } from "../ledger/postings.js";
import { getHold, updateHoldStatus } from "../ledger/holds.js";
import { jsonError } from "../lib/errors.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger({ component: "route:cancel" });

const cancelBody = z.object({
  hold_invoice_id: z.string().uuid(),
  reason: z.string().min(1),
});

export const cancelRoute = new Hono().post("/cancel", async (c) => {
  try {
    const parsed = cancelBody.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "validation", detail: JSON.stringify(parsed.error.issues) },
        400,
      );
    }
    const { hold_invoice_id, reason } = parsed.data;

    const hold = await getHold(hold_invoice_id);

    // Idempotent: cancelling an already-cancelled hold returns the prior
    // refund amount.
    if (hold.status === "cancelled") {
      log.info({ hold_invoice_id }, "hold already cancelled (idempotent)");
      return c.json({ refunded_sats: 0 });
    }
    if (hold.status === "settled") {
      return c.json(
        { error: "hold_already_settled", detail: hold_invoice_id },
        409,
      );
    }

    // Compute refund amount.
    //
    // Two cases per spec:
    //   - Agent step where /forward already paid the supplier: the funds are
    //     gone (we can't unpay Lightning). We write a `cancel_after_paid`
    //     marker to ledger meta but refund only the unspent portion (ceiling
    //     - paid_to_supplier - fee).
    //   - Otherwise: full refund of the held ceiling.
    let refunded_sats: number;
    let cancel_after_paid = false;

    if (hold.paid_to_supplier_sats !== null && hold.paid_to_supplier_sats > 0) {
      cancel_after_paid = true;
      const spent = hold.paid_to_supplier_sats + (hold.fee_sats ?? 0);
      refunded_sats = Math.max(0, hold.amount_sats - spent);
      log.warn(
        {
          hold_invoice_id,
          paid_to_supplier_sats: hold.paid_to_supplier_sats,
          fee_sats: hold.fee_sats,
          refunded_sats,
        },
        "cancel after paid: buyer eats the supplier payout",
      );
    } else {
      refunded_sats = hold.amount_sats;
    }

    if (refunded_sats > 0) {
      await recordPosting({
        job_id: hold.job_id,
        step_id: hold.step_id,
        type: "refund",
        amount_sats: refunded_sats,
        hold_invoice_id: hold.id,
        meta: { reason, cancel_after_paid },
      });
    }

    await updateHoldStatus(hold_invoice_id, "cancelled", {
      cancel_reason: reason,
    });

    return c.json({ refunded_sats });
  } catch (err) {
    return jsonError(c, err, log);
  }
});
