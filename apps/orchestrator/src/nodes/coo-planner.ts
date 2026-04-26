import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as z from "zod";
import { chatCompletion } from "@agentmkt/llm";
import { CapabilityTagSchema } from "@agentmkt/contracts";
import type { Plan, Step, CapabilityTag } from "@agentmkt/contracts";
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

export async function cooPlannnerNode( // exported name kept for graph.ts import compatibility
  state: OrchestratorStateType
): Promise<Partial<OrchestratorStateType>> {
  const { job, wallet_balance_sats } = state;
  const iteration = (state.plan_iterations ?? 0) + 1;
  const log = logger.child({ job_id: job.id, node: "coo-planner", iteration });

  log.info("COO planner started");

  if (iteration > MAX_ITERATIONS) {
    log.error("Max planning iterations exceeded");
    const updated = { ...job, status: "failed" as const, updated_at: new Date().toISOString() };
    jobStore.set(job.id, updated);
    return { job: updated, error: "Could not produce a valid plan after 3 attempts." };
  }

  // Discover candidates for each capability tag mentioned in the prompt.
  // We do a broad discovery to give the LLM a full picture.
  let candidates = state.candidates;
  if (candidates.length === 0) {
    const allTags = [
      "summarization", "translation_es", "translation_fr", "translation_de",
      "tts_en", "tts_fr", "voiceover_human",
      "creative_writing_human", "image_generation", "code_review", "fact_check",
    ] as CapabilityTag[];
    try {
      const disc = await marketplace.discover({
        capability_tags: allTags,
        limit: 10,
      });
      candidates = disc.candidates;
    } catch (err) {
      log.warn({ err }, "Marketplace discover failed, proceeding with empty candidates");
    }
  }

  const candidatesJson = JSON.stringify(candidates, null, 2);
  const userMessage = `User prompt: ${job.prompt}
Wallet balance: ${wallet_balance_sats} sats (keep total plan cost well below this)

Available workers:
${candidatesJson}

${
  state.plan && state.cfo_verdict?.kind === "REVISE"
    ? `Previous plan was rejected: ${state.cfo_verdict.reason} — ${state.cfo_verdict.detail}
Please revise the plan to address this issue.`
    : ""
}

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

  // Map dag_node references in depends_on to actual step IDs (assigned below)
  const dagNodeToStepId = new Map<string, string>();
  const steps: Step[] = parsed.steps.map((s) => {
    const stepId = buildStepId();
    dagNodeToStepId.set(s.dag_node, stepId);
    return {
      id: stepId,
      plan_id: "", // filled after plan is created
      dag_node: s.dag_node,
      capability_tag: s.capability_tag as CapabilityTag,
      primary_worker_id: s.primary_worker_id,
      fallback_ids: s.fallback_ids,
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
    steps[i].depends_on = s.depends_on
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

  log.info({ plan_id: plan.id, steps: steps.length }, "Plan produced");

  return {
    plan,
    steps,
    candidates,
    plan_iterations: iteration,
  };
}
