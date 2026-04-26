// POST /hub/notify-human

import { Hono } from "hono";
import * as z from "zod";
import { tgBot } from "../clients/tg-bot.js";
import { getHold } from "../ledger/holds.js";
import { jsonError } from "../lib/errors.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger({ component: "route:notify-human" });

const body = z.object({
  hold_invoice_id: z.string().uuid(),
  telegram_chat_id: z.string().min(1),
  brief: z.string().min(1),
  payout_sats: z.number().int().positive(),
});

export const notifyHumanRoute = new Hono().post("/notify-human", async (c) => {
  try {
    const parsed = body.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "validation", detail: JSON.stringify(parsed.error.issues) },
        400,
      );
    }
    const input = parsed.data;

    // Confirm the hold exists and is in a state that can accept human work.
    const hold = await getHold(input.hold_invoice_id);
    if (hold.status !== "held") {
      return c.json(
        {
          error: "hold_state_invalid",
          detail: `cannot notify human for hold in status ${hold.status}`,
        },
        409,
      );
    }
    // Sanity check that the orchestrator isn't asking us to promise more
    // than we're holding for them.
    if (input.payout_sats > hold.amount_sats) {
      return c.json(
        {
          error: "payout_exceeds_hold",
          detail: `payout_sats=${input.payout_sats} > hold ${hold.amount_sats}`,
        },
        400,
      );
    }

    const result = await tgBot.notify(input);
    log.info(
      {
        hold_invoice_id: input.hold_invoice_id,
        chat: input.telegram_chat_id,
        payout_sats: input.payout_sats,
      },
      "human notified",
    );
    return c.json(result);
  } catch (err) {
    return jsonError(c, err, log);
  }
});
