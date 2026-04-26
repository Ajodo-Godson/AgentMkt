// =============================================================================
// @agentmkt/db — schema
//
// P3 owns this file. P2 added the two tables required by the hub
// (`ledger_entries` and `hold_invoices`) during phase 0 bootstrap.
//
// Rules (P3, please honor):
//   - Do NOT remove or rename the columns P2 wrote on these two tables; the
//     hub binds to them by name through Drizzle.
//   - You may APPEND new columns (e.g. add an index, add a metadata field) so
//     long as they are nullable or have a default.
//   - You may add new tables (workers, ratings, jobs, plans, steps, etc.)
//     freely below the P2 section.
// =============================================================================

import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core";

// -----------------------------------------------------------------------------
// Hub: ledger_entries (append-only)
// Mirrors `LedgerEntry` in @agentmkt/contracts.
// -----------------------------------------------------------------------------
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job_id: text("job_id").notNull(),
    step_id: text("step_id"), // nullable per contract
    type: text("type", {
      enum: ["topup", "hold", "settle", "refund", "fee", "payout"],
    }).notNull(),
    amount_sats: integer("amount_sats").notNull(),

    // Optional Lightning artifacts. Only populated when relevant:
    //   - topup:  bolt11 = the invoice the buyer paid (uniqueness key)
    //   - payout: bolt11 = the invoice we paid (supplier or human)
    //   - settle: preimage = the L402 preimage we obtained
    bolt11: text("bolt11"),
    preimage: text("preimage"),

    // Cross-reference to a hold (so we can group hold/settle/refund/payout/fee
    // entries by the hold they belong to).
    hold_invoice_id: uuid("hold_invoice_id"),

    // Free-form metadata: payment_index, supplier_endpoint, fee_bps, etc.
    meta: jsonb("meta"),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    job_idx: index("ledger_entries_job_idx").on(t.job_id),
    hold_idx: index("ledger_entries_hold_idx").on(t.hold_invoice_id),
    bolt11_idx: index("ledger_entries_bolt11_idx").on(t.bolt11),
    type_idx: index("ledger_entries_type_idx").on(t.type),
  }),
);

// -----------------------------------------------------------------------------
// Hub: hold_invoices (mutable status, but business state changes are also
// recorded as ledger_entries for an audit trail)
// Mirrors `HoldInvoice` in @agentmkt/contracts.
// -----------------------------------------------------------------------------
export const holdInvoices = pgTable(
  "hold_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job_id: text("job_id").notNull(),
    step_id: text("step_id").notNull(),

    // Ceiling reserved at /hold time.
    amount_sats: integer("amount_sats").notNull(),

    // For human steps where the human registered a payout BOLT11; "" otherwise.
    bolt11: text("bolt11").notNull().default(""),

    status: text("status", {
      enum: [
        "pending",
        "held",
        "settled",
        "cancelled",
        "expired",
        "human_submitted",
      ],
    })
      .notNull()
      .default("held"),

    // For human steps: the human's payout destination (BOLT11 invoice they
    // generate when accepting the task). For agent steps: null.
    human_payout_bolt11: text("human_payout_bolt11"),

    // For human steps: the result the human submitted via tg-bot.
    human_submitted_result: jsonb("human_submitted_result"),

    // After a successful /forward (agent steps): what we actually paid the
    // supplier and the marketplace fee we charged.
    paid_to_supplier_sats: integer("paid_to_supplier_sats"),
    fee_sats: integer("fee_sats"),

    // For agent steps: the L402 preimage we received from the supplier
    // payment, kept for receipts.
    preimage: text("preimage"),

    // Free reason text on cancel.
    cancel_reason: text("cancel_reason"),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    job_idx: index("hold_invoices_job_idx").on(t.job_id),
    status_idx: index("hold_invoices_status_idx").on(t.status),
  }),
);

// -----------------------------------------------------------------------------
// Hub: topup_invoices
//
// Maps a generated topup BOLT11 back to its Lexe payment_index so the
// orchestrator can poll /hub/topup/status with just the bolt11 string (per
// API contract section 6.2). One row per topup invoice; never updated.
// -----------------------------------------------------------------------------
export const topupInvoices = pgTable(
  "topup_invoices",
  {
    bolt11: text("bolt11").primaryKey(),
    job_id: text("job_id").notNull(),
    amount_sats: integer("amount_sats").notNull(),
    payment_index: text("payment_index").notNull(),
    payment_hash: text("payment_hash").notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    job_idx: index("topup_invoices_job_idx").on(t.job_id),
    payment_index_idx: index("topup_invoices_payment_index_idx").on(
      t.payment_index,
    ),
  }),
);

// -----------------------------------------------------------------------------
// END P2 section. P3 add tables (users, workers, ratings, jobs, plans, steps,
// reputation_snapshots, etc.) below this line.
// -----------------------------------------------------------------------------
