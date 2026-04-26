// POST /hub/human-submit
//
// Called by the tg-bot (P4) when a human worker submits their result through
// Telegram. We store the result on the hold and flip status to
// `human_submitted`. The orchestrator's verifier then decides /settle vs
// /cancel.

import { Hono } from "hono";
import * as z from "zod";
import { stepResultSchema } from "@agentmkt/contracts";
import { getHold, updateHoldStatus } from "../ledger/holds.js";
import { jsonError } from "../lib/errors.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger({ component: "route:human-submit" });

const body = z.object({
  hold_invoice_id: z.string().uuid(),
  result: stepResultSchema,
  // Non-spec optional: if the human registered their payout invoice via the
  // bot at submit time (rather than at hold time), accept it here.
  human_payout_bolt11: z.string().optional(),
});

export const humanSubmitRoute = new Hono().post("/human-submit", async (c) => {
  try {
    const parsed = body.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "validation", detail: JSON.stringify(parsed.error.issues) },
        400,
      );
    }
    const { hold_invoice_id, result, human_payout_bolt11 } = parsed.data;

    const hold = await getHold(hold_invoice_id);
    if (hold.status !== "held") {
      return c.json(
        {
          error: "hold_state_invalid",
          detail: `cannot submit for hold in status ${hold.status}`,
        },
        409,
      );
    }

    await updateHoldStatus(hold_invoice_id, "human_submitted", {
      human_submitted_result: result,
      human_payout_bolt11:
        human_payout_bolt11 ?? hold.human_payout_bolt11 ?? null,
    });

    log.info({ hold_invoice_id }, "human submission recorded");
    return c.json({ ok: true });
  } catch (err) {
    return jsonError(c, err, log);
  }
});
