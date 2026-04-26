import * as z from "zod";

// =========================================================================
// IDs (all strings, prefix-tagged for grep-ability)
// =========================================================================
export type JobId = string; // "job_..."
export type PlanId = string; // "plan_..."
export type StepId = string; // "step_..."
export type WorkerId = string; // "worker_..."
export type UserId = string; // "user_..."
export type RatingId = string; // "rating_..."
export type LedgerId = string; // "ledger_..."

// =========================================================================
// Capability tags (closed enum — extend only via PR with team ack)
// =========================================================================
export const CAPABILITY_TAGS = [
  "summarization",
  "translation_es",
  "translation_fr",
  "translation_de",
  "tts_en",
  "tts_fr",
  "image_generation",
  "code_review",
  "fact_check",
  "voiceover_human",
  "creative_writing_human",
] as const;

export type CapabilityTag = (typeof CAPABILITY_TAGS)[number];

export const CapabilityTagSchema = z.enum(CAPABILITY_TAGS);

// =========================================================================
// Job lifecycle
// =========================================================================
export const JobStatusSchema = z.enum([
  "intake",
  "planning",
  "awaiting_user",
  "executing",
  "completed",
  "failed",
  "cancelled",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export interface Job {
  id: JobId;
  user_id: UserId;
  prompt: string;
  budget_sats: number;
  locked_sats: number;
  spent_sats: number;
  status: JobStatus;
  created_at: string;
  updated_at: string;
}

export const JobSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  prompt: z.string(),
  budget_sats: z.number().int().nonnegative(),
  locked_sats: z.number().int().nonnegative(),
  spent_sats: z.number().int().nonnegative(),
  status: JobStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
}) satisfies z.ZodType<Job>;

// =========================================================================
// Plan + Steps
// =========================================================================
export const StepResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("json"), data: z.unknown() }),
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({
    kind: z.literal("file"),
    mime_type: z.string(),
    storage_url: z.string(),
  }),
]);

export type StepResult = z.infer<typeof StepResultSchema>;

export const StepStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
]);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export interface Step {
  id: StepId;
  plan_id: PlanId;
  dag_node: string;
  capability_tag: CapabilityTag;
  primary_worker_id: WorkerId;
  fallback_ids: WorkerId[];
  estimate_sats: number;
  ceiling_sats: number;
  depends_on: StepId[];
  human_required: boolean;
  optional: boolean;
  status: StepStatus;
  retries_left: number;
  result?: StepResult;
  error?: string;
}

export const StepSchema = z.object({
  id: z.string(),
  plan_id: z.string(),
  dag_node: z.string(),
  capability_tag: CapabilityTagSchema,
  primary_worker_id: z.string(),
  fallback_ids: z.array(z.string()),
  estimate_sats: z.number().int().nonnegative(),
  ceiling_sats: z.number().int().nonnegative(),
  depends_on: z.array(z.string()),
  human_required: z.boolean(),
  optional: z.boolean(),
  status: StepStatusSchema,
  retries_left: z.number().int().nonnegative(),
  result: StepResultSchema.optional(),
  error: z.string().optional(),
}) satisfies z.ZodType<Step>;

export const PlanStatusSchema = z.enum([
  "draft",
  "approved",
  "rejected",
  "superseded",
]);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export interface Plan {
  id: PlanId;
  job_id: JobId;
  version: number;
  steps: Step[];
  total_estimate_sats: number;
  assumptions: string[];
  status: PlanStatus;
  created_at: string;
}

export const PlanSchema = z.object({
  id: z.string(),
  job_id: z.string(),
  version: z.number().int().nonnegative(),
  steps: z.array(StepSchema),
  total_estimate_sats: z.number().int().nonnegative(),
  assumptions: z.array(z.string()),
  status: PlanStatusSchema,
  created_at: z.string(),
}) satisfies z.ZodType<Plan>;

// =========================================================================
// CFO verdicts
// =========================================================================
export const CfoVerdictSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("APPROVED") }),
  z.object({
    kind: z.literal("REVISE"),
    reason: z.enum(["over_budget", "step_too_large", "untrusted_worker"]),
    detail: z.string(),
  }),
  z.object({ kind: z.literal("USER_CONFIRM"), summary: z.string() }),
]);
export type CfoVerdict = z.infer<typeof CfoVerdictSchema>;

// =========================================================================
// Workers
// =========================================================================
export const WorkerTypeSchema = z.enum(["agent", "human"]);
export type WorkerType = z.infer<typeof WorkerTypeSchema>;

export const WorkerSourceSchema = z.enum(["internal", "402index"]);
export type WorkerSource = z.infer<typeof WorkerSourceSchema>;

export const WorkerStatusSchema = z.enum(["pending", "active", "suspended"]);
export type WorkerStatus = z.infer<typeof WorkerStatusSchema>;

export interface Worker {
  id: WorkerId;
  type: WorkerType;
  endpoint_url: string | null;
  telegram_chat_id: string | null;
  owner_user_id: UserId;
  display_name: string;
  capability_tags: CapabilityTag[];
  base_price_sats: number;
  stake_sats: number;
  source: WorkerSource;
  status: WorkerStatus;
  listed_at: string;
}

export const WorkerSchema = z.object({
  id: z.string(),
  type: WorkerTypeSchema,
  endpoint_url: z.string().nullable(),
  telegram_chat_id: z.string().nullable(),
  owner_user_id: z.string(),
  display_name: z.string(),
  capability_tags: z.array(CapabilityTagSchema),
  base_price_sats: z.number().int().nonnegative(),
  stake_sats: z.number().int().nonnegative(),
  source: WorkerSourceSchema,
  status: WorkerStatusSchema,
  listed_at: z.string(),
}) satisfies z.ZodType<Worker>;

// =========================================================================
// Reputation
// =========================================================================
export const RatingSourceSchema = z.enum(["user", "verifier", "system"]);
export type RatingSource = z.infer<typeof RatingSourceSchema>;

export interface Rating {
  id: RatingId;
  worker_id: WorkerId;
  capability_tag: CapabilityTag;
  job_id: JobId;
  step_id: StepId;
  source: RatingSource;
  score: number;
  reason?: string;
  created_at: string;
}

export const RatingSchema = z.object({
  id: z.string(),
  worker_id: z.string(),
  capability_tag: CapabilityTagSchema,
  job_id: z.string(),
  step_id: z.string(),
  source: RatingSourceSchema,
  score: z.number(),
  reason: z.string().optional(),
  created_at: z.string(),
}) satisfies z.ZodType<Rating>;

export interface ReputationSnapshot {
  worker_id: WorkerId;
  capability_tag: CapabilityTag;
  ewma: number;
  total_jobs: number;
  successful_jobs: number;
  last_updated: string;
}

export const ReputationSnapshotSchema = z.object({
  worker_id: z.string(),
  capability_tag: CapabilityTagSchema,
  ewma: z.number(),
  total_jobs: z.number().int().nonnegative(),
  successful_jobs: z.number().int().nonnegative(),
  last_updated: z.string(),
}) satisfies z.ZodType<ReputationSnapshot>;

// =========================================================================
// Verification
// =========================================================================
export const VerifierVerdictSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("PASS"),
    confidence: z.number(),
    reason: z.string().optional(),
  }),
  z.object({ kind: z.literal("FAIL_RETRYABLE"), reason: z.string() }),
  z.object({ kind: z.literal("FAIL_FATAL"), reason: z.string() }),
]);
export type VerifierVerdict = z.infer<typeof VerifierVerdictSchema>;

// =========================================================================
// Hub / Ledger
// =========================================================================
export const LedgerEntryTypeSchema = z.enum([
  "topup",
  "hold",
  "settle",
  "refund",
  "fee",
  "payout",
]);
export type LedgerEntryType = z.infer<typeof LedgerEntryTypeSchema>;

export interface LedgerEntry {
  id: LedgerId;
  job_id: JobId;
  step_id: StepId | null;
  type: LedgerEntryType;
  amount_sats: number;
  bolt11?: string;
  preimage?: string;
  created_at: string;
}

export const LedgerEntrySchema = z.object({
  id: z.string(),
  job_id: z.string(),
  step_id: z.string().nullable(),
  type: LedgerEntryTypeSchema,
  amount_sats: z.number().int().nonnegative(),
  bolt11: z.string().optional(),
  preimage: z.string().optional(),
  created_at: z.string(),
}) satisfies z.ZodType<LedgerEntry>;

export const HoldInvoiceStatusSchema = z.enum([
  "pending",
  "held",
  "settled",
  "cancelled",
  "expired",
]);
export type HoldInvoiceStatus = z.infer<typeof HoldInvoiceStatusSchema>;

export interface HoldInvoice {
  id: string;
  job_id: JobId;
  step_id: StepId;
  amount_sats: number;
  bolt11: string;
  status: HoldInvoiceStatus;
  created_at: string;
  expires_at: string;
}

export const HoldInvoiceSchema = z.object({
  id: z.string(),
  job_id: z.string(),
  step_id: z.string(),
  amount_sats: z.number().int().nonnegative(),
  bolt11: z.string(),
  status: HoldInvoiceStatusSchema,
  created_at: z.string(),
  expires_at: z.string(),
}) satisfies z.ZodType<HoldInvoice>;

// =========================================================================
// API request / response schemas
// (Section 6 of the README — verbatim. Do not invent endpoints.)
// =========================================================================

// ---- Marketplace: /discover ----
export const DiscoverRequestSchema = z.object({
  capability_tags: z.array(CapabilityTagSchema).min(1),
  max_price_sats: z.number().int().positive().optional(),
  min_rating: z.number().min(0).max(5).optional(),
  include_external: z.boolean().optional().default(true),
  limit: z.number().int().positive().max(50).optional().default(5),
});
export type DiscoverRequest = z.infer<typeof DiscoverRequestSchema>;

export const WorkerCandidateSchema = z.object({
  worker_id: z.string(),
  display_name: z.string(),
  capability_tags: z.array(CapabilityTagSchema),
  base_price_sats: z.number().int().nonnegative(),
  ewma: z.number(),
  total_jobs: z.number().int().nonnegative(),
  source: WorkerSourceSchema,
  endpoint_url: z.string().nullable(),
  type: WorkerTypeSchema,
});
export type WorkerCandidate = z.infer<typeof WorkerCandidateSchema>;

export const DiscoverResponseSchema = z.object({
  candidates: z.array(WorkerCandidateSchema),
});
export type DiscoverResponse = z.infer<typeof DiscoverResponseSchema>;

// ---- Marketplace: /workers ----
export const ListWorkerRequestSchema = z
  .object({
    type: WorkerTypeSchema,
    endpoint_url: z.string().url().optional(),
    telegram_chat_id: z.string().optional(),
    owner_user_id: z.string(),
    display_name: z.string().min(1),
    capability_tags: z.array(CapabilityTagSchema).min(1),
    base_price_sats: z.number().int().positive(),
    stake_sats: z.number().int().nonnegative().optional().default(0),
  })
  .refine(
    (v) =>
      (v.type === "agent" && !!v.endpoint_url) ||
      (v.type === "human" && !!v.telegram_chat_id),
    {
      message:
        "agent workers require endpoint_url; human workers require telegram_chat_id",
    },
  );
export type ListWorkerRequest = z.infer<typeof ListWorkerRequestSchema>;

// ---- Marketplace: /ratings ----
export const RatingRequestSchema = z.object({
  worker_id: z.string(),
  capability_tag: CapabilityTagSchema,
  job_id: z.string(),
  step_id: z.string(),
  source: RatingSourceSchema,
  score: z.number(),
  reason: z.string().optional(),
});
export type RatingRequest = z.infer<typeof RatingRequestSchema>;

export const RatingResponseSchema = z.object({
  rating_id: z.string(),
  new_ewma: z.number(),
});
export type RatingResponse = z.infer<typeof RatingResponseSchema>;

// ---- Marketplace: /verify ----
export const VerifyRequestSchema = z.object({
  capability_tag: CapabilityTagSchema,
  spec: z.string(),
  result: StepResultSchema,
});
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

export const VerifyResponseSchema = z.object({
  verdict: VerifierVerdictSchema,
});
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;

// ---- Orchestrator: /jobs ----
export const CreateJobRequestSchema = z.object({
  user_id: z.string(),
  prompt: z.string().min(1),
  budget_sats: z.number().int().positive(),
});
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;

export const CreateJobResponseSchema = z.object({ job_id: z.string() });
export type CreateJobResponse = z.infer<typeof CreateJobResponseSchema>;

export const GetJobResponseSchema = z.object({
  job: JobSchema,
  plan: PlanSchema.nullable(),
  steps_progress: z.array(StepSchema),
});
export type GetJobResponse = z.infer<typeof GetJobResponseSchema>;

export const ClarifyRequestSchema = z.object({ answer: z.string() });
export type ClarifyRequest = z.infer<typeof ClarifyRequestSchema>;

export const ConfirmRequestSchema = z.object({ confirmed: z.boolean() });
export type ConfirmRequest = z.infer<typeof ConfirmRequestSchema>;

// ---- Hub ----
export const TopupRequestSchema = z.object({
  job_id: z.string(),
  amount_sats: z.number().int().positive(),
});
export type TopupRequest = z.infer<typeof TopupRequestSchema>;

export const TopupResponseSchema = z.object({
  bolt11: z.string(),
  expires_at: z.string(),
});
export type TopupResponse = z.infer<typeof TopupResponseSchema>;

export const TopupStatusRequestSchema = z.object({ bolt11: z.string() });
export const TopupStatusResponseSchema = z.object({
  paid: z.boolean(),
  amount_sats: z.number().int().nonnegative(),
});

export const HoldRequestSchema = z.object({
  job_id: z.string(),
  step_id: z.string(),
  ceiling_sats: z.number().int().positive(),
});
export type HoldRequest = z.infer<typeof HoldRequestSchema>;

export const HoldResponseSchema = z.object({
  hold_invoice_id: z.string(),
  bolt11: z.string(),
});
export type HoldResponse = z.infer<typeof HoldResponseSchema>;

export const ForwardRequestSchema = z.object({
  hold_invoice_id: z.string(),
  supplier_endpoint: z.string().url(),
  supplier_payload: z.unknown(),
});
export type ForwardRequest = z.infer<typeof ForwardRequestSchema>;

export const ForwardResponseSchema = z.object({
  result: z.unknown(),
  paid_to_supplier_sats: z.number().int().nonnegative(),
  fee_sats: z.number().int().nonnegative(),
});
export type ForwardResponse = z.infer<typeof ForwardResponseSchema>;

export const SettleRequestSchema = z.object({ hold_invoice_id: z.string() });
export const SettleResponseSchema = z.object({
  settled_sats: z.number().int().nonnegative(),
  fee_sats: z.number().int().nonnegative(),
});

export const CancelRequestSchema = z.object({
  hold_invoice_id: z.string(),
  reason: z.string(),
});
export const CancelResponseSchema = z.object({
  refunded_sats: z.number().int().nonnegative(),
});

export const NotifyHumanRequestSchema = z.object({
  hold_invoice_id: z.string(),
  telegram_chat_id: z.string(),
  brief: z.string(),
  payout_sats: z.number().int().positive(),
});
export type NotifyHumanRequest = z.infer<typeof NotifyHumanRequestSchema>;

export const HumanSubmitRequestSchema = z.object({
  hold_invoice_id: z.string(),
  result: StepResultSchema,
});
export type HumanSubmitRequest = z.infer<typeof HumanSubmitRequestSchema>;

export const JobBalanceResponseSchema = z.object({
  topped_up_sats: z.number().int().nonnegative(),
  held_sats: z.number().int().nonnegative(),
  settled_sats: z.number().int().nonnegative(),
  fees_sats: z.number().int().nonnegative(),
  available_sats: z.number().int().nonnegative(),
});
export type JobBalanceResponse = z.infer<typeof JobBalanceResponseSchema>;

// ---- Telegram bot ----
export const TgNotifyRequestSchema = NotifyHumanRequestSchema;
export type TgNotifyRequest = z.infer<typeof TgNotifyRequestSchema>;

// ---- Generic error envelope ----
export const ApiErrorSchema = z.object({
  error: z.string(),
  detail: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
