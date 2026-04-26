// =============================================================================
// Append-only ledger postings.
//
// EVERY balance-affecting state change in the hub MUST go through one of these
// helpers. No `UPDATE` statements on `ledger_entries`. Cross-references between
// related entries (hold + settle + payout + fee for one step) use
// `hold_invoice_id`.
// =============================================================================

import { schema } from "@agentmkt/db";
import type {
  JobId,
  LedgerEntryType,
  StepId,
} from "@agentmkt/contracts";
import { db } from "@agentmkt/db";
import { childLogger } from "../lib/logger.js";
import { HubError } from "../lib/errors.js";

const log = childLogger({ component: "ledger" });

export interface PostingInput {
  job_id: JobId;
  step_id: StepId | null;
  type: LedgerEntryType;
  amount_sats: number;
  hold_invoice_id?: string | null;
  bolt11?: string | null;
  preimage?: string | null;
  meta?: Record<string, unknown>;
}

function assertPositiveInt(n: number, field = "amount_sats"): void {
  if (!Number.isInteger(n) || n < 0) {
    throw new HubError(
      400,
      "invalid_amount",
      `${field} must be a non-negative integer, got ${n}`,
    );
  }
}

/**
 * Insert a single posting. All amounts must be non-negative integer sats; the
 * `type` field encodes whether this is a credit or a debit per spec section 5
 * (`amount_sats: number; // Always positive; type indicates direction`).
 */
export async function recordPosting(
  input: PostingInput,
): Promise<{ id: string }> {
  assertPositiveInt(input.amount_sats);
  const [row] = await db
    .insert(schema.ledgerEntries)
    .values({
      job_id: input.job_id,
      step_id: input.step_id ?? null,
      type: input.type,
      amount_sats: input.amount_sats,
      hold_invoice_id: input.hold_invoice_id ?? null,
      bolt11: input.bolt11 ?? null,
      preimage: input.preimage ?? null,
      meta: input.meta ?? null,
    })
    .returning({ id: schema.ledgerEntries.id });

  if (!row) throw new HubError(500, "ledger_insert_failed");
  log.info(
    {
      ledger_id: row.id,
      job_id: input.job_id,
      step_id: input.step_id,
      type: input.type,
      amount_sats: input.amount_sats,
    },
    "ledger posting recorded",
  );
  return row;
}

/**
 * Idempotent topup posting keyed by bolt11. Returns the existing entry id if
 * we've already recorded a topup for this invoice. Used by `/topup/status` so
 * repeated polls don't double-credit the buyer.
 */
export async function recordTopupIdempotent(input: {
  job_id: JobId;
  bolt11: string;
  amount_sats: number;
  preimage?: string | null;
  meta?: Record<string, unknown>;
}): Promise<{ id: string; created: boolean }> {
  assertPositiveInt(input.amount_sats);

  const existing = await db.query.ledgerEntries.findFirst({
    where: (e, { and, eq }) =>
      and(eq(e.type, "topup"), eq(e.bolt11, input.bolt11)),
  });

  if (existing) {
    log.debug({ ledger_id: existing.id }, "topup already recorded; skipping");
    return { id: existing.id, created: false };
  }

  const { id } = await recordPosting({
    job_id: input.job_id,
    step_id: null,
    type: "topup",
    amount_sats: input.amount_sats,
    bolt11: input.bolt11,
    preimage: input.preimage ?? null,
    meta: input.meta,
  });
  return { id, created: true };
}
