// =============================================================================
// Per-job balance computation.
//
// The hub holds a multi-tenant escrow ledger; balances are derived purely
// from the append-only `ledger_entries` table — never stored as a single row.
//
// Model (per spec section 5 + 6.2):
//
//   topped_up_sats = sum(topup)
//   held_sats      = sum(hold)   - sum(settle) - sum(refund)
//   settled_sats   = sum(settle)
//   fees_sats      = sum(fee)
//   payouts_sats   = sum(payout)
//   available_sats = sum(topup) - sum(hold) + sum(refund)
//
// `payout` and `fee` are the breakdown of what already-settled funds were
// spent on (supplier payment + marketplace cut). They do not affect
// `available_sats` or `held_sats`; settle subsumes both of them.
// =============================================================================

import { schema } from "@agentmkt/db";
import { db } from "@agentmkt/db";
import { sql, eq } from "drizzle-orm";
import type { JobId, LedgerEntryType } from "@agentmkt/contracts";
import { HubError } from "../lib/errors.js";

export interface JobBalance {
  job_id: JobId;
  topped_up_sats: number;
  held_sats: number;
  settled_sats: number;
  fees_sats: number;
  payouts_sats: number;
  available_sats: number;
}

export async function computeJobBalance(job_id: JobId): Promise<JobBalance> {
  const rows = await db
    .select({
      type: schema.ledgerEntries.type,
      total: sql<string>`sum(${schema.ledgerEntries.amount_sats})`.as("total"),
    })
    .from(schema.ledgerEntries)
    .where(eq(schema.ledgerEntries.job_id, job_id))
    .groupBy(schema.ledgerEntries.type);

  const sums: Record<LedgerEntryType, number> = {
    topup: 0,
    hold: 0,
    settle: 0,
    refund: 0,
    fee: 0,
    payout: 0,
  };
  for (const r of rows) {
    if (!(r.type in sums)) continue;
    sums[r.type as LedgerEntryType] = Number.parseInt(r.total ?? "0", 10);
  }

  const topped_up_sats = sums.topup;
  const held_sats = sums.hold - sums.settle - sums.refund;
  const settled_sats = sums.settle;
  const fees_sats = sums.fee;
  const payouts_sats = sums.payout;
  const available_sats = sums.topup - sums.hold + sums.refund;

  if (held_sats < 0) {
    throw new HubError(
      500,
      "ledger_inconsistent",
      `held_sats negative for job ${job_id}: ${held_sats}`,
    );
  }
  if (available_sats < 0) {
    throw new HubError(
      500,
      "ledger_inconsistent",
      `available_sats negative for job ${job_id}: ${available_sats}`,
    );
  }

  return {
    job_id,
    topped_up_sats,
    held_sats,
    settled_sats,
    fees_sats,
    payouts_sats,
    available_sats,
  };
}

/** Cheap pre-flight check: does this job have enough available balance? */
export async function assertAvailable(
  job_id: JobId,
  required_sats: number,
): Promise<void> {
  const bal = await computeJobBalance(job_id);
  if (bal.available_sats < required_sats) {
    throw new HubError(
      402,
      "insufficient_funds",
      `job ${job_id} has ${bal.available_sats} sats available, needs ${required_sats}`,
    );
  }
}
