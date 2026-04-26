import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Step, CapabilityTag } from "@agentmkt/contracts";
import { chatCompletion } from "@agentmkt/llm";
import { hub } from "../clients/hub.js";
import { marketplace } from "../clients/marketplace.js";
import type { OrchestratorStateType } from "../state.js";
import { jobStore } from "../store.js";
import { logger } from "../logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const systemPrompt = readFileSync(
  join(__dirname, "../../prompts/synthesizer-system.txt"),
  "utf8"
);

function serializeResult(step: Step): string {
  if (!step.result) return "(no result)";
  if (step.result.kind === "text") return step.result.text;
  if (step.result.kind === "json") return JSON.stringify(step.result.data, null, 2);
  if (step.result.kind === "file") return `File: ${step.result.storage_url}`;
  return "(unknown result type)";
}

export async function synthesizerNode(
  state: OrchestratorStateType
): Promise<Partial<OrchestratorStateType>> {
  const { job, steps, plan } = state;
  const log = logger.child({ job_id: job.id, node: "synthesizer" });

  log.info("Synthesizer started");

  // Build context from successful steps
  const succeededSteps = steps.filter((s) => s.status === "succeeded");
  const stepOutputs = succeededSteps
    .map((s) => `Step [${s.dag_node}]:\n${serializeResult(s)}`)
    .join("\n\n");

  let finalOutput = "";
  try {
    const result = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Original user prompt: ${job.prompt}\n\nStep outputs:\n${stepOutputs}`,
        },
      ],
      { temperature: 0.3 }
    );
    finalOutput = result.content;
  } catch (err) {
    log.error({ err }, "Synthesis LLM call failed");
    finalOutput = stepOutputs || "Task completed but synthesis failed.";
  }

  // Fire rating prompts for all succeeded steps via verifier signal
  for (const step of succeededSteps) {
    try {
      await marketplace.rate({
        worker_id: step.primary_worker_id,
        capability_tag: step.capability_tag as CapabilityTag,
        job_id: job.id,
        step_id: step.id,
        source: "system",
        score: 1,
        reason: "Step succeeded and verified",
      });
    } catch (err) {
      log.warn({ err, step_id: step.id }, "Rating submission failed");
    }
  }

  // Refund any unspent topup balance — cancel the topup hold if still available
  try {
    const balance = await hub.jobBalance(job.id);
    if (balance.available_sats > 0) {
      log.info({ available_sats: balance.available_sats }, "Refunding unspent balance");
      // No direct refund endpoint per spec; the hub manages this on its side.
      // TODO(P1): coordinate with P2 to confirm the refund flow for leftover sats.
    }
  } catch (err) {
    log.warn({ err }, "Balance check failed");
  }

  const completed = { ...job, status: "completed" as const, updated_at: new Date().toISOString() };
  jobStore.set(job.id, completed);

  log.info("Job completed");

  return { job: completed, final_output: finalOutput };
}
