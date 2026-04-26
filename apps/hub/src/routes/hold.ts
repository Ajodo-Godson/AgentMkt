// POST /hub/hold

import { Hono } from "hono";
import * as z from "zod";
import { recordPosting } from "../ledger/postings.js";
import { computeJobBalance } from "../ledger/balance.js";
import { createHold } from "../ledger/holds.js";
import { jsonError } from "../lib/errors.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger({ component: "route:hold" });

const holdBody = z.object({
  job_id: z.string().min(1),
  step_id: z.string().min(1),
  ceiling_sats: z.number().int().positive(),
  // Non-spec optional: used only when the orchestrator already knows the step
  // is human-required and wants to attach the human's payout BOLT11 up front.
  human_payout_bolt11: z.string().optional(),
});

export const holdRoute = new Hono().post("/hold", async (c) => {
  try {
    const parsed = holdBody.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "validation", detail: JSON.stringify(parsed.error.issues) },
        400,
      );
    }
    const { job_id, step_id, ceiling_sats, human_payout_bolt11 } = parsed.data;

    const bal = await computeJobBalance(job_id);
    if (bal.available_sats < ceiling_sats) {
      log.warn(
        { job_id, available: bal.available_sats, ceiling_sats },
        "insufficient funds for hold",
      );
      return c.json(
        {
          error: "insufficient_funds",
          detail: `job has ${bal.available_sats} sats available, needs ${ceiling_sats}`,
        },
        402,
      );
    }

    // 24h expiry — generous for the hackathon. The orchestrator's retry budget
    // (max 2 retries per step, ~30s each) is well under this.
    const expires_at = new Date(Date.now() + 24 * 3600 * 1000);

    const hold = await createHold({
      job_id,
      step_id,
      amount_sats: ceiling_sats,
      expires_at,
      human_payout_bolt11: human_payout_bolt11 ?? null,
    });

    await recordPosting({
      job_id,
      step_id,
      type: "hold",
      amount_sats: ceiling_sats,
      hold_invoice_id: hold.id,
      meta: human_payout_bolt11 ? { human_required: true } : undefined,
    });

    log.info(
      { job_id, step_id, hold_invoice_id: hold.id, ceiling_sats },
      "hold created",
    );

    return c.json({
      hold_invoice_id: hold.id,
      // Per spec section 5: HoldInvoice.bolt11. For agent holds we don't
      // generate a Lightning invoice (it's a logical reservation), so we
      // return an empty string. The orchestrator can ignore this field.
      bolt11: "",
    });
  } catch (err) {
    return jsonError(c, err, log);
  }
});
