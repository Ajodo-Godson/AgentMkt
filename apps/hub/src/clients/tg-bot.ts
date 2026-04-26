// =============================================================================
// Tg-bot client (P2 -> P4).
//
// The hub calls POST /tg/notify on the bot when a human-required step needs
// to be delivered. When USE_MOCKS=true (default during phase 1), we just log.
// =============================================================================

import * as z from "zod";
import { env } from "../lib/env.js";
import { childLogger } from "../lib/logger.js";
import { HubError } from "../lib/errors.js";

const log = childLogger({ component: "tg-bot-client" });

export interface NotifyHumanInput {
  hold_invoice_id: string;
  telegram_chat_id: string;
  brief: string;
  payout_sats: number;
}

const notifyResponseSchema = z.object({ delivered: z.literal(true) });

export const tgBot = {
  async notify(input: NotifyHumanInput): Promise<{ delivered: true }> {
    if (env.USE_MOCKS) {
      log.info({ ...input, mode: "MOCK" }, "[mock tg-bot] would deliver brief");
      return { delivered: true };
    }

    const url = new URL("/tg/notify", env.TG_BOT_URL);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10_000),
    }).catch((err: unknown) => {
      log.error({ err }, "tg-bot unreachable");
      throw new HubError(
        502,
        "tg_bot_unreachable",
        `Could not reach tg-bot at ${env.TG_BOT_URL}`,
        err,
      );
    });

    if (!res.ok) {
      const body = await res.text();
      throw new HubError(
        502,
        "tg_bot_error",
        `${res.status} ${res.statusText}: ${body.slice(0, 200)}`,
      );
    }

    const parsed = notifyResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      throw new HubError(502, "tg_bot_bad_response", JSON.stringify(parsed.error.issues));
    }
    return parsed.data;
  },
};
