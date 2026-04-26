// POST /hub/settle
//
// Two flows:
//
//   AGENT step:  /forward already paid the supplier during the L402 handshake.
//                /settle is a bookkeeping-only confirmation; we write a `settle`
//                ledger entry that "consumes" the held funds.
//
//   HUMAN step:  no payment has happened yet. /settle is when the human
//                actually gets paid: we call lexeClient.payInvoice on their
//                registered payout BOLT11, then write payout + fee + settle
//                entries.

import { Hono } from "hono";
import * as z from "zod";
import { getHold, updateHoldStatus } from "../ledger/holds.js";
import { recordPosting } from "../ledger/postings.js";
import { computeFee } from "../policy/fee.js";
import { lexeClient } from "../lightning/lexe-client.js";
import { jsonError, HubError } from "../lib/errors.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger({ component: "route:settle" });

const body = z.object({
  hold_invoice_id: z.string().uuid(),
});

export const settleRoute = new Hono().post("/settle", async (c) => {
  try {
    const parsed = body.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "validation", detail: JSON.stringify(parsed.error.issues) },
        400,
      );
    }
    const { hold_invoice_id } = parsed.data;

    const hold = await getHold(hold_invoice_id);

    // Idempotent: settling an already-settled hold is a no-op.
    if (hold.status === "settled") {
      log.info({ hold_invoice_id }, "hold already settled (idempotent)");
      return c.json({
        settled_sats: hold.paid_to_supplier_sats ?? 0,
        fee_sats: hold.fee_sats ?? 0,
      });
    }

    if (hold.status === "cancelled") {
      throw new HubError(
        409,
        "hold_already_cancelled",
        "cannot settle a cancelled hold",
      );
    }

    const isAgentSettle =
      hold.status === "held" &&
      hold.paid_to_supplier_sats !== null &&
      hold.paid_to_supplier_sats > 0;

    const isHumanSettle = hold.status === "human_submitted";

    if (!isAgentSettle && !isHumanSettle) {
      throw new HubError(
        409,
        "hold_state_invalid",
        `cannot settle hold in status ${hold.status} (paid_to_supplier_sats=${hold.paid_to_supplier_sats})`,
      );
    }

    let paid_to_supplier_sats: number;
    let fee_sats: number;
    let payout_preimage: string | null = null;
    let payment_index: string | null = null;

    if (isAgentSettle) {
      // Funds already moved during /forward. Just confirm.
      paid_to_supplier_sats = hold.paid_to_supplier_sats!;
      fee_sats = hold.fee_sats ?? computeFee(paid_to_supplier_sats);
    } else {
      // HUMAN settle: actually pay the human now.
      if (!hold.human_payout_bolt11) {
        throw new HubError(
          400,
          "human_payout_missing",
          `hold ${hold_invoice_id} has no human_payout_bolt11 — register one via /human-submit`,
        );
      }

      // Compute payout = ceiling - marketplace fee (rounded down).
      // Note: this is INTENTIONALLY different from agent flow. For agents,
      // the supplier set the price; for humans, the orchestrator set the
      // payout up-front in /notify-human and we deliver it minus our cut.
      fee_sats = computeFee(hold.amount_sats);
      paid_to_supplier_sats = hold.amount_sats - fee_sats;

      log.info(
        { hold_invoice_id, paying_sats: paid_to_supplier_sats, fee_sats },
        "paying human worker",
      );

      const pay = await lexeClient.payInvoice({
        bolt11: hold.human_payout_bolt11,
        note: `AgentMkt human payout for hold ${hold_invoice_id}`,
      });
      payment_index = pay.index;

      const finalized = await lexeClient.waitForPayment(pay.index, {
        timeoutMs: 60_000,
        intervalMs: 750,
      });
      if (finalized.status !== "completed") {
        throw new HubError(
          502,
          "human_payout_failed",
          `payment ${pay.index} ended in status ${finalized.status} (${finalized.status_msg ?? ""})`,
        );
      }
      payout_preimage =
        (finalized as unknown as { preimage?: string }).preimage ?? null;

      await recordPosting({
        job_id: hold.job_id,
        step_id: hold.step_id,
        type: "payout",
        amount_sats: paid_to_supplier_sats,
        hold_invoice_id,
        bolt11: hold.human_payout_bolt11,
        preimage: payout_preimage,
        meta: {
          kind: "human",
          payment_index,
        },
      });
      if (fee_sats > 0) {
        await recordPosting({
          job_id: hold.job_id,
          step_id: hold.step_id,
          type: "fee",
          amount_sats: fee_sats,
          hold_invoice_id,
          meta: { policy: "flat_5pct", kind: "human" },
        });
      }
    }

    // Write the settle entry. Settle amount = the held ceiling that's now
    // confirmed-spent (the difference between ceiling and paid+fee, if any,
    // implicitly stays "spent" too; orchestrator should /cancel the residual
    // separately if it wants a refund, but typically the hub uses the full
    // hold for human flows and only ceiling-minus-actual for agent flows).
    //
    // Per the ledger model, settle subtracts from held_sats. We settle the
    // FULL ceiling so held_sats returns to zero for this hold.
    await recordPosting({
      job_id: hold.job_id,
      step_id: hold.step_id,
      type: "settle",
      amount_sats: hold.amount_sats,
      hold_invoice_id,
      preimage: payout_preimage ?? hold.preimage ?? null,
      meta: {
        kind: isHumanSettle ? "human" : "agent",
        paid_to_supplier_sats,
        fee_sats,
      },
    });

    await updateHoldStatus(hold_invoice_id, "settled", {
      paid_to_supplier_sats,
      fee_sats,
      preimage: payout_preimage ?? hold.preimage ?? null,
    });

    return c.json({
      settled_sats: paid_to_supplier_sats,
      fee_sats,
    });
  } catch (err) {
    return jsonError(c, err, log);
  }
});
