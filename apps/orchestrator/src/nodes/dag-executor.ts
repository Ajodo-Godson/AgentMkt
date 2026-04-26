// Walks the DAG and executes each step: hold → forward → verify → settle/cancel.
// Phase 1: sequential execution. TODO(P1): refactor to LangGraph Send fan-out in Phase 3.
import type { Step, StepResult, CapabilityTag } from "@agentmkt/contracts";
import type { OrchestratorStateType } from "../state.js";
import { hub } from "../clients/hub.js";
import { marketplace } from "../clients/marketplace.js";
import { jobStore, planStore } from "../store.js";
import { logger } from "../logger.js";

function getReadySteps(steps: Step[]): Step[] {
  return steps.filter(
    (s) =>
      s.status === "pending" &&
      s.depends_on.every((depId) => {
        const dep = steps.find((d) => d.id === depId);
        return dep?.status === "succeeded" || dep?.status === "skipped";
      })
  );
}

async function executeStep(
  step: Step,
  job_id: string,
  allSteps: Step[],
  candidates: import("@agentmkt/contracts").WorkerCandidate[],
  log: ReturnType<typeof logger.child>
): Promise<Step> {
  let current = { ...step, status: "running" as const };
  log.info({ step_id: step.id, dag_node: step.dag_node }, "Executing step");

  let holdInvoiceId = "";
  const workersToTry = [step.primary_worker_id, ...step.fallback_ids];

  for (let attempt = 0; attempt <= step.retries_left; attempt++) {
    const retryWorkerId = workersToTry[Math.min(attempt, workersToTry.length - 1)];

    // Re-resolve endpoint for this attempt's worker (covers fallback workers too).
    const retryCandidate = candidates.find((c) => c.worker_id === retryWorkerId);
    const supplierEndpoint =
      retryCandidate?.endpoint_url ??
      `${process.env.HUB_BASE_URL ?? "http://localhost:4002"}/__supplier/${retryWorkerId}`;

    try {
      // 1. Hold funds — enforce minimum ceiling so hub never receives a 0-sat hold
      const held = await hub.hold({
        job_id,
        step_id: step.id,
        ceiling_sats: Math.max(step.ceiling_sats, 110),
      });
      holdInvoiceId = held.hold_invoice_id;

      // 2. Forward to supplier (hub handles L402)
      let forwardResult: { result: unknown; paid_to_supplier_sats: number; fee_sats: number };

      if (step.human_required) {
        // Human-required steps: notify via hub, then poll for human-submit
        const worker = { telegram_chat_id: null as string | null };
        // TODO(P1): look up telegram_chat_id from candidates/worker registry
        await hub.notifyHuman({
          hold_invoice_id: holdInvoiceId,
          telegram_chat_id: worker.telegram_chat_id ?? "000000",
          brief: `Please complete: ${step.dag_node}`,
          payout_sats: step.estimate_sats,
        });
        // Human result arrives via hub/human-submit; poll hub for it.
        // For Phase 1 mocks, forward mock returns immediately.
        forwardResult = await hub.forward({
          hold_invoice_id: holdInvoiceId,
          supplier_endpoint: supplierEndpoint,
          supplier_payload: { step_id: step.id, spec: step.dag_node },
        });
      } else {
        forwardResult = await hub.forward({
          hold_invoice_id: holdInvoiceId,
          supplier_endpoint: supplierEndpoint,
          supplier_payload: { step_id: step.id, spec: step.dag_node },
        });
      }

      // 3. Verify result (skip when hub is mocked — result is mock data, real verify would reject it)
      const result = forwardResult.result as StepResult;
      const hubMocked =
        process.env.USE_MOCKS === "true" || process.env.USE_MOCK_HUB === "true";

      if (!hubMocked) {
        const verifyResp = await marketplace.verify({
          capability_tag: step.capability_tag as CapabilityTag,
          spec: step.dag_node,
          result,
        });

        if (verifyResp.verdict.kind === "PASS") {
          await hub.settle({ hold_invoice_id: holdInvoiceId });
          log.info({ step_id: step.id }, "Step succeeded");
          return { ...current, status: "succeeded", result, retries_left: step.retries_left - attempt };
        }

        if (verifyResp.verdict.kind === "FAIL_FATAL") {
          await hub.cancel({ hold_invoice_id: holdInvoiceId, reason: verifyResp.verdict.reason });
          if (step.optional) {
            log.warn({ step_id: step.id }, "Optional step failed fatally, skipping");
            return { ...current, status: "skipped", error: verifyResp.verdict.reason };
          }
          log.error({ step_id: step.id }, "Step failed fatally");
          return { ...current, status: "failed", error: verifyResp.verdict.reason };
        }

        // FAIL_RETRYABLE — cancel this hold and retry
        await hub.cancel({ hold_invoice_id: holdInvoiceId, reason: verifyResp.verdict.reason });
      } else {
        // Hub mocked: auto-settle and pass
        await hub.settle({ hold_invoice_id: holdInvoiceId });
        log.info({ step_id: step.id }, "Step succeeded (hub mocked, verify skipped)");
        return { ...current, status: "succeeded", result, retries_left: step.retries_left - attempt };
      }
      log.warn({ step_id: step.id, attempt }, "Step retryable fail, retrying");
    } catch (err) {
      log.error({ step_id: step.id, attempt, err }, "Step execution error");
      if (holdInvoiceId) {
        try {
          await hub.cancel({ hold_invoice_id: holdInvoiceId, reason: String(err) });
        } catch {}
      }
    }
  }

  // Exhausted retries
  if (step.optional) {
    return { ...current, status: "skipped", error: "All retries exhausted" };
  }
  return { ...current, status: "failed", error: "All retries exhausted" };
}

export async function dagExecutorNode(
  state: OrchestratorStateType
): Promise<Partial<OrchestratorStateType>> {
  const { job, plan, candidates } = state;
  const log = logger.child({ job_id: job.id, node: "dag-executor" });

  let steps = [...state.steps];

  const executing = { ...job, status: "executing" as const, updated_at: new Date().toISOString() };
  jobStore.set(job.id, executing);

  // Process the DAG in waves until no more ready steps
  let maxWaves = steps.length + 1;
  while (maxWaves-- > 0) {
    const ready = getReadySteps(steps);
    if (ready.length === 0) break;

    // Run ready steps (Phase 1: sequential; Phase 3: use LangGraph Send for parallel)
    for (const step of ready) {
      const result = await executeStep(step, job.id, steps, candidates, log);
      steps = steps.map((s) => (s.id === result.id ? result : s));
      if (plan) {
        planStore.set(plan.id, {
          ...plan,
          steps,
        });
      }
    }

    const anyFailed = steps.some((s) => s.status === "failed");
    if (anyFailed) {
      log.error("One or more required steps failed");
      const failed = { ...job, status: "failed" as const, updated_at: new Date().toISOString() };
      jobStore.set(job.id, failed);
      if (plan) {
        planStore.set(plan.id, {
          ...plan,
          steps,
        });
      }
      return { job: failed, steps, error: "One or more required steps failed." };
    }
  }

  if (plan) {
    planStore.set(plan.id, {
      ...plan,
      steps,
    });
  }

  return { job: executing, steps };
}
