// POST /hub/forward
//
// Hub does the L402 handshake with the supplier, pays from already-held funds
// (price - fee), returns the supplier's response. The HTLC remains "held"
// from the orchestrator's perspective until /settle.

import { Hono } from "hono";
import * as z from "zod";
import { getHold, updateHoldStatus } from "../ledger/holds.js";
import { recordPosting } from "../ledger/postings.js";
import { computeFee } from "../policy/fee.js";
import { l402Forward } from "../lightning/l402-client.js";
import { jsonError, HubError } from "../lib/errors.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger({ component: "route:forward" });

const body = z.object({
  hold_invoice_id: z.string().uuid(),
  supplier_endpoint: z.string().url(),
  supplier_payload: z.unknown(),
});

export const forwardRoute = new Hono().post("/forward", async (c) => {
  try {
    const parsed = body.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "validation", detail: JSON.stringify(parsed.error.issues) },
        400,
      );
    }
    const { hold_invoice_id, supplier_endpoint, supplier_payload } = parsed.data;

    const hold = await getHold(hold_invoice_id);
    if (hold.status !== "held") {
      throw new HubError(
        409,
        "hold_state_invalid",
        `cannot forward for hold in status ${hold.status}`,
      );
    }
    if (hold.paid_to_supplier_sats !== null && hold.paid_to_supplier_sats > 0) {
      throw new HubError(
        409,
        "hold_already_forwarded",
        `hold ${hold_invoice_id} was already forwarded for ${hold.paid_to_supplier_sats} sats`,
      );
    }

    const ok = await l402Forward({
      supplier_endpoint,
      supplier_payload,
      ceiling_sats: hold.amount_sats,
      hold_invoice_id,
    });

    const paid_to_supplier_sats = ok.payment.paid_amount_sats;
    const fee_sats = computeFee(paid_to_supplier_sats);

    // Reasonability sanity: paid + fee should fit inside the ceiling.
    // (computeFee is internal so this is mostly to surface a config bug.)
    if (paid_to_supplier_sats + fee_sats > hold.amount_sats) {
      log.error(
        {
          hold_invoice_id,
          paid_to_supplier_sats,
          fee_sats,
          ceiling: hold.amount_sats,
        },
        "FATAL: paid+fee exceeds ceiling — should be impossible after pre-flight",
      );
    }

    // Persist payout + fee ledger entries. Settle is NOT recorded yet — the
    // orchestrator must call /settle to confirm bookkeeping.
    await recordPosting({
      job_id: hold.job_id,
      step_id: hold.step_id,
      type: "payout",
      amount_sats: paid_to_supplier_sats,
      hold_invoice_id,
      bolt11: ok.challenge.invoice,
      preimage: ok.payment.preimage,
      meta: {
        supplier_endpoint,
        payment_index: ok.payment.payment_index,
        routing_fee_sats: ok.payment.routing_fee_sats,
      },
    });
    if (fee_sats > 0) {
      await recordPosting({
        job_id: hold.job_id,
        step_id: hold.step_id,
        type: "fee",
        amount_sats: fee_sats,
        hold_invoice_id,
        meta: { policy: "flat_5pct" },
      });
    }

    // Update hold row with the actuals so /settle and /cancel can read them.
    await updateHoldStatus(hold_invoice_id, "held", {
      paid_to_supplier_sats,
      fee_sats,
      preimage: ok.payment.preimage,
    });

    return c.json({
      result: ok.result,
      paid_to_supplier_sats,
      fee_sats,
    });
  } catch (err) {
    return jsonError(c, err, log);
  }
});
