// Pure function. NO LLM call. Evaluates plan cost against user wallet balance.
import { interrupt } from "@langchain/langgraph";
import type { CfoVerdict, Step } from "@agentmkt/contracts";
import type { OrchestratorStateType } from "../state.js";
import { jobStore } from "../store.js";
import { logger } from "../logger.js";

// A job is "expensive" if it exceeds this absolute threshold OR 50% of wallet.
const EXPENSIVE_SATS_THRESHOLD = 5_000;

function evaluate(
  wallet_balance_sats: number,
  steps: Step[],
  candidates: OrchestratorStateType["candidates"]
): CfoVerdict {
  const total = steps.reduce((sum, s) => sum + s.estimate_sats, 0);

  // Rule 1: can't afford it — ask COO to replan cheaper
  if (total * 1.2 > wallet_balance_sats) {
    return {
      kind: "REVISE",
      reason: "over_budget",
      detail: `Estimated total ${total} sats × 1.2 = ${Math.ceil(total * 1.2)} exceeds wallet balance ${wallet_balance_sats} sats.`,
    };
  }

  // Rule 2: single step consumes >40% of wallet — too risky, replan
  for (const step of steps) {
    if (step.estimate_sats > 0.4 * wallet_balance_sats) {
      return {
        kind: "REVISE",
        reason: "step_too_large",
        detail: `Step ${step.dag_node} costs ${step.estimate_sats} sats which exceeds 40% of wallet (${Math.floor(0.4 * wallet_balance_sats)} sats).`,
      };
    }
  }

  // Rule 3: untrusted worker without sufficient stake
  for (const step of steps) {
    const candidate = candidates.find((c) => c.worker_id === step.primary_worker_id);
    if (candidate) {
      const stake = (candidate as { stake_sats?: number }).stake_sats ?? 0;
      if (candidate.total_jobs < 5 && stake < 2 * step.estimate_sats) {
        return {
          kind: "REVISE",
          reason: "untrusted_worker",
          detail: `Worker ${candidate.display_name} (${step.primary_worker_id}) has only ${candidate.total_jobs} total jobs and stake ${stake} sats < ${2 * step.estimate_sats} sats required.`,
        };
      }
    }
  }

  // Rule 4: only interrupt the user when the job is genuinely expensive.
  // Threshold: >5000 sats absolute OR >50% of wallet balance.
  const hasHumanStep = steps.some((s) => s.human_required);
  const isExpensive =
    total > EXPENSIVE_SATS_THRESHOLD || total > 0.5 * wallet_balance_sats;

  if (isExpensive || hasHumanStep) {
    const lines = steps.map(
      (s) => `• ${s.dag_node}: ~${s.estimate_sats} sats (${s.human_required ? "human" : "agent"})`
    );
    const reason = hasHumanStep
      ? "This plan includes a human worker step that requires your approval."
      : `Estimated cost ~${total} sats is above the confirmation threshold.`;
    return {
      kind: "USER_CONFIRM",
      summary: `${reason}\n${lines.join("\n")}\nTotal: ~${total} sats (max with buffer: ${Math.ceil(total * 1.2)} sats).`,
    };
  }

  return { kind: "APPROVED" };
}

export async function cfoGateNode(
  state: OrchestratorStateType
): Promise<Partial<OrchestratorStateType>> {
  const { job, plan, steps, candidates, wallet_balance_sats } = state;
  const log = logger.child({ job_id: job.id, node: "cfo-gate" });

  if (!plan || steps.length === 0) {
    log.error("CFO gate called with no plan");
    const updated = { ...job, status: "failed" as const, updated_at: new Date().toISOString() };
    jobStore.set(job.id, updated);
    return { job: updated, error: "No plan to evaluate." };
  }

  const verdict = evaluate(wallet_balance_sats, steps, candidates);
  log.info({ verdict, wallet_balance_sats }, "CFO verdict");

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
