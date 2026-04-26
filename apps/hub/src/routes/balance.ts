// GET /hub/job-balance/:job_id

import { Hono } from "hono";
import { computeJobBalance } from "../ledger/balance.js";
import { jsonError } from "../lib/errors.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger({ component: "route:balance" });

export const balanceRoute = new Hono().get("/job-balance/:job_id", async (c) => {
  try {
    const job_id = c.req.param("job_id");
    if (!job_id) {
      return c.json({ error: "validation", detail: "job_id required" }, 400);
    }
    const bal = await computeJobBalance(job_id);
    // Per spec section 6.2: shape is
    //   { topped_up_sats, held_sats, settled_sats, fees_sats, available_sats }
    // We also include `payouts_sats` as a non-spec extension (useful for the
    // demo dashboard); orchestrator can ignore.
    return c.json({
      topped_up_sats: bal.topped_up_sats,
      held_sats: bal.held_sats,
      settled_sats: bal.settled_sats,
      fees_sats: bal.fees_sats,
      available_sats: bal.available_sats,
      payouts_sats: bal.payouts_sats,
    });
  } catch (err) {
    return jsonError(c, err, log);
  }
});
