import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { CAPABILITY_TAGS } from "@agentmkt/contracts";

/**
 * Schema mirrors the data contracts in packages/contracts/src/index.ts.
 * If you change a column, update the contract type AND get team ack first
 * (P1 + P2 reviewers as per the README ownership rules).
 *
 * IDs are prefix-tagged strings ("worker_...", "job_...", etc.).
 * All sat amounts are integers — no floats, no msats, no BTC.
 * Timestamps stored as Postgres `timestamptz`; serialized to ISO 8601 strings
 * at API boundaries to match the contract types.
 */

// =========================================================================
// users
// =========================================================================
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// =========================================================================
// workers
// =========================================================================
export const workers = pgTable("workers", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["agent", "human"] }).notNull(),
  endpoint_url: text("endpoint_url"),
  telegram_chat_id: text("telegram_chat_id"),
  owner_user_id: text("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  display_name: text("display_name").notNull(),
  capability_tags: text("capability_tags", { enum: CAPABILITY_TAGS })
    .array()
    .notNull(),
  base_price_sats: integer("base_price_sats").notNull(),
  stake_sats: integer("stake_sats").notNull().default(0),
  source: text("source", { enum: ["internal", "402index"] })
    .notNull()
    .default("internal"),
  status: text("status", { enum: ["pending", "active", "suspended"] })
    .notNull()
    .default("pending"),
  listed_at: timestamp("listed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// =========================================================================
// jobs
// =========================================================================
export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  prompt: text("prompt").notNull(),
  budget_sats: integer("budget_sats").notNull(),
  locked_sats: integer("locked_sats").notNull().default(0),
  spent_sats: integer("spent_sats").notNull().default(0),
  status: text("status", {
    enum: [
      "intake",
      "planning",
      "awaiting_user",
      "executing",
      "completed",
      "failed",
      "cancelled",
    ],
  })
    .notNull()
    .default("intake"),
  created_at: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// =========================================================================
// plans
// =========================================================================
export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  job_id: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  total_estimate_sats: integer("total_estimate_sats").notNull(),
  assumptions: text("assumptions").array().notNull().default([]),
  status: text("status", {
    enum: ["draft", "approved", "rejected", "superseded"],
  })
    .notNull()
    .default("draft"),
  created_at: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// =========================================================================
// steps
// =========================================================================
export const steps = pgTable("steps", {
  id: text("id").primaryKey(),
  plan_id: text("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  dag_node: text("dag_node").notNull(),
  capability_tag: text("capability_tag", { enum: CAPABILITY_TAGS }).notNull(),
  primary_worker_id: text("primary_worker_id")
    .notNull()
    .references(() => workers.id, { onDelete: "restrict" }),
  fallback_ids: text("fallback_ids").array().notNull().default([]),
  estimate_sats: integer("estimate_sats").notNull(),
  ceiling_sats: integer("ceiling_sats").notNull(),
  depends_on: text("depends_on").array().notNull().default([]),
  human_required: boolean("human_required").notNull().default(false),
  optional: boolean("optional").notNull().default(false),
  status: text("status", {
    enum: ["pending", "running", "succeeded", "failed", "skipped"],
  })
    .notNull()
    .default("pending"),
  retries_left: integer("retries_left").notNull().default(2),
  result: jsonb("result"),
  error: text("error"),
});

// =========================================================================
// ratings
// =========================================================================
export const ratings = pgTable("ratings", {
  id: text("id").primaryKey(),
  worker_id: text("worker_id")
    .notNull()
    .references(() => workers.id, { onDelete: "cascade" }),
  capability_tag: text("capability_tag", { enum: CAPABILITY_TAGS }).notNull(),
  job_id: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  step_id: text("step_id")
    .notNull()
    .references(() => steps.id, { onDelete: "cascade" }),
  source: text("source", { enum: ["user", "verifier", "system"] }).notNull(),
  score: real("score").notNull(),
  reason: text("reason"),
  created_at: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// =========================================================================
// reputation_snapshots
// =========================================================================
export const reputation_snapshots = pgTable(
  "reputation_snapshots",
  {
    worker_id: text("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "cascade" }),
    capability_tag: text("capability_tag", { enum: CAPABILITY_TAGS }).notNull(),
    ewma: real("ewma").notNull(),
    total_jobs: integer("total_jobs").notNull().default(0),
    successful_jobs: integer("successful_jobs").notNull().default(0),
    last_updated: timestamp("last_updated", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({
      name: "reputation_snapshots_pk",
      columns: [t.worker_id, t.capability_tag],
    }),
  ],
);

// =========================================================================
// ledger_entries
// =========================================================================
export const ledger_entries = pgTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    job_id: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    step_id: text("step_id").references(() => steps.id, {
      onDelete: "set null",
    }),
    type: text("type", {
      enum: ["topup", "hold", "settle", "refund", "fee", "payout"],
    }).notNull(),
    amount_sats: integer("amount_sats").notNull(),
    bolt11: text("bolt11"),
    preimage: text("preimage"),
    hold_invoice_id: text("hold_invoice_id"),
    meta: jsonb("meta"),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("ledger_entries_job_idx").on(t.job_id),
    index("ledger_entries_hold_idx").on(t.hold_invoice_id),
    index("ledger_entries_bolt11_idx").on(t.bolt11),
    index("ledger_entries_type_idx").on(t.type),
  ],
);

// =========================================================================
// hold_invoices
// =========================================================================
export const hold_invoices = pgTable(
  "hold_invoices",
  {
    id: text("id").primaryKey(),
    job_id: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    step_id: text("step_id")
      .notNull()
      .references(() => steps.id, { onDelete: "cascade" }),
    amount_sats: integer("amount_sats").notNull(),
    bolt11: text("bolt11").notNull().default(""),
    status: text("status", {
      enum: [
        "pending",
        "held",
        "forwarding",
        "settled",
        "cancelled",
        "expired",
        "human_submitted",
      ],
    })
      .notNull()
      .default("held"),
    human_payout_bolt11: text("human_payout_bolt11"),
    human_submitted_result: jsonb("human_submitted_result"),
    paid_to_supplier_sats: integer("paid_to_supplier_sats"),
    fee_sats: integer("fee_sats"),
    preimage: text("preimage"),
    cancel_reason: text("cancel_reason"),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("hold_invoices_job_idx").on(t.job_id),
    index("hold_invoices_status_idx").on(t.status),
  ],
);

// P2 hub bookkeeping for topup status polling.
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
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("topup_invoices_job_idx").on(t.job_id),
    index("topup_invoices_payment_index_idx").on(t.payment_index),
  ],
);

// Backwards-compatible camelCase aliases for P2 hub code.
export const ledgerEntries = ledger_entries;
export const holdInvoices = hold_invoices;
