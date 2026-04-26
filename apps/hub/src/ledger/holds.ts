// =============================================================================
// Hold-invoice CRUD helpers.
//
// `hold_invoices` is the only mutable table the hub uses. State transitions
// here are MIRRORED into `ledger_entries` for an append-only audit trail —
// callers should not bypass the ledger postings module.
// =============================================================================

import { schema } from "@agentmkt/db";
import { db } from "@agentmkt/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { HoldStatus, JobId, StepId } from "@agentmkt/contracts";
import { HubError } from "../lib/errors.js";

export type HoldRow = typeof schema.holdInvoices.$inferSelect;

export async function createHold(input: {
  job_id: JobId;
  step_id: StepId;
  amount_sats: number;
  expires_at: Date;
  human_payout_bolt11?: string | null;
}): Promise<HoldRow> {
  const [row] = await db
    .insert(schema.holdInvoices)
    .values({
      id: randomUUID(),
      job_id: input.job_id,
      step_id: input.step_id,
      amount_sats: input.amount_sats,
      expires_at: input.expires_at,
      status: "held",
      bolt11: "",
      human_payout_bolt11: input.human_payout_bolt11 ?? null,
    })
    .returning();
  if (!row) throw new HubError(500, "hold_insert_failed");
  return row;
}

export async function getHold(hold_invoice_id: string): Promise<HoldRow> {
  const row = await db.query.holdInvoices.findFirst({
    where: (h, { eq }) => eq(h.id, hold_invoice_id),
  });
  if (!row) throw new HubError(404, "hold_not_found", hold_invoice_id);
  return row;
}

export async function updateHoldStatus(
  hold_invoice_id: string,
  status: HoldStatus,
  patch: Partial<typeof schema.holdInvoices.$inferInsert> = {},
): Promise<HoldRow> {
  const [row] = await db
    .update(schema.holdInvoices)
    .set({ ...patch, status, updated_at: new Date() })
    .where(eq(schema.holdInvoices.id, hold_invoice_id))
    .returning();
  if (!row) throw new HubError(404, "hold_not_found", hold_invoice_id);
  return row;
}

export function assertHoldStatus(
  hold: HoldRow,
  allowed: HoldStatus[],
  ctx: string,
): void {
  if (!allowed.includes(hold.status as HoldStatus)) {
    throw new HubError(
      409,
      "hold_state_invalid",
      `${ctx}: hold ${hold.id} is ${hold.status}, must be one of [${allowed.join(", ")}]`,
    );
  }
}
