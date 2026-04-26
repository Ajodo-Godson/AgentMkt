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
import type { JobId, LedgerEntryType, UserId } from "@agentmkt/contracts";
import { HubError } from "../lib/errors.js";

export interface WalletBalance {
  user_id: UserId;
  topped_up_sats: number;
  held_sats: number;
  settled_sats: number;
  fees_sats: number;
  payouts_sats: number;
  available_sats: number;
}

async function getUserIdForJob(job_id: JobId): Promise<UserId> {
  const job = await db.query.jobs.findFirst({
    where: (j, { eq }) => eq(j.id, job_id),
    columns: { user_id: true },
  });

  if (!job) {
    throw new HubError(404, "job_not_found", `job ${job_id} not found`);
  }

  return job.user_id;
}

export async function computeUserBalance(user_id: UserId): Promise<WalletBalance> {
  const rows = await db
    .select({
      type: schema.ledgerEntries.type,
      total: sql<string>`sum(${schema.ledgerEntries.amount_sats})`.as("total"),
    })
    .from(schema.ledgerEntries)
    .innerJoin(schema.jobs, eq(schema.ledgerEntries.job_id, schema.jobs.id))
    .where(eq(schema.jobs.user_id, user_id))
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
      `held_sats negative for user ${user_id}: ${held_sats}`,
    );
  }
  if (available_sats < 0) {
    throw new HubError(
      500,
      "ledger_inconsistent",
      `available_sats negative for user ${user_id}: ${available_sats}`,
    );
  }

  return {
    user_id,
    topped_up_sats,
    held_sats,
    settled_sats,
    fees_sats,
    payouts_sats,
    available_sats,
  };
}

export async function computeJobBalance(job_id: JobId): Promise<WalletBalance> {
  const user_id = await getUserIdForJob(job_id);
  return computeUserBalance(user_id);
}

/** Cheap pre-flight check: does this job have enough available balance? */
export async function assertAvailable(
  job_id: JobId,
  required_sats: number,
): Promise<void> {
  const bal = await computeJobBalance(job_id);
  if (bal.available_sats < required_sats) {
    const user_id = await getUserIdForJob(job_id);
    throw new HubError(
      402,
      "insufficient_funds",
      `user ${user_id} has ${bal.available_sats} sats available, needs ${required_sats}`,
    );
  }
}
