import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { OrchestratorState } from "./state.js";
import { ceoIntakeNode } from "./nodes/ceo-intake.js";
import { cooPlannnerNode } from "./nodes/coo-planner.js";
import { cfoGateNode } from "./nodes/cfo-gate.js";
import { dagExecutorNode } from "./nodes/dag-executor.js";
import { synthesizerNode } from "./nodes/synthesizer.js";
import type { OrchestratorStateType } from "./state.js";

// ─── Routing functions ────────────────────────────────────────────────────────

function routeAfterIntake(state: OrchestratorStateType): string {
  if (state.job.status === "failed" || state.job.status === "cancelled") return "end_failed";
  return "coo_planner";
}

function routeAfterCfo(state: OrchestratorStateType): string {
  const verdict = state.cfo_verdict;
  if (!verdict) return "end_failed";

  if (verdict.kind === "APPROVED") return "dag_executor";
  if (verdict.kind === "REVISE") {
    // Exceeded max iterations? fail.
    if ((state.plan_iterations ?? 0) >= 3) return "end_failed";
    return "coo_planner";
  }
  // USER_CONFIRM: interrupt is handled inside cfo_gate; when resumed it returns APPROVED or cancelled
  if (state.job.status === "cancelled") return "end_failed";
  return "dag_executor";
}

function routeAfterExecution(state: OrchestratorStateType): string {
  if (state.job.status === "failed") return "end_failed";
  return "synthesizer";
}

// ─── Build the graph ──────────────────────────────────────────────────────────

const workflow = new StateGraph(OrchestratorState)
  .addNode("ceo_intake", ceoIntakeNode)
  .addNode("coo_planner", cooPlannnerNode)
  .addNode("cfo_gate", cfoGateNode)
  .addNode("dag_executor", dagExecutorNode)
  .addNode("synthesizer", synthesizerNode)
  // Dummy end node for failure path so conditional edges have a named target
  .addNode("end_failed", async (state) => state);

// Edges
workflow
  .addEdge(START, "ceo_intake")
  .addConditionalEdges("ceo_intake", routeAfterIntake, {
    coo_planner: "coo_planner",
    end_failed: "end_failed",
  })
  .addEdge("coo_planner", "cfo_gate")
  .addConditionalEdges("cfo_gate", routeAfterCfo, {
    dag_executor: "dag_executor",
    coo_planner: "coo_planner",
    end_failed: "end_failed",
  })
  .addConditionalEdges("dag_executor", routeAfterExecution, {
    synthesizer: "synthesizer",
    end_failed: "end_failed",
  })
  .addEdge("synthesizer", END)
  .addEdge("end_failed", END);

// Compile with MemorySaver for Phase 1 persistence + interrupt support
const checkpointer = new MemorySaver();

export const graph = workflow.compile({ checkpointer });
