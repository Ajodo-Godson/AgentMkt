// Pure function. NO LLM call. Rules are verbatim from section 7.1 task 5.
import { interrupt } from "@langchain/langgraph";
import type { CfoVerdict, Step } from "@agentmkt/contracts";
import type { OrchestratorStateType } from "../state.js";
import { jobStore } from "../store.js";
import { logger } from "../logger.js";

function evaluate(
  budget_sats: number,
  steps: Step[],
  candidates: OrchestratorStateType["candidates"]
): CfoVerdict {
  const total = steps.reduce((sum, s) => sum + s.estimate_sats, 0);

  // Rule 1: over budget
  if (total * 1.2 > budget_sats) {
    return {
      kind: "REVISE",
      reason: "over_budget",
      detail: `Estimated total ${total} sats × 1.2 = ${Math.ceil(total * 1.2)} exceeds budget ${budget_sats} sats.`,
    };
  }

  // Rule 2: single step too large
  for (const step of steps) {
    if (step.estimate_sats > 0.4 * budget_sats) {
      return {
        kind: "REVISE",
        reason: "step_too_large",
        detail: `Step ${step.dag_node} costs ${step.estimate_sats} sats which exceeds 40% of budget (${Math.floor(0.4 * budget_sats)} sats).`,
      };
    }
  }

  // Rule 3: untrusted worker
  for (const step of steps) {
    const candidate = candidates.find((c) => c.worker_id === step.primary_worker_id);
    if (candidate) {
      const stake = candidate.stake_sats ?? 0;
      if (candidate.total_jobs < 5 && stake < 2 * step.estimate_sats) {
        return {
          kind: "REVISE",
          reason: "untrusted_worker",
          detail: `Worker ${candidate.display_name} (${step.primary_worker_id}) has only ${candidate.total_jobs} total jobs and stake ${stake} sats < ${2 * step.estimate_sats} sats required.`,
        };
      }
    }
  }

  // Rule 4: user confirmation required
  const hasHumanStep = steps.some((s) => s.human_required);
  if (total * 1.2 > 0.5 * budget_sats || hasHumanStep) {
    const lines = steps.map(
      (s) => `• ${s.dag_node}: ~${s.estimate_sats} sats (${s.human_required ? "human" : "agent"})`
    );
    return {
      kind: "USER_CONFIRM",
      summary: `Plan requires your approval.\n${lines.join("\n")}\nEstimated total: ~${total} sats (max: ${Math.ceil(total * 1.2)} sats).`,
    };
  }

  return { kind: "APPROVED" };
}

export async function cfoGateNode(
  state: OrchestratorStateType
): Promise<Partial<OrchestratorStateType>> {
  const { job, plan, steps, candidates } = state;
  const log = logger.child({ job_id: job.id, node: "cfo-gate" });

  if (!plan || steps.length === 0) {
    log.error("CFO gate called with no plan");
    const updated = { ...job, status: "failed" as const, updated_at: new Date().toISOString() };
    jobStore.set(job.id, updated);
    return { job: updated, error: "No plan to evaluate." };
  }

  const verdict = evaluate(job.budget_sats, steps, candidates);
  log.info({ verdict }, "CFO verdict");

  if (verdict.kind === "USER_CONFIRM") {
    const awaiting = { ...job, status: "awaiting_user" as const, updated_at: new Date().toISOString() };
    jobStore.set(job.id, awaiting);

    const confirmed: boolean = interrupt({ kind: "confirm", summary: verdict.summary });

    if (!confirmed) {
      const cancelled = { ...job, status: "cancelled" as const, updated_at: new Date().toISOString() };
      jobStore.set(job.id, cancelled);
      return { job: cancelled, cfo_verdict: verdict };
    }

    const executing = { ...job, status: "executing" as const, updated_at: new Date().toISOString() };
    jobStore.set(job.id, executing);
    return { job: executing, cfo_verdict: { kind: "APPROVED" } };
  }

  return { cfo_verdict: verdict };
}
