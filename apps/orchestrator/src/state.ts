import { Annotation } from "@langchain/langgraph";
import type { Job, Plan, Step, CfoVerdict, WorkerCandidate } from "@agentmkt/contracts";

export const OrchestratorState = Annotation.Root({
  job: Annotation<Job>(),

  plan: Annotation<Plan | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  steps: Annotation<Step[]>({
    // Merge updated steps by id; used by dag-executor fan-out.
    reducer: (current, updates) => {
      const map = new Map((current ?? []).map((s) => [s.id, s]));
      for (const s of updates ?? []) map.set(s.id, s);
      return Array.from(map.values());
    },
    default: () => [],
  }),

  // Scraped candidates from /discover, keyed per planning iteration.
  candidates: Annotation<WorkerCandidate[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // COO planning iteration counter (max 3).
  plan_iterations: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // CFO verdict from the gate node.
  cfo_verdict: Annotation<CfoVerdict | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // The bolt11 invoice from hub topup — returned to the UI caller.
  hub_bolt11: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Final synthesized response delivered to the buyer.
  final_output: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Non-fatal error message surfaced on the job (job.status = "failed").
  error: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Tracks which step is currently being executed (used by dag-executor sub-node).
  current_step_id: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

export type OrchestratorStateType = typeof OrchestratorState.State;
