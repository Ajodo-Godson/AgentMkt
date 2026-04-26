// =============================================================================
// @agentmkt/contracts
//
// SHARED — TypeScript types only. NO logic.
//
// MINIMAL bootstrap by P2 (Phase 0). P1 owns this file going forward.
// Other workstreams: append your types below; do NOT modify or rename
// anything P2 added (the hub depends on the exact field names).
//
// Rules (from spec section 5):
//   - Do NOT add fields without team-wide ack.
//   - Do NOT rename fields.
//   - Do NOT change semantics (e.g., never make sats a float).
//   - All money values are `number` representing whole sats. No floats, no
//     msats, no BTC.
//   - All timestamps are ISO 8601 strings.
// =============================================================================

import * as z from "zod";

// -----------------------------------------------------------------------------
// IDs (all strings, prefix-tagged for grep-ability)
// -----------------------------------------------------------------------------
export type JobId = string; // "job_..."
export type PlanId = string; // "plan_..."
export type StepId = string; // "step_..."
export type WorkerId = string; // "worker_..."
export type UserId = string; // "user_..."
export type RatingId = string; // "rating_..."
export type LedgerId = string; // "ledger_..."

// -----------------------------------------------------------------------------
// Capability tags (closed enum — extend only via PR with team ack)
// P1/P3: expand as needed.
// -----------------------------------------------------------------------------
export type CapabilityTag =
  | "summarization"
  | "translation_es"
  | "translation_fr"
  | "translation_de"
  | "tts_en"
  | "tts_fr"
  | "image_generation"
  | "code_review"
  | "fact_check"
  | "voiceover_human"
  | "creative_writing_human";

// -----------------------------------------------------------------------------
// Step results (used by hub for /human-submit and supplier responses)
// -----------------------------------------------------------------------------
export type StepResult =
  | { kind: "json"; data: unknown }
  | { kind: "text"; text: string }
  | { kind: "file"; mime_type: string; storage_url: string };

export const stepResultSchema: z.ZodType<StepResult> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("json"), data: z.unknown() }),
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({
    kind: z.literal("file"),
    mime_type: z.string(),
    storage_url: z.string().url(),
  }),
]);

// -----------------------------------------------------------------------------
// Hub / Ledger
// -----------------------------------------------------------------------------
export type LedgerEntryType =
  | "topup"
  | "hold"
  | "settle"
  | "refund"
  | "fee"
  | "payout";

export interface LedgerEntry {
  id: LedgerId;
  job_id: JobId;
  step_id: StepId | null;
  type: LedgerEntryType;
  amount_sats: number; // Always positive; type indicates direction.
  bolt11?: string; // Invoice if applicable.
  preimage?: string; // Settled HTLCs only.
  created_at: string;
}

export type HoldStatus =
  | "pending"
  | "held"
  | "settled"
  | "cancelled"
  | "expired"
  | "human_submitted";

export interface HoldInvoice {
  id: string; // Hub-generated.
  job_id: JobId;
  step_id: StepId;
  amount_sats: number; // Ceiling reserved at /hold time.
  bolt11: string; // For human steps where we generate a payout invoice; "" for agent holds.
  status: HoldStatus;
  created_at: string;
  expires_at: string;
}

// -----------------------------------------------------------------------------
// Job / Plan / Step (added by P1 — DO NOT REMOVE the hub-related types above)
// -----------------------------------------------------------------------------
//
// P1 TODO: paste the full Job/Plan/Step/CfoVerdict/Worker/Rating/etc. types
// from spec section 5 here. The hub does not import any of them, so leaving
// them out for now is fine.
