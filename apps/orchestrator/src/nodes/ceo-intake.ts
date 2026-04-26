import { chatCompletion } from "@agentmkt/llm";
import type { Job } from "@agentmkt/contracts";
import { hub } from "../clients/hub.js";
import type { OrchestratorStateType } from "../state.js";
import { jobStore } from "../store.js";
import { logger } from "../logger.js";

interface IntentExtraction {
  intent: string;
  capability_tags: string[];
  constraints: Record<string, unknown>;
  needs_clarification: boolean;
  clarification_question?: string;
}

async function extractIntent(prompt: string): Promise<IntentExtraction> {
  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `You are the CEO intake agent for a Lightning Network AI agent marketplace.
Analyse the user's request and extract structured intent.

Respond with JSON only:
{
  "intent": "<one-sentence summary of what the user wants>",
  "capability_tags": ["<one or more of: summarization, translation_es, translation_fr, translation_de, tts_en, tts_fr, image_generation, code_review, fact_check, voiceover_human, creative_writing_human>"],
  "constraints": { "<key>": "<value>" },
  "needs_clarification": false,
  "clarification_question": null
}

If the request is ambiguous (missing target language, missing source material, etc.), set needs_clarification: true and provide a clarification_question.`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    { jsonMode: true, temperature: 0.1 }
  );

  return JSON.parse(result.content) as IntentExtraction;
}

export async function ceoIntakeNode(
  state: OrchestratorStateType
): Promise<Partial<OrchestratorStateType>> {
  let { job } = state;
  const log = logger.child({ job_id: job.id, node: "ceo-intake" });

  log.info("CEO intake started");

  // Read the user's wallet balance — this is the CFO's effective budget ceiling.
  let wallet_balance_sats = 0;
  try {
    const balance = await hub.walletBalance(job.user_id);
    wallet_balance_sats = balance.available_sats;
    log.info({ wallet_balance_sats }, "Wallet balance fetched");
  } catch (err) {
    log.error({ err }, "Failed to fetch wallet balance — proceeding with 0");
  }

  // Extract intent from the prompt
  let extraction: IntentExtraction;
  try {
    extraction = await extractIntent(job.prompt);
  } catch (err) {
    log.error({ err }, "Intent extraction failed");
    const updated: Job = { ...job, status: "failed", updated_at: new Date().toISOString() };
    jobStore.set(job.id, updated);
    return { job: updated, error: "Failed to understand your request. Please try again." };
  }

  log.info({ extraction }, "Intent extracted");

  // Clarification is suppressed for demo — CEO proceeds with available info.
  // COO will note missing details as plan assumptions.

  const updated: Job = {
    ...job,
    status: "planning",
    updated_at: new Date().toISOString(),
  };
  jobStore.set(job.id, updated);

  return {
    job: updated,
    wallet_balance_sats,
  };
}
