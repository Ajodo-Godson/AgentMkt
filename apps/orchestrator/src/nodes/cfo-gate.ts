// Pure function. NO LLM call. Evaluates plan cost against user wallet balance.
import { interrupt } from "@langchain/langgraph";
import type { CfoVerdict, Step } from "@agentmkt/contracts";
import type { OrchestratorStateType } from "../state.js";
import { jobStore } from "../store.js";
import { logger } from "../logger.js";

function evaluate(
  wallet_balance_sats: number,
  steps: Step[],
  candidates: OrchestratorStateType["candidates"]
): CfoVerdict {
  const total = steps.reduce((sum, s) => sum + s.estimate_sats, 0);

  // Rule 1: the only time CFO talks to the user is when the proposal exceeds wallet.
  if (total * 1.2 > wallet_balance_sats) {
    const lines = steps.map(
      (s) => `- ${s.dag_node}: ~${s.estimate_sats} sats`
    );
    return {
      kind: "USER_CONFIRM",
      summary:
        `The COO's proposed spend exceeds the current wallet balance.\n` +
        `${lines.join("\n")}\n` +
        `Total: ~${total} sats (max with buffer: ${Math.ceil(total * 1.2)} sats).\n` +
        `Wallet balance: ${wallet_balance_sats} sats.`,
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

  // Rule 3: untrusted worker without sufficient stake (internal workers are exempt)
  for (const step of steps) {
    const candidate = candidates.find((c) => c.worker_id === step.primary_worker_id);
    if (candidate && candidate.source !== "internal") {
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

    // User confirmed: proceed to execution with an APPROVED verdict
    return { cfo_verdict: { kind: "APPROVED" } };
  }

  return { cfo_verdict: verdict };
}
