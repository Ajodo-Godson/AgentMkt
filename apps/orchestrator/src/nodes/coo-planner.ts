import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as z from "zod";
import { chatCompletion } from "@agentmkt/llm";
import { db, schema } from "@agentmkt/db";
import { CapabilityTagSchema } from "@agentmkt/contracts";
import type { Plan, Step, CapabilityTag } from "@agentmkt/contracts";
import { eq } from "drizzle-orm";
import { marketplace } from "../clients/marketplace.js";
import type { OrchestratorStateType } from "../state.js";
import { planStore, jobStore } from "../store.js";
import { logger } from "../logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const systemPrompt = readFileSync(
  join(__dirname, "../../prompts/coo-system.txt"),
  "utf8"
);

const MAX_ITERATIONS = 3;
const EXTERNAL_OWNER_USER_ID = "user_external_402index";

const PlannerOutputStepSchema = z.object({
  dag_node: z.string(),
  capability_tag: CapabilityTagSchema,
  primary_worker_id: z.string().nullable().transform((v) => v ?? ""),
  fallback_ids: z.array(z.string()).default([]),
  estimate_sats: z.number().int().transform((v) => Math.max(v, 100)),
  depends_on: z.array(z.string()).default([]),
  human_required: z.boolean().default(false),
  optional: z.boolean().default(false),
  spec: z.string().default(""),
});

const PlannerOutputSchema = z.object({
  steps: z.array(PlannerOutputStepSchema),
  total_estimate_sats: z.number().int(),
  assumptions: z.array(z.string()).default([]),
});

function buildPlanId(): string {
  return "plan_" + Math.random().toString(36).slice(2, 10);
}

function buildStepId(): string {
  return "step_" + Math.random().toString(36).slice(2, 10);
}

async function persistPlanSnapshot(
  plan: Plan,
  candidates: import("@agentmkt/contracts").WorkerCandidate[],
  existingPlanId?: string
): Promise<void> {
  const workerIds = new Set(
    plan.steps.flatMap((step) => [step.primary_worker_id, ...step.fallback_ids]).filter(Boolean)
  );
  const workersToPersist = candidates.filter((candidate) => workerIds.has(candidate.worker_id));

  await db.insert(schema.users).values({ id: EXTERNAL_OWNER_USER_ID }).onConflictDoNothing();

  if (workersToPersist.length > 0) {
    await db
      .insert(schema.workers)
      .values(
        workersToPersist.map((candidate) => ({
          id: candidate.worker_id,
          type: candidate.type,
          endpoint_url: candidate.type === "agent" ? candidate.endpoint_url ?? null : null,
          telegram_chat_id: null,
          owner_user_id: EXTERNAL_OWNER_USER_ID,
          display_name: candidate.display_name,
          capability_tags: candidate.capability_tags,
          base_price_sats: candidate.base_price_sats,
          stake_sats: 0,
          source: candidate.source,
          status: "active" as const,
        }))
      )
      .onConflictDoNothing();
  }

  if (existingPlanId) {
    await db
      .update(schema.plans)
      .set({ status: "superseded" })
      .where(eq(schema.plans.id, existingPlanId));
  }

  await db
    .insert(schema.plans)
    .values({
      id: plan.id,
      job_id: plan.job_id,
      version: plan.version,
      total_estimate_sats: plan.total_estimate_sats,
      assumptions: plan.assumptions,
      status: plan.status,
      created_at: new Date(plan.created_at),
    })
    .onConflictDoNothing();

  if (plan.steps.length > 0) {
    await db
      .insert(schema.steps)
      .values(
        plan.steps.map((step) => ({
          id: step.id,
          plan_id: plan.id,
          dag_node: step.dag_node,
          capability_tag: step.capability_tag,
          primary_worker_id: step.primary_worker_id,
          fallback_ids: step.fallback_ids,
          estimate_sats: step.estimate_sats,
          ceiling_sats: step.ceiling_sats,
          depends_on: step.depends_on,
          human_required: step.human_required,
          optional: step.optional,
          status: step.status,
          retries_left: step.retries_left,
          result: step.result ?? null,
          error: step.error ?? null,
        }))
      )
      .onConflictDoNothing();
  }
}

export async function cooPlannnerNode( // exported name kept for graph.ts import compatibility
  state: OrchestratorStateType
): Promise<Partial<OrchestratorStateType>> {
  const {
    job,
    wallet_balance_sats,
    requested_capability_tags,
    intake_intent,
    request_constraints,
  } = state;
  const iteration = (state.plan_iterations ?? 0) + 1;
  const log = logger.child({ job_id: job.id, node: "coo-planner", iteration });

  log.info("COO planner started");

  if (iteration > MAX_ITERATIONS) {
    log.error("Max planning iterations exceeded");
    const updated = { ...job, status: "failed" as const, updated_at: new Date().toISOString() };
    jobStore.set(job.id, updated);
    return { job: updated, error: "Could not produce a valid plan after 3 attempts." };
  }

  // Discover candidates only for capabilities the CEO extracted from the request.
  // Broad discovery invites the planner to invent unrelated steps.
  let candidates = state.candidates;
  if (candidates.length === 0) {
    const allTags = [
      "summarization", "translation_es", "translation_fr", "translation_de",
      "tts_en", "tts_fr", "voiceover_human",
      "creative_writing_human", "image_generation", "code_review", "fact_check",
    ] as CapabilityTag[];
    const discoveryTags =
      requested_capability_tags.length > 0 ? requested_capability_tags : allTags;
    try {
      const disc = await marketplace.discover({
        capability_tags: discoveryTags,
        limit: 10,
      });
      candidates = disc.candidates;
    } catch (err) {
      log.warn({ err }, "Marketplace discover failed, proceeding with empty candidates");
    }
  }

  // Internal workers don't require Lightning preimages — sort them first so the
  // LLM prefers them over external 402index workers.
  const sortedCandidates = [...candidates].sort((a, b) => {
    if (a.source === "internal" && b.source !== "internal") return -1;
    if (a.source !== "internal" && b.source === "internal") return 1;
    return 0;
  });

  const candidatesJson = JSON.stringify(sortedCandidates, null, 2);
  const userMessage = `User prompt: ${job.prompt}
CEO extracted intent: ${intake_intent ?? "not available"}
Requested capability tags: ${
  requested_capability_tags.length > 0
    ? requested_capability_tags.join(", ")
    : "not available"
}
Constraints: ${JSON.stringify(request_constraints ?? {})}
Wallet balance: ${wallet_balance_sats} sats (keep total plan cost well below this)

Available workers:
${candidatesJson}

${
  state.plan && state.cfo_verdict?.kind === "REVISE"
    ? `Previous plan was rejected: ${state.cfo_verdict.reason} — ${state.cfo_verdict.detail}
Please revise the plan to address this issue.`
    : ""
}

Prefer workers with source "internal" when they cover the required capability — they are more reliable. Use external workers (source "402index") only when no internal worker covers the capability.

Produce the execution plan as JSON.`;

  let lastError = "";
  let parsed: z.infer<typeof PlannerOutputSchema> | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    if (attempt > 0 && lastError) {
      messages.push({ role: "assistant", content: lastError });
      messages.push({
        role: "user",
        content: `Your previous response failed validation: ${lastError}\nPlease fix and return valid JSON only.`,
      });
    }

    try {
      const result = await chatCompletion(messages, { jsonMode: true, temperature: 0.1 });
      parsed = PlannerOutputSchema.parse(JSON.parse(result.content));
      break;
    } catch (err) {
      lastError = String(err);
      log.warn({ err, attempt }, "Plan parse failed, retrying");
    }
  }

  if (!parsed) {
    log.error("Plan parsing failed after retries");
    const updated = { ...job, status: "failed" as const, updated_at: new Date().toISOString() };
    jobStore.set(job.id, updated);
    return { job: updated, error: "COO could not produce a valid plan." };
  }

  // Build a lookup of internal workers by capability so we can override LLM choices.
  // Internal workers don't require Lightning preimages; external 402index workers do
  // and Lexe's sidecar doesn't expose preimages for outbound payments.
  const internalByCapability = new Map<string, string>();
  for (const c of candidates) {
    if (c.source === "internal") {
      for (const tag of c.capability_tags ?? []) {
        if (!internalByCapability.has(tag)) internalByCapability.set(tag, c.worker_id);
      }
    }
  }

  // Map dag_node references in depends_on to actual step IDs (assigned below)
  const dagNodeToStepId = new Map<string, string>();
  const steps: Step[] = parsed.steps.map((s) => {
    const stepId = buildStepId();
    dagNodeToStepId.set(s.dag_node, stepId);

    // Override: if an internal worker covers this capability, use it instead of
    // whatever the LLM picked. Put the LLM choice as first fallback.
    const internalWorker = internalByCapability.get(s.capability_tag);
    const primaryWorker = internalWorker ?? s.primary_worker_id;
    const fallbacks = internalWorker
      ? [s.primary_worker_id, ...s.fallback_ids].filter((id) => id && id !== internalWorker)
      : s.fallback_ids;

    return {
      id: stepId,
      plan_id: "", // filled after plan is created
      dag_node: s.dag_node,
      capability_tag: s.capability_tag as CapabilityTag,
      primary_worker_id: primaryWorker,
      fallback_ids: fallbacks,
      estimate_sats: s.estimate_sats,
      ceiling_sats: Math.ceil(s.estimate_sats * 1.1),
      depends_on: [], // resolved after all IDs assigned
      human_required: s.human_required,
      optional: s.optional,
      status: "pending",
      retries_left: 2,
    };
  });

  // Resolve depends_on dag_node → step_id
  parsed.steps.forEach((s, i) => {
    const step = steps[i];
    if (!step) return;
    step.depends_on = s.depends_on
      .map((dn) => dagNodeToStepId.get(dn))
      .filter((id): id is string => id !== undefined);
  });

  const existingPlan = state.plan;
  const plan: Plan = {
    id: buildPlanId(),
    job_id: job.id,
    version: existingPlan ? existingPlan.version + 1 : 1,
    steps: steps.map((s) => ({ ...s, plan_id: "" })),
    total_estimate_sats: parsed.total_estimate_sats,
    assumptions: parsed.assumptions,
    status: "draft",
    created_at: new Date().toISOString(),
  };

  // Backfill plan_id into steps
  steps.forEach((s) => {
    s.plan_id = plan.id;
  });
  plan.steps = steps;

  // Mark old plan superseded
  if (existingPlan) {
    planStore.set(existingPlan.id, { ...existingPlan, status: "superseded" });
  }
  planStore.set(plan.id, plan);

  try {
    await persistPlanSnapshot(plan, candidates, existingPlan?.id);
  } catch (err) {
    log.error({ err, plan_id: plan.id }, "Failed to persist plan snapshot");
    const updated = { ...job, status: "failed" as const, updated_at: new Date().toISOString() };
    jobStore.set(job.id, updated);
    return { job: updated, error: "COO produced a plan, but it could not be persisted." };
  }

  log.info({ plan_id: plan.id, steps: steps.length }, "Plan produced");

  return {
    plan,
    steps,
    candidates,
    plan_iterations: iteration,
  };
}
