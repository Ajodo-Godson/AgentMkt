import { chatCompletion } from "@agentmkt/llm";
import type { Job, CapabilityTag } from "@agentmkt/contracts";
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

const VALID_CAPABILITY_TAGS = new Set<CapabilityTag>([
  "summarization",
  "translation_es",
  "translation_fr",
  "translation_de",
  "tts_en",
  "tts_fr",
  "image_generation",
  "code_review",
  "fact_check",
  "voiceover_human",
  "creative_writing_human",
]);

function normalizeCapabilityTags(tags: string[]): CapabilityTag[] {
  return tags.filter(
    (tag): tag is CapabilityTag => VALID_CAPABILITY_TAGS.has(tag as CapabilityTag)
  );
}

function inferCapabilityTagsFromPrompt(prompt: string): CapabilityTag[] {
  const lower = prompt.toLowerCase();
  const tags: CapabilityTag[] = [];

  const asksForWriting =
    /\b(write|draft|author|compose|essay|article|blog post|blogpost|story)\b/.test(lower);
  const asksForSummary =
    /\b(summarize|summarise|summary|recap|tl;dr)\b/.test(lower);
  const asksForImage =
    /\b(image|illustration|picture|poster|generate an image)\b/.test(lower);
  const asksForCodeReview =
    /\b(code review|review this code|review code)\b/.test(lower);
  const asksForFactCheck =
    /\b(fact check|fact-check|verify facts|check facts)\b/.test(lower);
  const asksForVoiceover =
    /\b(voiceover|native speaker|record|spoken audio)\b/.test(lower);
  const asksForTts =
    /\b(text to speech|tts|voice synthesis|spoken version)\b/.test(lower);
  const asksForTranslation =
    /\btranslate|translation\b/.test(lower);

  if (asksForWriting) tags.push("creative_writing_human");
  if (asksForSummary) tags.push("summarization");
  if (asksForImage) tags.push("image_generation");
  if (asksForCodeReview) tags.push("code_review");
  if (asksForFactCheck) tags.push("fact_check");
  if (asksForVoiceover) tags.push("voiceover_human");
  if (asksForTts) tags.push("tts_en");

  if (asksForTranslation) {
    if (/\bfrench|fran[cç]ais|fr\b/.test(lower)) tags.push("translation_fr");
    if (/\bspanish|espa[nñ]ol|es\b/.test(lower)) tags.push("translation_es");
    if (/\bgerman|deutsch|de\b/.test(lower)) tags.push("translation_de");
  }

  return Array.from(new Set(tags));
}

function reconcileCapabilityTags(prompt: string, extracted: string[]): CapabilityTag[] {
  const inferred = inferCapabilityTagsFromPrompt(prompt);
  if (inferred.length > 0) return inferred;
  return normalizeCapabilityTags(extracted);
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

  // Read the job's funded escrow balance — this is the CFO's effective budget ceiling.
  let wallet_balance_sats = 0;
  try {
    const balance = await hub.jobBalance(job.id);
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
  const requested_capability_tags = reconcileCapabilityTags(
    job.prompt,
    extraction.capability_tags
  );

  const updated: Job = {
    ...job,
    status: "planning",
    updated_at: new Date().toISOString(),
  };
  jobStore.set(job.id, updated);

  return {
    job: updated,
    wallet_balance_sats,
    intake_intent: extraction.intent,
    requested_capability_tags,
    request_constraints: extraction.constraints ?? {},
  };
}
