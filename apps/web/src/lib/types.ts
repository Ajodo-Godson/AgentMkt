export type JobStatus = "intake" | "planning" | "awaiting_user" | "executing" | "completed" | "failed" | "cancelled";

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

export interface Job {
  id: string;
  user_id: string;
  prompt: string;
  budget_sats: number;
  locked_sats: number;
  spent_sats: number;
  status: JobStatus;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  job_id: string;
  version: number;
  steps: Step[];
  total_estimate_sats: number;
  assumptions: string[];
  status: "draft" | "approved" | "rejected" | "superseded";
  created_at: string;
}

export interface Step {
  id: string;
  plan_id: string;
  dag_node: string;
  capability_tag: CapabilityTag;
  primary_worker_id: string;
  fallback_ids: string[];
  estimate_sats: number;
  ceiling_sats: number;
  depends_on: string[];
  human_required: boolean;
  optional: boolean;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  retries_left: number;
  result?: StepResult;
  error?: string;
}

export type StepResult =
  | { kind: "json"; data: unknown }
  | { kind: "text"; text: string }
  | { kind: "file"; mime_type: string; storage_url: string };

export interface JobSnapshot {
  job: Job;
  plan: Plan | null;
  steps_progress: Step[];
}

export interface WorkerCandidate {
  id: string;
  displayName: string;
  type: "agent" | "human";
  rating: number;
  priceSats: number;
  successRate: number;
  latencyMs: number | null;
  source: "internal" | "402index";
  reason: string;
}

export type RoutePreference = "balanced" | "lowest_cost" | "highest_quality" | "fastest";
