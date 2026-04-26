// POST /hub/topup
// POST /hub/topup/status

import { Hono } from "hono";
import * as z from "zod";
import { schema, db } from "@agentmkt/db";
import { lightningClient } from "../lightning/client.js";
import { recordTopupIdempotent } from "../ledger/postings.js";
import { jsonError } from "../lib/errors.js";
import { childLogger } from "../lib/logger.js";
import { env } from "../lib/env.js";

const log = childLogger({ component: "route:topup" });

const topupBody = z.object({
  job_id: z.string().min(1),
  amount_sats: z.number().int().positive(),
});

const topupStatusBody = z.object({
  bolt11: z.string().min(1),
});

export const topupRoute = new Hono()
  .post("/topup", async (c) => {
    try {
      const parsed = topupBody.safeParse(await c.req.json());
      if (!parsed.success) {
        return c.json(
          { error: "validation", detail: JSON.stringify(parsed.error.issues) },
          400,
        );
      }
      const { job_id, amount_sats } = parsed.data;

      const inv = await lightningClient.createInvoice({
        sats: amount_sats,
        description: `AgentMkt topup for ${job_id}`,
        expiresInSecs: env.HUB_DEFAULT_INVOICE_EXPIRY_SECS,
      });

      // Persist the bolt11 -> payment_index mapping so /topup/status can look
      // it up later. ON CONFLICT DO NOTHING is fine: if the buyer asked for
      // the same invoice twice (unlikely; Lexe gives unique bolt11s) we keep
      // the original.
      await db
        .insert(schema.topupInvoices)
        .values({
          bolt11: inv.invoice,
          job_id,
          amount_sats,
          payment_index: inv.index,
          payment_hash: inv.payment_hash,
          expires_at: new Date(inv.expires_at),
        })
        .onConflictDoNothing();

      log.info(
        { job_id, amount_sats, payment_index: inv.index },
        "topup invoice created",
      );

      return c.json({
        bolt11: inv.invoice,
        expires_at: new Date(inv.expires_at).toISOString(),
      });
    } catch (err) {
      return jsonError(c, err, log);
    }
  })

  .post("/topup/status", async (c) => {
    try {
      const parsed = topupStatusBody.safeParse(await c.req.json());
      if (!parsed.success) {
        return c.json(
          { error: "validation", detail: JSON.stringify(parsed.error.issues) },
          400,
        );
      }
      const { bolt11 } = parsed.data;

      const mapping = await db.query.topupInvoices.findFirst({
        where: (t, { eq }) => eq(t.bolt11, bolt11),
      });
      if (!mapping) {
        return c.json(
          {
            error: "topup_unknown",
            detail: "no topup invoice with that bolt11 was created by this hub",
          },
          404,
        );
      }

      const payment = await lightningClient.getPayment(mapping.payment_index);
      const paid = payment.status === "completed";
      if (!paid) {
        return c.json({ paid: false, amount_sats: 0 });
      }

      const amount_sats = payment.amount_sats || mapping.amount_sats;

      // Idempotent ledger write — repeated polls won't double-credit.
      await recordTopupIdempotent({
        job_id: mapping.job_id,
        bolt11,
        amount_sats,
        preimage: payment.preimage,
        meta: { payment_index: mapping.payment_index, payment_hash: mapping.payment_hash },
      });

      return c.json({ paid: true, amount_sats });
    } catch (err) {
      return jsonError(c, err, log);
    }
  });
